"use client";

/* eslint-disable @next/next/no-img-element -- project photos come from arbitrary hosts */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Stack, router, useLocalSearchParams } from "@/components/collections/nav";
import { ActivityIndicator } from "@/components/collections/rn";
import { C, Empty, NotLiveYet } from "@/components/collections/ui";
import InfoTip from "@/components/ui/InfoTip";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useWallet } from "@/contexts/WalletContext";
import { useCollections } from "@/hooks/useCollections";
import { amountForShares, bpsToPercent, formatAmount, ownershipBps, parseAmount, sharesForAmount } from "@/services/collections/money";
import { DEFAULT_TOKEN } from "@/config/tokens";
import { RAISE_CONTRACT_ID, raiseAllowsWithdraw } from "@/config/collections";
import {
  getChainSharesSold,
  getRaiseChainState,
  getRaiseTerms,
  getStablecoinBalance,
  type RaiseCandidate,
  type RaiseTerms,
} from "@/services/collections/chain";
import { DEFAULT_FEE_BPS, perPeriod, rentRangeOf, yearlyRentFor } from "@/services/collections/rent";
import { INFO, INVEST_RISKS, PROJECT_TYPE_TEXT } from "@/services/collections/copy";
import apiService, { type CollectionProjectDetail, type CollectionUnit } from "@/services/api";
import { useRoundStatus } from "@/hooks/useRoundStatus";

type Step = "flat" | "amount" | "terms" | "check" | "done";

/**
 * Investing, one decision at a time: which flat, how much, the terms, then
 * a last look before signing.
 *
 * The amount screen shows what the money buys as it is typed: whole shares
 * (the contract sells no fractions), the share of the flat, and the rent
 * that could bring. The terms step puts the project pack, the manager's
 * pledge and the risks in front of the investor and asks them to say they
 * read them, because on a decentralized marketplace nobody can undo the
 * payment afterwards.
 *
 * The commit itself is unchanged: the amount goes to the raise contract,
 * which decides whether it fits, and a commitment that fills the raise also
 * closes it.
 */
export default function ChooseUnit() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { getProject, commit, closeRaise, loading, error, capabilities, connected } = useCollections();
  const { walletState } = useWallet();
  const accountId = walletState.account?.accountId ?? null;
  const { formatPrice, formatUsd, selectedCurrency } = useCurrency();

  const [project, setProject] = useState<CollectionProjectDetail | null>(null);
  const [step, setStep] = useState<Step>("flat");
  const [selected, setSelected] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  // Investors can say how many shares they want instead of working out the
  // dollar figure that buys them. In "shares" mode the typed count is the
  // source of truth and the cost follows from it, never the other way round:
  // dollars to shares and back again rounds down twice and can lose one.
  const [mode, setMode] = useState<"amount" | "shares">("amount");
  const [shareInput, setShareInput] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [popup, setPopup] = useState<string | null>(null);
  const [readPack, setReadPack] = useState(false);
  const [readRisks, setReadRisks] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  // v5 raises: the managers investors choose between, and this investor's pick.
  const [terms, setTerms] = useState<RaiseTerms | null>(null);
  const [vote, setVote] = useState<string | null>(null);

  const token = DEFAULT_TOKEN;
  const money = (atomic: bigint | string) => {
    const usd = Number(BigInt(atomic)) / 1_000_000;
    return selectedCurrency === "USD" ? formatUsd(usd) : `${formatPrice(usd)} (${formatUsd(usd)})`;
  };

  const load = useCallback(async () => {
    const result = await getProject(String(slug));
    if (!result) return;
    try {
      const sold = await getChainSharesSold(result.escrow_account_id || RAISE_CONTRACT_ID, result.slug);
      result.unit_list = result.unit_list.map((u) => (sold[u.code] != null ? { ...u, shares_sold: sold[u.code] } : u));
    } catch {
      /* keep the backend's figures */
    }
    setProject(result);
    setTerms(await getRaiseTerms(result.slug).catch(() => null));
  }, [getProject, slug]);

  useEffect(() => {
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    getStablecoinBalance(token, accountId)
      .then((b) => alive && setBalance(b))
      .catch(() => alive && setBalance(null));
    return () => {
      alive = false;
    };
  }, [accountId, token, txHash]);

  const unit: CollectionUnit | null = project?.unit_list.find((u) => u.code === selected) ?? null;
  // Past its deadline a round is closed, whatever the backend still says.
  const roundStatus = useRoundStatus(project?.slug, project?.status);
  const atomic = useMemo(() => (amount ? parseAmount(amount, token) : null), [amount, token]);

  if (!project) {
    return (
      <>
        <Stack.Screen options={{ title: "Invest" }} />
        <div className="flex justify-center py-16">
          {loading ? <ActivityIndicator color={C.primary} /> : <Empty title="We could not find that project" body={error ?? "Go back and retry."} />}
        </div>
      </>
    );
  }

  const escrow = project.escrow_account_id || RAISE_CONTRACT_ID;
  const open = roundStatus === "open";

  // ---- amount arithmetic --------------------------------------------------
  const shares =
    mode === "shares"
      ? String(BigInt(shareInput || "0"))
      : unit && atomic
        ? sharesForAmount(atomic, unit.price_atomic, unit.total_shares)
        : "0";
  const available = unit ? BigInt(unit.total_shares || "0") - BigInt(unit.shares_sold || "0") : 0n;
  const oneShare = unit ? BigInt(amountForShares("1", unit.price_atomic, unit.total_shares)) : 0n;
  const projectMin = BigInt(project.min_investment_atomic || "0");
  const minimum = oneShare > projectMin ? oneShare : projectMin;
  // What the shares actually cost; anything left over is not sent.
  const cost = unit ? BigInt(amountForShares(shares, unit.price_atomic, unit.total_shares)) : 0n;
  const atomicBig = mode === "shares" ? cost : atomic ? BigInt(atomic) : 0n;
  // The most this person can buy: what is left in the flat, and no more than
  // their wallet covers when its balance is known.
  const affordable =
    unit && balance !== null ? BigInt(sharesForAmount(balance.toString(), unit.price_atomic, unit.total_shares)) : null;
  const leftInFlat = available > 0n ? available : 0n;
  const maxBuy = affordable !== null && affordable < leftInFlat ? affordable : leftInFlat;
  const walletLimits = affordable !== null && affordable < leftInFlat;
  // Typed money for a cost, with every decimal the coin has, so typing it
  // back buys the same number of shares.
  const plain = (atomicAmount: bigint) => formatAmount(atomicAmount, token, 6).replace(/,/g, "");
  const setByShares = (n: bigint) => {
    if (!unit) return;
    setShareInput(n > 0n ? n.toString() : "");
    setAmount(n > 0n ? plain(BigInt(amountForShares(n.toString(), unit.price_atomic, unit.total_shares))) : "");
  };
  const switchMode = (next: "amount" | "shares") => {
    if (next === mode) return;
    if (next === "shares") setShareInput(shares === "0" ? "" : shares);
    else setAmount(cost > 0n ? plain(cost) : "");
    setMode(next);
  };
  const tooMany = BigInt(shares || "0") > available;
  const short = balance !== null && cost > balance;
  // A vote is asked for only when there is a real choice.
  const choosing = Boolean(open && terms && terms.candidates.length > 1);
  const nominationFor = (c: RaiseCandidate) =>
    project.nominations?.find((n) => n.profile?.near_account_id === c.account) ?? null;
  const candidateName = (c: RaiseCandidate) => nominationFor(c)?.profile?.display_name ?? c.account;
  const chosen = terms?.candidates.find((c) => c.account === vote) ?? (terms && terms.candidates.length === 1 ? terms.candidates[0] : null);
  // The chosen manager's fee plus the vault's 5% reserve and Sheda's 2%.
  const feeBps = chosen ? chosen.fee_bps + 700 : DEFAULT_FEE_BPS;
  const range = unit ? rentRangeOf(unit) : null;
  const rent = range && unit ? perPeriod(yearlyRentFor(BigInt(shares || "0"), BigInt(unit.total_shares), range, feeBps), "month") : null;
  const pack = project.documents.find((d) => d.is_pack && d.file_url);
  const pledgeOf =
    (chosen ? nominationFor(chosen)?.pledge : null) ??
    project.manager?.pledge ??
    project.nominations?.find((n) => n.status === "accepted")?.pledge ??
    null;

  const continueFromAmount = () => {
    if (atomicBig <= 0n || atomicBig < minimum) {
      setPopup(`The minimum on this listing is ${money(minimum)}. Please increase the amount and try again.`);
      return;
    }
    if (tooMany) {
      setPopup(`Only ${available.toString()} shares are left in ${unit?.label}. Try a smaller amount.`);
      return;
    }
    if (choosing && !vote) {
      setPopup("Choose the property manager you want for this building.");
      return;
    }
    setStep("terms");
  };

  const onCommit = async () => {
    if (!unit || cost <= 0n || !escrow) return;
    const result = await commit({
      stablecoin: token,
      escrowAccountId: escrow,
      amountAtomic: cost.toString(),
      projectSlug: project.slug,
      unitCode: unit.code,
      vote: choosing ? vote : null,
    });
    if (result.success) {
      setTxHash(result.transactionHash ?? "submitted");
      setStep("done");
      // Follow the building so its progress reaches this investor.
      void apiService.watchCollectionProject(project.slug);
      try {
        const state = await getRaiseChainState(project.slug);
        if (state && state.status === "Open" && BigInt(state.raised) >= BigInt(state.target)) {
          await closeRaise(project.slug);
        }
      } catch {
        /* the project page offers "Close the raise" */
      }
      load();
    }
  };

  const back = () => {
    if (step === "amount") setStep("flat");
    else if (step === "terms") setStep("amount");
    else if (step === "check") setStep("terms");
    else router.back();
  };


  const stepNo = { flat: 1, amount: 2, terms: 3, check: 4, done: 4 }[step];

  return (
    <>
      <Stack.Screen options={{ title: "Invest" }} />
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-5 pb-36 pt-4">
        {step !== "done" ? (
          <div className="flex items-center gap-3">
            {step !== "flat" ? (
              <button type="button" onClick={back} aria-label="Back" className="rounded-full bg-gray-100 p-2">
                <ArrowLeft size={16} />
              </button>
            ) : null}
            <div className="flex flex-1 gap-1" aria-label={`Step ${stepNo} of 4`}>
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className={`h-1 flex-1 rounded-full ${n <= stepNo ? "bg-primary" : "bg-gray-200"}`} />
              ))}
            </div>
          </div>
        ) : null}

        {/* The building being invested in, on every step. */}
        <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
            {project.cover_image_url ? <img src={project.cover_image_url} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-primaryText">{project.name}</p>
            <p className="truncate text-sm text-secondaryText">
              {unit ? `${unit.label} · ${money(oneShare)} a share` : project.location}
            </p>
          </div>
          {unit ? <Check size={18} className="text-primary" aria-label="Selected" /> : null}
        </div>

        {!open && step !== "done" ? (
          <p className="rounded-xl bg-brandTint px-3 py-2 text-sm text-brandInk">
            This round is not taking money right now. You can still look at the flats.
          </p>
        ) : null}

        {/* ---- 1. flat ---- */}
        {step === "flat" ? (
          <>
            <div>
              <h1 className="text-2xl font-bold text-primaryText">Which flat?</h1>
              <p className="text-sm text-secondaryText">You buy shares in one flat and earn from that flat&apos;s rent.</p>
            </div>
            <div className="space-y-2">
              {project.unit_list.map((u) => {
                const total = BigInt(u.total_shares || "0");
                const pct = total > 0n ? Number((BigInt(u.shares_sold || "0") * 100n) / total) : 0;
                const full = pct >= 100;
                const on = selected === u.code;
                const r = rentRangeOf(u);
                return (
                  <button
                    key={u.code}
                    type="button"
                    disabled={full}
                    onClick={() => setSelected(u.code)}
                    aria-pressed={on}
                    className={`w-full rounded-2xl border p-5 text-left disabled:opacity-50 ${on ? "border-2 border-primary bg-primaryLight" : "border-borderColor"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-primaryText">{u.label}</p>
                        <p className="text-sm text-secondaryText">
                          {u.bedrooms} bed · {money(u.price_atomic)} whole flat
                        </p>
                        {r ? <p className="text-sm text-secondaryText">Lets for {money(r.min)} – {money(r.max)} a year (est.)</p> : null}
                      </div>
                      <span className={`text-sm font-medium ${full ? "text-secondaryText" : "text-primary"}`}>{full ? "Full" : `${pct}% funded`}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
            {project.unit_list.length === 0 ? <Empty title="No flats listed yet" body="The builder has not published the flats." /> : null}
          </>
        ) : null}

        {/* ---- 2. amount ---- */}
        {step === "amount" && unit ? (
          <>
            <div className="mx-auto flex w-fit rounded-xl bg-gray-100 p-1 text-sm" role="group" aria-label="Enter by">
              {(["amount", "shares"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => switchMode(m)}
                  className={`rounded-lg px-4 py-1.5 ${mode === m ? "bg-white font-medium text-primaryText shadow-sm" : "text-secondaryText"}`}
                >
                  {m === "amount" ? "Amount ($)" : "Shares"}
                </button>
              ))}
            </div>

            <div className="text-center">
              {mode === "amount" ? (
                <>
                  <p className="text-sm text-secondaryText">How much do you want to invest? (USD)</p>
                  <input
                    aria-label="Amount to invest in US dollars"
                    inputMode="decimal"
                    value={amount ? `$${amount}` : ""}
                    placeholder="$0"
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    className="mt-1 w-full bg-transparent text-center text-4xl font-bold text-primaryText outline-none placeholder:text-gray-300"
                  />
                </>
              ) : (
                <>
                  <p className="text-sm text-secondaryText">How many shares do you want?</p>
                  <input
                    aria-label="Number of shares to buy"
                    inputMode="numeric"
                    value={shareInput}
                    placeholder="0"
                    onChange={(e) => setShareInput(e.target.value.replace(/[^0-9]/g, "").slice(0, 9))}
                    className="mt-1 w-full bg-transparent text-center text-4xl font-bold text-primaryText outline-none placeholder:text-gray-300"
                  />
                  {cost > 0n ? <p className="text-sm text-secondaryText">costs {money(cost)}</p> : null}
                </>
              )}
              {selectedCurrency !== "USD" && atomicBig > 0n ? (
                <p className="text-sm text-secondaryText">about {formatPrice(Number(atomicBig) / 1_000_000)}</p>
              ) : null}
            </div>

            {/* Drag to any number of shares, or take the most there is. */}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs text-secondaryText">
                <span>
                  {leftInFlat.toLocaleString()} of {BigInt(unit.total_shares || "0").toLocaleString()} shares still available
                </span>
                <button
                  type="button"
                  disabled={maxBuy <= 0n}
                  onClick={() => setByShares(maxBuy)}
                  className="shrink-0 rounded-lg border border-primary px-3 py-1 font-semibold text-primary disabled:opacity-40"
                >
                  Max
                </button>
              </div>
              {maxBuy > 0n ? (
                <input
                  type="range"
                  aria-label="Number of shares"
                  min={1}
                  max={Number(maxBuy)}
                  step={1}
                  value={Math.min(Math.max(Number(shares || "0"), 1), Number(maxBuy))}
                  onChange={(e) => setByShares(BigInt(e.target.value))}
                  className="w-full accent-primary"
                />
              ) : null}
              {walletLimits ? (
                <p className="text-xs text-secondaryText">
                  Max is {maxBuy.toLocaleString()} share{maxBuy === 1n ? "" : "s"}, what your wallet covers.
                </p>
              ) : null}
            </div>

            <dl className="space-y-3 rounded-2xl bg-cardBackground p-5 text-[15px]">
              <Row label="Shares you get" info={INFO.shares} value={`${shares}`} />
              <Row label="Of the flat" info={INFO.ownership} value={bpsToPercent(ownershipBps(shares, unit.total_shares))} />
              <Row label="Price per share" value={money(oneShare)} />
              <Row label="Minimum" value={money(minimum)} />
              {rent ? <Row label="Possible rent" value={`${money(rent.min)} – ${money(rent.max)} a month`} /> : null}
              {balance !== null ? (
                <Row label="In your wallet" value={money(balance)} tone={short ? "bad" : undefined} />
              ) : null}
            </dl>
            {choosing && terms ? (
              <section className="space-y-2">
                <p className="inline-flex items-center gap-1 text-sm font-medium text-primaryText">
                  Choose the property manager
                  <InfoTip label="About choosing the manager" readMore={{ href: "/help/how-a-raise-works" }}>
                    The builder suggested these managers. Investors vote with their money, and the one with the most
                    votes when the round fills inspects each building phase and runs the flats. You can change your
                    vote until then.
                  </InfoTip>
                </p>
                {terms.candidates.map((c) => {
                  const on = vote === c.account;
                  return (
                    <button
                      key={c.account}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setVote(c.account)}
                      className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${
                        on ? "border-2 border-primary bg-primaryLight" : "border-borderColor"
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-medium text-primaryText">{candidateName(c)}</span>
                        {c.self_managed ? (
                          <span className="block text-xs text-brandInk">The builder&apos;s own company</span>
                        ) : null}
                      </span>
                      <span className="text-sm text-secondaryText">{c.fee_bps / 100}% of rent</span>
                    </button>
                  );
                })}
              </section>
            ) : null}

            {short ? (
              <p className="text-sm text-red-700">
                Your wallet has less than this.{" "}
                <Link href="/wallet" className="font-medium underline">
                  Add funds
                </Link>
              </p>
            ) : null}
            {mode === "amount" && cost > 0n && cost < atomicBig ? (
              <p className="text-sm text-secondaryText">
                Shares are whole, so {money(cost)} is used and the rest stays in your wallet.
              </p>
            ) : null}

          </>
        ) : null}

        {/* ---- 3. terms ---- */}
        {step === "terms" && unit ? (
          <>
            <h1 className="text-2xl font-bold text-primaryText">Before you invest</h1>
            <section className="space-y-3 rounded-2xl bg-white p-5 text-[15px] leading-relaxed text-secondaryText shadow-[0_4px_18px_rgba(0,0,0,0.07)]">
              <p className="font-medium text-primaryText">What you are buying</p>
              <p>
                {shares} share{shares === "1" ? "" : "s"} of {unit.label}, {bpsToPercent(ownershipBps(shares, unit.total_shares))} of
                that flat: its rent and a say in who manages it. Your money waits in the raise contract until the round
                fills; if it does not fill by the deadline, you get it all back.
                {raiseAllowsWithdraw(project.escrow_account_id) ? " You can take it out while the round is filling, except in its last 7 days." : ""}
              </p>
            </section>
            <section className="space-y-3 rounded-2xl bg-white p-5 text-[15px] shadow-[0_4px_18px_rgba(0,0,0,0.07)]">
              <p className="font-medium text-primaryText">The builder&apos;s project pack</p>
              {pack ? (
                <a href={pack.file_url as string} target="_blank" rel="noreferrer" className="font-medium text-primary">
                  Open the project pack
                </a>
              ) : (
                <p className="text-brandInk">The builder has not uploaded the project pack yet.</p>
              )}
              {pledgeOf ? (
                <details className="text-secondaryText">
                  <summary className="cursor-pointer font-medium text-primary">Read the manager&apos;s pledge</summary>
                  <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed">{pledgeOf}</pre>
                </details>
              ) : null}
            </section>
            <section className="space-y-3 rounded-2xl bg-white p-5 text-[15px] shadow-[0_4px_18px_rgba(0,0,0,0.07)]">
              <p className="font-medium text-primaryText">The main risks</p>
              <ul className="list-disc space-y-1 pl-4 text-secondaryText">
                {INVEST_RISKS.map((r) => (
                  <li key={r.title}>{r.title}</li>
                ))}
              </ul>
              <Link href="/collections/risks" className="font-medium text-primary">
                Read the risks in full
              </Link>
            </section>
            <label className="flex items-start gap-3 text-[15px] leading-relaxed text-primaryText">
              <input type="checkbox" checked={readPack} onChange={(e) => setReadPack(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#c1272d]" />
              I have read the project pack and the manager&apos;s pledge.
            </label>
            <label className="flex items-start gap-3 text-[15px] leading-relaxed text-primaryText">
              <input type="checkbox" checked={readRisks} onChange={(e) => setReadRisks(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#c1272d]" />
              I understand the risks, that blockchain payments cannot be reversed, and that Sheda does not guarantee any
              return.
            </label>
          </>
        ) : null}

        {/* ---- 4. check ---- */}
        {step === "check" && unit ? (
          <>
            <h1 className="text-2xl font-bold text-primaryText">Check the details</h1>
            <dl className="space-y-3 rounded-2xl bg-white p-5 text-[15px] shadow-[0_4px_18px_rgba(0,0,0,0.07)]">
              <p className="pb-1 text-lg font-semibold text-primaryText">The property</p>
              <Row label="Building" value={project.name} />
              <Row label="Location" value={project.location} />
              <Row label="Type" value={PROJECT_TYPE_TEXT[project.project_type ?? "under_construction"]} />
              <Row label="Flat" value={unit.label} />
              <Row
                label={choosing ? "Your vote for manager" : "Manager"}
                value={chosen ? candidateName(chosen) : project.manager?.display_name ?? "Chosen by investors"}
              />
            </dl>
            <dl className="space-y-3 rounded-2xl bg-white p-5 text-[15px] shadow-[0_4px_18px_rgba(0,0,0,0.07)]">
              <p className="pb-1 text-lg font-semibold text-primaryText">Your investment</p>
              <Row label="You pay" value={money(cost)} />
              <Row label="Shares" value={`${shares} (${bpsToPercent(ownershipBps(shares, unit.total_shares))} of the flat)`} />
              <Row label="Price per share" value={money(oneShare)} />
              {rent ? <Row label="Possible rent" value={`${money(rent.min)} – ${money(rent.max)} a month`} /> : null}
              <Row label="Sheda fee" info={INFO.fees} value="2% of the raise, only if it fills" />
              <Row label="Paid from" value={accountId ?? "Your wallet"} />
            </dl>
          </>
        ) : null}

        {/* ---- done ---- */}
        {step === "done" ? (
          <div className="space-y-4 py-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
              <Check size={28} />
            </span>
            <h1 className="text-2xl font-bold text-primaryText">You&apos;re in</h1>
            <p className="text-sm text-secondaryText">
              Your money is in the raise contract. Follow the round in Portfolio. When it fills, collect your shares there;
              if it doesn&apos;t, take your money back there too.
            </p>
            <div className="flex gap-2">
              <Link href="/collections/holdings" className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-white">
                Go to Portfolio
              </Link>
              <Link href={`/collections/project/${project.slug}`} className="flex-1 rounded-xl border border-borderColor py-3 text-sm font-medium">
                Back to the building
              </Link>
            </div>
          </div>
        ) : null}

        {error && step !== "done" ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      </div>

      {/* ---- the button for each step ---- */}
      {step !== "done" ? (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-borderColor bg-white/95 px-5 py-3 backdrop-blur md:bottom-0">
          <div className="mx-auto max-w-xl">
            {step === "flat" ? (
              <PrimaryButton disabled={!unit} onClick={() => setStep("amount")}>
                Continue
              </PrimaryButton>
            ) : step === "amount" ? (
              <PrimaryButton disabled={!open || atomicBig <= 0n} onClick={continueFromAmount}>
                Continue
              </PrimaryButton>
            ) : step === "terms" ? (
              <PrimaryButton disabled={!readPack || !readRisks || !pack} onClick={() => setStep("check")}>
                Agree and continue
              </PrimaryButton>
            ) : !capabilities.raises || !escrow ? (
              <NotLiveYet what="Investing is not live yet" body="The raise contract is not deployed." />
            ) : !connected ? (
              <p className="text-center text-sm text-secondaryText">Connect your wallet to invest.</p>
            ) : (
              <PrimaryButton disabled={loading || short || cost <= 0n} onClick={onCommit}>
                {loading ? "Signing…" : `Confirm and pay ${money(cost)}`}
              </PrimaryButton>
            )}
          </div>
        </div>
      ) : null}

      {popup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center">
            <p className="font-semibold text-primaryText">Check the amount</p>
            <p className="mt-2 text-sm text-secondaryText">{popup}</p>
            <button type="button" onClick={() => setPopup(null)} className="mt-4 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-white">
              OK
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Row({ label, value, info, tone }: { label: string; value: string; info?: string; tone?: "bad" }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="inline-flex items-center gap-1 text-secondaryText">
        {label}
        {info ? <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip> : null}
      </dt>
      <dd className={`text-right font-medium ${tone === "bad" ? "text-red-700" : "text-primaryText"}`}>{value}</dd>
    </div>
  );
}

function PrimaryButton({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-xl bg-primary py-4 text-base font-semibold text-white disabled:opacity-50"
    >
      {children}
    </button>
  );
}

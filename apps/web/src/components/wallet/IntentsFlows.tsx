"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Copy } from "lucide-react";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import TextField, { inputClass } from "@/components/ui/TextField";
import { useWallet } from "@/contexts/WalletContext";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import { useCopy } from "@/hooks/useCopy";
import { formatTokenAmount, getStatusDisplay, toSmallestUnits, useNearIntents } from "@/hooks/useNearIntents";
import {
  checkSwapStatus,
  getChainDisplayName,
  getIntentsTokens,
  requestDryQuote,
  requestQuote,
  submitDepositTx,
  type IntentsToken,
  type QuoteResponse,
  type SwapStatus,
} from "@/services/nearIntents";

const MAINNET_NOTE = (
  <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
    NEAR Intents works on <strong>mainnet only</strong>. Funds are swapped and delivered on mainnet.
  </p>
);

const tokenKey = (t: IntentsToken) => t.assetId;

function TokenSelect({
  label,
  tokens,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  tokens: IntentsToken[];
  value: IntentsToken | null;
  onChange: (t: IntentsToken) => void;
  placeholder: string;
}) {
  return (
    <label className="mb-4 block text-sm">
      <span className="mb-1 block">{label}</span>
      <select
        className={inputClass}
        value={value ? tokenKey(value) : ""}
        onChange={(e) => {
          const t = tokens.find((x) => tokenKey(x) === e.target.value);
          if (t) onChange(t);
        }}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {tokens.map((t) => (
          <option key={tokenKey(t)} value={tokenKey(t)}>
            {t.symbol} · ${t.price.toFixed(2)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ChainSelect({ label, chains, value, onChange }: { label: string; chains: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <label className="mb-4 block text-sm">
      <span className="mb-1 block">{label}</span>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Select a blockchain
        </option>
        {chains.map((c) => (
          <option key={c} value={c}>
            {getChainDisplayName(c)}
          </option>
        ))}
      </select>
    </label>
  );
}

function QuoteSummary({ quote, from, to, fromChain, toChain }: { quote: QuoteResponse; from: IntentsToken; to: IntentsToken; fromChain: string; toChain: string }) {
  const inAmt = formatTokenAmount(quote.amountIn, from.decimals);
  const outAmt = formatTokenAmount(quote.amountOut, to.decimals);
  const rate = parseFloat(outAmt) / parseFloat(inAmt) || 0;
  return (
    <div className="mb-4 rounded-2xl border border-borderColor p-4">
      <p className="text-xs text-secondaryText">You send</p>
      <p className="text-2xl font-bold">
        {inAmt} <span className="text-base font-medium text-secondaryText">{from.symbol}</span>
      </p>
      <p className="text-xs text-secondaryText">
        ≈ ${(parseFloat(inAmt) * from.price).toFixed(2)} · on {getChainDisplayName(fromChain)}
      </p>
      <ArrowDown className="my-2 text-primary" size={20} />
      <p className="text-xs text-secondaryText">You receive (estimated)</p>
      <p className="text-2xl font-bold text-green-600">
        {outAmt} <span className="text-base font-medium">{to.symbol}</span>
      </p>
      <p className="text-xs text-secondaryText">
        ≈ ${(parseFloat(outAmt) * to.price).toFixed(2)} · on {getChainDisplayName(toChain)}
      </p>
      <dl className="mt-4 space-y-1 border-t border-borderColor pt-3 text-xs">
        <div className="flex justify-between">
          <dt className="text-secondaryText">Rate</dt>
          <dd>
            1 {from.symbol} ≈ {rate.toFixed(6)} {to.symbol}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-secondaryText">Slippage tolerance</dt>
          <dd>1%</dd>
        </div>
        {quote.estimatedProcessingTimeMs != null && (
          <div className="flex justify-between">
            <dt className="text-secondaryText">Estimated time</dt>
            <dd>~{Math.ceil(quote.estimatedProcessingTimeMs / 60000)} min</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function StatusBanner({ status, polling }: { status: string; polling: boolean }) {
  const d = getStatusDisplay(status || "PENDING_DEPOSIT");
  const tone = { green: "border-green-200 bg-green-50 text-green-800", red: "border-red-200 bg-red-50 text-red-800", blue: "border-blue-200 bg-blue-50 text-blue-800", yellow: "border-amber-200 bg-amber-50 text-amber-800" }[d.color];
  return (
    <div className={`mb-4 rounded-xl border p-4 ${tone}`} aria-live="polite">
      <p className="font-semibold">
        {d.emoji} {d.text}
      </p>
      {polling && (
        <p className="mt-1 flex items-center gap-2 text-xs opacity-80">
          <Spinner size={12} /> Checking every 8 seconds…
        </p>
      )}
    </div>
  );
}

const TERMINAL = ["SUCCESS", "FAILED", "REFUNDED", "INCOMPLETE_DEPOSIT"];

/** Bring tokens in from another blockchain, swapped into a NEAR token. */
export function IntentsDepositFlow({
  nearAccountId,
  whitelistedSymbols,
  onDone,
  onRefresh,
}: {
  nearAccountId: string;
  whitelistedSymbols?: string[];
  onDone: () => void;
  onRefresh: () => void;
}) {
  const intents = useNearIntents(nearAccountId, whitelistedSymbols);
  const copy = useCopy();
  const [txHash, setTxHash] = useState("");

  useEffect(() => {
    if (intents.step === "choose") intents.startIntentsFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    intents.reset();
    onRefresh();
    onDone();
  };

  if (intents.tokensLoading || intents.step === "choose")
    return (
      <div className="flex flex-col items-center py-10 text-sm text-secondaryText">
        <Spinner size={32} />
        <p className="mt-3">Loading tokens from 20+ blockchains…</p>
      </div>
    );

  const from = intents.selectedSourceToken;
  const to = intents.selectedDestToken;

  if (intents.step === "form") {
    const amountOk = parseFloat(intents.amount) > 0;
    return (
      <div>
        {MAINNET_NOTE}
        <ChainSelect label="From blockchain" chains={intents.availableChains} value={intents.selectedSourceChain} onChange={intents.selectChain} />
        {intents.selectedSourceChain && (
          <TokenSelect label="Token to send" tokens={intents.sourceChainTokens} value={from} onChange={intents.selectSourceToken} placeholder="Select token to send" />
        )}
        <TokenSelect label="Receive (on NEAR)" tokens={intents.nearTokens} value={to} onChange={intents.selectDestToken} placeholder="Select token to receive" />
        <TextField
          label={`Amount${from ? ` (${from.symbol})` : ""}`}
          inputMode="decimal"
          placeholder="0.00"
          value={intents.amount}
          onChange={(e) => intents.setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          hint={intents.usdEquivalent != null ? `≈ $${intents.usdEquivalent.toFixed(2)} USD` : undefined}
        />
        <Button full className="mt-4" onClick={intents.getPreview} loading={intents.previewLoading} disabled={!from || !to || !amountOk}>
          {intents.previewLoading ? "Getting preview…" : "Preview swap"}
        </Button>
      </div>
    );
  }

  if (intents.step === "preview" && intents.previewQuote && from && to) {
    return (
      <div>
        <button type="button" className="mb-3 text-sm text-primary hover:underline" onClick={intents.goToForm}>
          ← Back to form
        </button>
        <p className="mb-3 text-sm text-secondaryText">Review before confirming. No funds are committed yet.</p>
        <QuoteSummary quote={intents.previewQuote} from={from} to={to} fromChain={intents.selectedSourceChain} toChain="near" />
        <Button full onClick={intents.confirmAndGetDepositAddress} loading={intents.liveQuoteLoading}>
          {intents.liveQuoteLoading ? "Getting deposit address…" : "Confirm & get deposit address"}
        </Button>
        <Button full variant="ghost" className="mt-2" onClick={intents.goToForm}>
          Cancel
        </Button>
      </div>
    );
  }

  if ((intents.step === "deposit" || intents.step === "status") && intents.liveQuote && from && to) {
    const q = intents.liveQuote;
    const status = intents.swapStatusLabel;
    const terminal = TERMINAL.includes(status);
    return (
      <div>
        <StatusBanner status={status} polling={intents.statusPolling && !terminal} />
        {!terminal && (
          <div className="mb-4 rounded-xl border border-borderColor p-4">
            <p className="mb-2 text-sm">
              Send exactly <strong>{formatTokenAmount(q.amountIn, from.decimals)} {from.symbol}</strong> on{" "}
              {getChainDisplayName(intents.selectedSourceChain)} to:
            </p>
            <button
              type="button"
              onClick={() => copy(q.depositAddress, "Deposit address")}
              className="flex w-full items-center gap-2 rounded-lg bg-cardBackground p-3 text-left text-sm text-primary"
            >
              <span className="min-w-0 flex-1 break-all">{q.depositAddress}</span>
              <Copy size={16} />
            </button>
            {q.depositMemo && (
              <button
                type="button"
                onClick={() => copy(q.depositMemo!, "Memo")}
                className="mt-2 flex w-full items-center gap-2 rounded-lg bg-cardBackground p-3 text-left text-sm"
              >
                <span className="flex-1">
                  Memo: <strong>{q.depositMemo}</strong>
                  <span className="block text-xs text-red-600">Include this memo or the deposit can be lost.</span>
                </span>
                <Copy size={16} />
              </button>
            )}
            <p className="mt-3 text-xs text-green-700">
              You&apos;ll receive about <strong>{formatTokenAmount(q.amountOut, to.decimals)} {to.symbol}</strong> in {nearAccountId}.
            </p>
            {intents.quoteDeadline && (
              <p className={`mt-1 text-xs ${intents.quoteExpired ? "text-red-600" : "text-secondaryText"}`}>
                {intents.quoteExpired ? "This quote has expired. Get a new one." : `Send before ${intents.quoteDeadline.toLocaleTimeString()}`}
              </p>
            )}
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (txHash.trim()) intents.submitTxHash(txHash.trim());
              }}
            >
              <input
                className={`${inputClass} text-sm`}
                placeholder="Optional: paste your transaction hash to speed it up"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
              />
              <Button type="submit" variant="outline" disabled={!txHash.trim()}>
                Submit
              </Button>
            </form>
          </div>
        )}
        {status === "SUCCESS" ? (
          <Button full onClick={finish}>
            Done
          </Button>
        ) : terminal || intents.quoteExpired ? (
          <Button full onClick={intents.goToForm}>
            Start a new deposit
          </Button>
        ) : (
          <Button full variant="ghost" onClick={finish}>
            Close (we&apos;ll keep your funds safe either way)
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="py-6 text-center">
      <p className="mb-3 text-secondaryText">Something went wrong with this deposit.</p>
      <Button onClick={intents.goToForm}>Start again</Button>
    </div>
  );
}

/** Send a NEAR token out to another blockchain, swapped on the way. */
export function IntentsWithdrawFlow({
  nearAccountId,
  walletTokenSymbols,
  onDone,
  onRefresh,
}: {
  nearAccountId: string;
  walletTokenSymbols?: string[];
  onDone: () => void;
  onRefresh: () => void;
}) {
  const { sendFungibleToken } = useWallet();
  const { run } = useTransactionToast();
  const [step, setStep] = useState<"form" | "preview" | "executing" | "status">("form");
  const [tokens, setTokens] = useState<IntentsToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<IntentsToken | null>(null);
  const [destChain, setDestChain] = useState("");
  const [dest, setDest] = useState<IntentsToken | null>(null);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [preview, setPreview] = useState<QuoteResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [swap, setSwap] = useState<SwapStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    getIntentsTokens()
      .then((all) => {
        if (!alive) return;
        setTokens(all);
        setSource(all.find((t) => t.blockchain === "near" && (t.symbol === "wNEAR" || t.symbol === "NEAR")) ?? null);
      })
      .catch(() => alive && setError("Failed to load cross-chain tokens. Please try again."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const sources = useMemo(() => {
    const near = tokens.filter((t) => t.blockchain === "near");
    if (!walletTokenSymbols?.length) return near;
    const set = new Set(walletTokenSymbols.map((s) => s.toUpperCase()));
    if (set.has("NEAR")) set.add("WNEAR");
    return near.filter((t) => set.has(t.symbol.toUpperCase()));
  }, [tokens, walletTokenSymbols]);
  const chains = useMemo(() => [...new Set(tokens.filter((t) => t.blockchain !== "near").map((t) => t.blockchain))].sort(), [tokens]);
  const destTokens = useMemo(() => tokens.filter((t) => t.blockchain === destChain), [tokens, destChain]);
  const usd = source && parseFloat(amount) > 0 ? parseFloat(amount) * source.price : null;

  const quoteRequest = () => ({
    swapType: "EXACT_INPUT" as const,
    slippageTolerance: 100,
    originAsset: source!.assetId,
    depositType: "ORIGIN_CHAIN" as const,
    destinationAsset: dest!.assetId,
    amount: toSmallestUnits(amount, source!.decimals),
    refundTo: nearAccountId,
    refundType: "ORIGIN_CHAIN" as const,
    recipient: recipient.trim(),
    recipientType: "DESTINATION_CHAIN" as const,
  });

  const getPreview = async () => {
    if (!source || !dest || !(parseFloat(amount) > 0) || !recipient.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await requestDryQuote(quoteRequest()));
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a swap preview. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const poll = (address: string, memo?: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const r = await checkSwapStatus(address, memo);
        setSwap(r);
        if (TERMINAL.includes(r.status)) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPolling(false);
        }
      } catch {
        /* keep polling */
      }
    }, 8_000);
  };

  const execute = async () => {
    if (!source || !dest) return;
    setBusy(true);
    setError(null);
    setStep("executing");
    try {
      const quote = await requestQuote(quoteRequest());
      // The human amount: sendFungibleToken scales it by the decimals itself.
      // The old screen passed the already-scaled amount, multiplying it twice.
      const hash = await run({
        loadingMessage: `Sending ${amount} ${source.symbol} to start the withdrawal...`,
        successMessage: "Deposit sent. Tracking your withdrawal...",
        notification: { type: "general", title: "Withdrawal Started", message: `Your ${amount} ${source.symbol} withdrawal is processing.` },
        action: () => sendFungibleToken(nearAccountId, quote.depositAddress, source.contractAddress || "wrap.near", amount, source.decimals),
      });
      if (typeof hash === "string" && hash) {
        submitDepositTx(quote.depositAddress, hash, "near", quote.depositMemo, nearAccountId).catch(() => {});
      }
      setStep("status");
      poll(quote.depositAddress, quote.depositMemo);
    } catch (e) {
      setStep("preview");
      setError(e instanceof Error ? e.message : "The withdrawal failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="flex flex-col items-center py-10 text-sm text-secondaryText">
        <Spinner size={32} />
        <p className="mt-3">Loading cross-chain tokens…</p>
      </div>
    );

  const errorBox = error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;

  if (step === "form")
    return (
      <div>
        {MAINNET_NOTE}
        {errorBox}
        <TokenSelect label="Send from your wallet" tokens={sources} value={source} onChange={setSource} placeholder="Select a token" />
        <ChainSelect
          label="To blockchain"
          chains={chains}
          value={destChain}
          onChange={(c) => {
            setDestChain(c);
            setDest(null);
          }}
        />
        {destChain && <TokenSelect label="Receive token" tokens={destTokens} value={dest} onChange={setDest} placeholder="Select token to receive" />}
        <TextField
          label={`Amount${source ? ` (${source.symbol})` : ""}`}
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          hint={usd != null ? `≈ $${usd.toFixed(2)} USD` : undefined}
        />
        <TextField
          className="mt-4"
          label={`Recipient address${destChain ? ` on ${getChainDisplayName(destChain)}` : ""}`}
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <Button full className="mt-4" onClick={getPreview} loading={busy} disabled={!source || !dest || !(parseFloat(amount) > 0) || !recipient.trim()}>
          Preview withdrawal
        </Button>
      </div>
    );

  if ((step === "preview" || step === "executing") && preview && source && dest)
    return (
      <div>
        <button type="button" className="mb-3 text-sm text-primary hover:underline" onClick={() => setStep("form")} disabled={busy}>
          ← Back to form
        </button>
        {errorBox}
        <QuoteSummary quote={preview} from={source} to={dest} fromChain="near" toChain={destChain} />
        <p className="mb-4 break-all text-xs text-secondaryText">Recipient: {recipient}</p>
        <Button full onClick={execute} loading={busy}>
          {busy ? "Sending…" : "Confirm withdrawal"}
        </Button>
      </div>
    );

  const status = swap?.status ?? "PENDING_DEPOSIT";
  return (
    <div>
      <StatusBanner status={status} polling={polling} />
      <Button
        full
        onClick={() => {
          onRefresh();
          onDone();
        }}
      >
        {TERMINAL.includes(status) ? "Done" : "Close (it keeps going in the background)"}
      </Button>
    </div>
  );
}

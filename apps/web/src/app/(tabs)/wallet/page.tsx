"use client";

/* eslint-disable @next/next/no-img-element -- property media comes from arbitrary hosts */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Copy, ExternalLink, Eye, EyeOff, RefreshCw, Send, Wallet as WalletIcon, Zap } from "lucide-react";
import AuthGuard from "@/components/auth/AuthGuard";
import Button, { ButtonLink } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import TextField, { inputClass } from "@/components/ui/TextField";
import { AssetsList, DetailRow, OptionCard, TokenLogo, TokensList, TransactionRow, TransactionsList, fmtAmount } from "@/components/wallet/WalletParts";
import { IntentsDepositFlow, IntentsWithdrawFlow } from "@/components/wallet/IntentsFlows";
import { useWallet } from "@/contexts/WalletContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import { useNearContract } from "@/hooks/useNearContract";
import { useCopy } from "@/hooks/useCopy";
import nearContractService from "@/services/nearContract";
import { getMethodLabel } from "@/services/nearIndexer";
import { readCachedAssets, writeCachedAssets } from "@/services/assetCache";
import { SUPPORTED_FIATS } from "@/services/priceOracle";
import { computeAggregatedBalance, type Asset, type Token, type Transaction, type WalletTab } from "@/types/wallet";
import type { PropertyView } from "@/types/contract";
import { bidAssets, bidPropertyIdsToFetch, mergeAssetSources, ownedAssets } from "@/utilities/walletAssets";
import { formatAmount } from "@/utilities/atomicAmount";
import { formatDateTime, formatRelativeTime } from "@/utilities/formatTimestamp";
import { getAccountExplorerUrl, getTxExplorerUrl } from "@/utilities/nearExplorer";

/** NEAR Intents is mainnet-only, so only these show in its pickers. */
const WALLET_WHITELISTED_SYMBOLS = ["USDC", "USDT", "wNEAR", "NEAR"];
/** Each tick fires several RPC calls at shared public endpoints; 60s keeps us under their limits. */
const POLLING_INTERVAL_MS = 60_000;
const TABS: WalletTab[] = ["Tokens", "Transactions", "Assets"];

const short = (s: string, n = 14) => (s.length > n + 3 ? `${s.slice(0, n)}…` : s);

function Portfolio() {
  const { walletState, currentNetwork, getAccountTransactions, getTokenBalances, sendTransaction, sendFungibleToken, loading } = useWallet();
  const { run } = useTransactionToast();
  const { transferProperty, getTestTokens } = useNearContract();
  const [toppingUp, setToppingUp] = useState(false);
  const [topUpNote, setTopUpNote] = useState<string | null>(null);
  const { formatPrice, formatUsd, selectedCurrency, setSelectedCurrency } = useCurrency();
  const copy = useCopy();
  const accountId = walletState.account?.accountId;

  const [showBal, setShowBal] = useState(true);
  const [tab, setTab] = useState<WalletTab>("Tokens");
  const [refreshing, setRefreshing] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [depositOpen, setDepositOpen] = useState(false);
  const [depositMode, setDepositMode] = useState<"choose" | "address" | "intents">("choose");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawMode, setWithdrawMode] = useState<"choose" | "direct" | "intents">("choose");
  const [sendToken, setSendToken] = useState<string>("NEAR");
  const [recipient, setRecipient] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [transferTo, setTransferTo] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  const aggregated = useMemo(() => computeAggregatedBalance(tokens), [tokens]);
  const isMainnet = currentNetwork === "mainnet";

  // ── Loading ──
  const assetsRef = useRef<Asset[]>([]);
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);
  const liveAssetsLoaded = useRef(false);

  const loadTransactions = useCallback(
    async (force = false) => {
      if (!accountId) return;
      setTxLoading(true);
      try {
        setTransactions(await getAccountTransactions(accountId, 25, force));
        setTxError(null);
      } catch {
        setTxError("We couldn't reach the blockchain indexer. Your transactions are safe on-chain; please try again shortly.");
      } finally {
        setTxLoading(false);
      }
    },
    [accountId, getAccountTransactions]
  );

  const loadTokens = useCallback(async () => {
    if (!accountId) return;
    try {
      setTokens(await getTokenBalances(accountId));
    } catch (e) {
      console.error("Failed to load token balances:", e);
    }
  }, [accountId, getTokenBalances]);

  /**
   * Rebuilt from chain state each time, never accumulated, so a property
   * that's gone disappears. A source that fails to read is carried over from
   * the list on screen rather than treated as "owns nothing".
   */
  const loadAssets = useCallback(async () => {
    if (!accountId) return;
    setAssetsLoading(true);
    try {
      await nearContractService.initialize(currentNetwork);
      const [ownedS, bidsS] = await Promise.allSettled([
        nearContractService.getMyProperties(accountId),
        nearContractService.getBidsByBidder({ bidder: accountId, from_index: 0, limit: 100 }),
      ]);
      const owned = ownedS.status === "fulfilled" && ownedS.value.success ? ownedS.value.data ?? [] : null;
      const bids = bidsS.status === "fulfilled" && bidsS.value.success ? bidsS.value.data ?? [] : null;
      let partial = owned === null || bids === null;
      if (owned === null && bids === null) {
        setAssetsError("Some properties couldn't be read from the blockchain, so this list may be out of date.");
        return;
      }
      const ids = bidPropertyIdsToFetch(bids ?? [], new Set((owned ?? []).map((p) => p.id)));
      const results = await Promise.allSettled(ids.map((id) => nearContractService.getPropertyById(id)));
      const bidProperties = new Map<number, PropertyView>();
      const deletedPropertyIds = new Set<number>();
      results.forEach((r, i) => {
        if (r.status !== "fulfilled" || !r.value.success) {
          partial = true;
          return;
        }
        if (r.value.data) bidProperties.set(ids[i], r.value.data);
        else deletedPropertyIds.add(ids[i]);
      });
      const merged = mergeAssetSources({
        previous: assetsRef.current,
        owned: owned ? ownedAssets({ accountId, ownedProperties: owned, deletedPropertyIds }) : null,
        bids: bids ? bidAssets({ bids, bidProperties, deletedPropertyIds }) : null,
      });
      liveAssetsLoaded.current = true;
      setAssets(merged);
      setAssetsError(partial ? "Some properties couldn't be read from the blockchain, so this list may be incomplete." : null);
      if (!partial) writeCachedAssets(accountId, currentNetwork, merged);
    } catch {
      setAssetsError("We couldn't reach the blockchain. Your properties are safe on-chain; please try again shortly.");
    } finally {
      setAssetsLoading(false);
    }
  }, [accountId, currentNetwork]);

  const loadAll = useCallback(
    (force = false) => Promise.all([loadTokens(), loadTransactions(force), loadAssets()]),
    [loadTokens, loadTransactions, loadAssets]
  );

  // Last-known assets first, then the live read replaces them.
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    liveAssetsLoaded.current = false;
    readCachedAssets(accountId, currentNetwork).then((cached) => {
      if (!cancelled && !liveAssetsLoaded.current && cached?.length) setAssets(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, currentNetwork]);

  useEffect(() => {
    if (!accountId) return;
    loadAll();
    const id = setInterval(() => {
      // Skip while the tab is hidden: nobody's looking, and it spares the RPCs.
      if (document.visibilityState === "visible") loadAll();
    }, POLLING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [accountId, loadAll]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await loadAll(true);
    } finally {
      setRefreshing(false);
    }
  };

  // ── Send ──
  const sendable = tokens.filter((t) => t.amount > 0);
  const chosen = sendable.find((t) => t.symbol === sendToken) ?? sendable[0];
  const sendAmountNum = parseFloat(sendAmount);
  const overBalance = !!chosen && sendAmountNum > chosen.amount;
  const recipientOk = /^[a-z0-9._-]{2,64}$/.test(recipient.trim()) || /^[0-9a-f]{64}$/.test(recipient.trim());

  const handleSend = async () => {
    if (!accountId || !chosen) return;
    setSendError(null);
    if (!recipientOk) return setSendError("Enter a valid NEAR account, e.g. name.testnet.");
    if (!(sendAmountNum > 0)) return setSendError("Enter an amount greater than zero.");
    if (overBalance) return setSendError(`You only have ${fmtAmount(chosen.amount)} ${chosen.symbol}.`);
    if (recipient.trim() === accountId) return setSendError("That's your own wallet.");
    setSending(true);
    try {
      await run({
        loadingMessage: `Sending ${sendAmount} ${chosen.symbol}...`,
        successMessage: (hash: string) => `Sent ${sendAmount} ${chosen.symbol}. Hash: ${hash.substring(0, 10)}...`,
        notification: { type: "general", title: "Transaction Sent", message: `Sent ${sendAmount} ${chosen.symbol}.` },
        action: () =>
          chosen.symbol === "NEAR"
            ? sendTransaction(accountId, recipient.trim(), sendAmount)
            : sendFungibleToken(accountId, recipient.trim(), chosen.contractAddress || "", sendAmount, chosen.decimals || 6),
      });
      setWithdrawOpen(false);
      setRecipient("");
      setSendAmount("");
      await refresh();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Failed to send.");
    } finally {
      setSending(false);
    }
  };

  // ── Transfer property ──
  const handleTransfer = async () => {
    if (!selectedAsset?.propertyId || !transferTo.trim()) return;
    setTransferring(true);
    setTransferError(null);
    try {
      await run({
        loadingMessage: "Transferring your property...",
        successMessage: `Property transferred to ${transferTo.trim()}.`,
        notification: { type: "general", title: "Property Transferred", message: `Sent to ${transferTo.trim()}.` },
        action: async () => {
          const r = await transferProperty({ receiver_id: transferTo.trim(), token_id: String(selectedAsset.propertyId) });
          if (!r.success) throw new Error(r.error || "Failed to transfer the property");
          return r;
        },
      });
      setSelectedAsset(null);
      setTransferTo("");
      await loadAssets();
    } catch (e) {
      setTransferError(e instanceof Error ? e.message : "Failed to transfer the property");
    } finally {
      setTransferring(false);
    }
  };

  const tokenTxs = (symbol: string) =>
    transactions.filter((tx) => (symbol === "NEAR" ? tx.currency === "NEAR" || tx.currency === "Ⓝ" : tx.currency === symbol));

  // ── States before the wallet is ready ──
  if (loading && !walletState.account)
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm text-secondaryText">
        <Spinner size={36} /> Checking for your wallet…
      </div>
    );

  if (!walletState.isConnected || !walletState.account)
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <WalletIcon size={48} className="mx-auto mb-4 text-primary" />
        <h1 className="mb-2 text-xl font-semibold">Set up your wallet</h1>
        <p className="mb-6 text-sm text-secondaryText">
          Your wallet holds your tokens and property records. Create a new one, or bring back one you already have with its recovery phrase.
        </p>
        <div className="flex flex-col gap-3">
          <ButtonLink href="/wallet-setup" full>
            Set up wallet
          </ButtonLink>
          <ButtonLink href="/wallet-setup/import-wallet" variant="outline" full>
            Import with a recovery phrase
          </ButtonLink>
        </div>
      </div>
    );

  const closeDeposit = () => {
    setDepositOpen(false);
    setDepositMode("choose");
  };
  const closeWithdraw = () => {
    setWithdrawOpen(false);
    setWithdrawMode("choose");
    setSendError(null);
  };

  return (
    <div className="mx-auto max-w-3xl px-5 pb-10 pt-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Portfolio</h1>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700">
            <span className="h-2 w-2 rounded-full bg-green-500" /> {isMainnet ? "Mainnet" : "Testnet"}
          </span>
          <select
            aria-label="Display currency"
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value)}
            className="rounded-lg border border-borderColor bg-white px-2 py-1 text-sm"
          >
            {SUPPORTED_FIATS.map((f) => (
              <option key={f.code} value={f.code}>
                {f.flag} {f.code}
              </option>
            ))}
          </select>
          <button type="button" aria-label="Refresh" onClick={refresh} disabled={refreshing} className="rounded-lg p-2 hover:bg-cardBackground">
            <RefreshCw size={18} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <section className="mb-5 rounded-2xl bg-primaryLight p-5 text-center">
        <p className="flex items-center justify-center gap-2 text-sm">
          Total balance
          <button type="button" aria-label={showBal ? "Hide balance" : "Show balance"} onClick={() => setShowBal((v) => !v)}>
            {showBal ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </p>
        <p className="pb-1 pt-3 text-3xl font-extrabold">
          {showBal ? `${aggregated.isComplete ? "" : "~"}${formatPrice(aggregated.totalUsd)}` : "********"}
        </p>
        {showBal && !aggregated.isComplete && (
          <p className="text-xs text-amber-600">Some token prices are unavailable ({aggregated.missingPriceSymbols.join(", ")})</p>
        )}
        {showBal && aggregated.isComplete && selectedCurrency !== "USD" && <p className="text-sm text-secondaryText">≈ {formatUsd(aggregated.totalUsd)}</p>}
        <button
          type="button"
          onClick={() => copy(walletState.account!.accountId, "Wallet address")}
          className="mx-auto mt-2 flex items-center gap-1 text-xs text-secondaryText hover:text-primaryText"
        >
          {short(walletState.account.accountId, 28)} <Copy size={12} />
        </button>
        <Link href="/wallet-recovery" className="mt-1 inline-block text-xs font-medium text-primary hover:underline">
          Backup &amp; recovery
        </Link>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={() => setDepositOpen(true)}>
            <ArrowDownToLine size={18} /> Deposit
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (sendable[0] && !sendable.some((t) => t.symbol === sendToken)) setSendToken(sendable[0].symbol);
              setWithdrawOpen(true);
            }}
          >
            <ArrowUpFromLine size={18} /> Withdraw
          </Button>
        </div>
        {!isMainnet && (
          <div className="mt-3">
            <Button
              variant="outline"
              full
              disabled={toppingUp}
              onClick={async () => {
                setToppingUp(true);
                setTopUpNote(null);
                const r = await getTestTokens();
                setToppingUp(false);
                setTopUpNote(r.success ? "Added 500,000 test USDC and USDT. They can take a few seconds to appear." : r.error || "That didn't work. Please try again.");
                if (r.success) setTimeout(() => loadTokens(), 4000);
              }}
            >
              {toppingUp ? "Adding test dollars..." : "Get test dollars"}
            </Button>
            <p className="mt-1 text-center text-[11px] text-secondaryText">
              {topUpNote ?? "Testnet only. Free play money for trying bids and investments."}
            </p>
          </div>
        )}
      </section>

      <div className="mb-3 grid grid-cols-3 gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-xl py-2.5 text-sm ${tab === t ? "bg-primary text-white" : "bg-primaryLight text-secondaryText hover:bg-active"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Tokens" && <TokensList tokens={tokens} onPress={setSelectedToken} />}
      {tab === "Transactions" && (
        <TransactionsList transactions={transactions} loading={txLoading} error={txError} onRetry={() => loadTransactions(true)} onPress={setSelectedTx} />
      )}
      {tab === "Assets" && (
        <AssetsList
          assets={assets}
          loading={assetsLoading}
          error={assetsError}
          onRetry={loadAssets}
          onPress={(a) => {
            setTransferTo("");
            setTransferError(null);
            setSelectedAsset(a);
          }}
        />
      )}

      {/* Deposit */}
      <Modal
        open={depositOpen}
        onClose={closeDeposit}
        title={depositMode === "choose" ? "Deposit" : depositMode === "address" ? "Deposit to your address" : "Cross-chain deposit"}
      >
        {depositMode !== "choose" && (
          <button type="button" className="mb-3 text-sm text-primary hover:underline" onClick={() => setDepositMode("choose")}>
            ← Back to options
          </button>
        )}
        {depositMode === "choose" && (
          <>
            <OptionCard
              icon={<Copy size={20} />}
              title="Copy wallet address"
              body="Send NEAR or supported tokens straight to your wallet address."
              note="Works on testnet and mainnet"
              noteTone="green"
              onClick={() => setDepositMode("address")}
            />
            <OptionCard
              icon={<Zap size={20} />}
              title="Cross-chain via NEAR Intents"
              body="Deposit from Solana, Ethereum, Bitcoin, BSC and more."
              note={isMainnet ? "Mainnet" : "Mainnet only: not available on testnet"}
              noteTone="amber"
              disabled={!isMainnet}
              onClick={() => setDepositMode("intents")}
            />
          </>
        )}
        {depositMode === "address" && (
          <>
            <p className="mb-1 text-sm font-medium">Your wallet address</p>
            <p className="mb-3 break-all rounded-lg bg-cardBackground p-3 text-sm">{walletState.account.accountId}</p>
            <p className="mb-5 text-sm text-secondaryText">Send NEAR or any supported token to this address to add funds to your wallet.</p>
            <Button full onClick={() => copy(walletState.account!.accountId, "Address")}>
              <Copy size={16} /> Copy address
            </Button>
          </>
        )}
        {depositMode === "intents" && (
          <IntentsDepositFlow nearAccountId={walletState.account.accountId} whitelistedSymbols={WALLET_WHITELISTED_SYMBOLS} onDone={closeDeposit} onRefresh={refresh} />
        )}
      </Modal>

      {/* Withdraw */}
      <Modal
        open={withdrawOpen}
        onClose={sending ? undefined : closeWithdraw}
        title={withdrawMode === "choose" ? "Withdraw" : withdrawMode === "direct" ? "Send to a NEAR address" : "Cross-chain withdrawal"}
      >
        {withdrawMode !== "choose" && (
          <button type="button" className="mb-3 text-sm text-primary hover:underline" onClick={() => setWithdrawMode("choose")} disabled={sending}>
            ← Back to options
          </button>
        )}
        {withdrawMode === "choose" && (
          <>
            <OptionCard
              icon={<Send size={20} />}
              title="Send to a NEAR address"
              body="Transfer tokens directly to another NEAR wallet."
              note="Works on testnet and mainnet"
              noteTone="green"
              onClick={() => setWithdrawMode("direct")}
            />
            <OptionCard
              icon={<Zap size={20} />}
              title="Cross-chain via NEAR Intents"
              body="Withdraw to Ethereum, Solana, Bitcoin, BSC and more."
              note={isMainnet ? "Mainnet" : "Mainnet only: not available on testnet"}
              noteTone="amber"
              disabled={!isMainnet}
              onClick={() => setWithdrawMode("intents")}
            />
          </>
        )}
        {withdrawMode === "direct" &&
          (sendable.length === 0 ? (
            <p className="py-4 text-center text-sm text-secondaryText">You don&apos;t have any tokens to send yet.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <label className="mb-4 block text-sm">
                <span className="mb-1 block">Token</span>
                <select className={inputClass} value={chosen?.symbol} onChange={(e) => setSendToken(e.target.value)}>
                  {sendable.map((t) => (
                    <option key={t.id} value={t.symbol}>
                      {t.symbol} · {fmtAmount(t.amount)} available
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label="Recipient address"
                placeholder={isMainnet ? "name.near" : "name.testnet"}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.toLowerCase())}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="mt-4">
                <TextField
                  label={`Amount (${chosen?.symbol ?? ""})`}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  error={overBalance ? "More than you have." : undefined}
                />
                {chosen && (
                  <button type="button" className="mt-1 text-xs text-primary hover:underline" onClick={() => setSendAmount(String(chosen.symbol === "NEAR" ? Math.max(0, chosen.amount - 0.05) : chosen.amount))}>
                    Use max{chosen.symbol === "NEAR" ? " (keeps 0.05 NEAR for fees)" : ""}
                  </button>
                )}
              </div>
              {sendError && <p className="mt-3 text-sm text-red-600">{sendError}</p>}
              <Button type="submit" full className="mt-5" loading={sending} disabled={!recipient || !sendAmount}>
                {sending ? "Sending…" : `Send ${chosen?.symbol ?? ""}`}
              </Button>
            </form>
          ))}
        {withdrawMode === "intents" && (
          <IntentsWithdrawFlow nearAccountId={walletState.account.accountId} walletTokenSymbols={WALLET_WHITELISTED_SYMBOLS} onDone={closeWithdraw} onRefresh={refresh} />
        )}
      </Modal>

      {/* Token detail */}
      <Modal open={!!selectedToken} onClose={() => setSelectedToken(null)} title={selectedToken?.name}>
        {selectedToken && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <TokenLogo symbol={selectedToken.symbol} size={48} />
              <div>
                <p className="text-2xl font-semibold">
                  {fmtAmount(selectedToken.amount)} {selectedToken.symbol}
                </p>
                <p className="text-sm text-secondaryText">
                  {selectedToken.priceAvailable !== false ? `≈ ${formatPrice(selectedToken.totalValue)}` : "Price unavailable"}
                </p>
              </div>
            </div>
            <dl className="mb-4">
              <DetailRow label="Symbol">{selectedToken.symbol}</DetailRow>
              {selectedToken.priceAvailable !== false && <DetailRow label="Price">{formatPrice(selectedToken.price)}</DetailRow>}
              {selectedToken.contractAddress && (
                <DetailRow label="Contract">
                  <button type="button" className="text-primary hover:underline" onClick={() => copy(selectedToken.contractAddress!, "Contract address")}>
                    {short(selectedToken.contractAddress, 20)}
                  </button>
                </DetailRow>
              )}
            </dl>
            <h3 className="mb-2 font-semibold">Recent activity</h3>
            {tokenTxs(selectedToken.symbol).length === 0 ? (
              <p className="text-sm text-secondaryText">No transactions yet for {selectedToken.symbol}.</p>
            ) : (
              <ul>
                {tokenTxs(selectedToken.symbol)
                  .slice(0, 10)
                  .map((tx) => (
                    <li key={tx.id}>
                      <TransactionRow
                        tx={tx}
                        onPress={(t) => {
                          setSelectedToken(null);
                          setSelectedTx(t);
                        }}
                      />
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </Modal>

      {/* Transaction detail */}
      <Modal open={!!selectedTx} onClose={() => setSelectedTx(null)} title="Transaction details">
        {selectedTx && (
          <>
            <p className={`text-2xl font-semibold ${selectedTx.direction === "incoming" ? "text-green-600" : "text-red-600"}`}>
              {selectedTx.direction === "incoming" ? "+" : "-"}
              {selectedTx.amount} {selectedTx.currency}
            </p>
            {selectedTx.value > 0 && <p className="mb-3 text-sm text-secondaryText">≈ {formatPrice(selectedTx.value)}</p>}
            <dl className="mb-4">
              <DetailRow label="Type">{getMethodLabel(selectedTx.methodName) || selectedTx.type}</DetailRow>
              <DetailRow label="Status">
                <span className={selectedTx.status === "failed" ? "text-red-600" : selectedTx.status === "pending" ? "text-amber-600" : "text-green-600"}>
                  {selectedTx.status || "completed"}
                </span>
              </DetailRow>
              <DetailRow label="Date">
                {formatDateTime(selectedTx.timestamp ?? selectedTx.date)}
                <span className="block text-xs font-normal text-secondaryText">{formatRelativeTime(selectedTx.timestamp ?? selectedTx.date)}</span>
              </DetailRow>
              {selectedTx.from && (
                <DetailRow label="From">
                  <a className="text-primary hover:underline" href={getAccountExplorerUrl(selectedTx.from)} target="_blank" rel="noreferrer">
                    {short(selectedTx.from, 22)}
                  </a>
                </DetailRow>
              )}
              {selectedTx.to && (
                <DetailRow label="To">
                  <a className="text-primary hover:underline" href={getAccountExplorerUrl(selectedTx.to)} target="_blank" rel="noreferrer">
                    {short(selectedTx.to, 22)}
                  </a>
                </DetailRow>
              )}
              {selectedTx.hash && (
                <DetailRow label="Tx hash">
                  <button type="button" className="text-primary hover:underline" onClick={() => copy(selectedTx.hash!, "Transaction hash")}>
                    {short(selectedTx.hash, 12)}
                  </button>
                </DetailRow>
              )}
            </dl>
            {selectedTx.hash && (
              <a
                href={getTxExplorerUrl(selectedTx.hash)}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white hover:bg-[#a82227]"
              >
                View on block explorer <ExternalLink size={16} />
              </a>
            )}
          </>
        )}
      </Modal>

      {/* Asset detail */}
      <Modal open={!!selectedAsset} onClose={transferring ? undefined : () => setSelectedAsset(null)} title="Asset details">
        {selectedAsset && (
          <>
            {selectedAsset.imageUri && <img src={selectedAsset.imageUri} alt="" className="mb-4 aspect-video w-full rounded-xl object-cover" />}
            <h3 className="mb-3 text-lg font-semibold">{selectedAsset.name}</h3>
            <dl className="mb-4">
              <DetailRow label="Status">{selectedAsset.stateLabel ?? "Not listed"}</DetailRow>
              <DetailRow label="Property ID">#{selectedAsset.propertyId ?? selectedAsset.id}</DetailRow>
              {selectedAsset.owner && (
                <DetailRow label="Owner">
                  <a className="text-primary hover:underline" href={getAccountExplorerUrl(selectedAsset.owner)} target="_blank" rel="noreferrer">
                    {short(selectedAsset.owner, 22)}
                  </a>
                </DetailRow>
              )}
              {selectedAsset.priceAmount != null && (
                <DetailRow label="Price">
                  {formatAmount(selectedAsset.priceAmount)} {selectedAsset.priceSymbol}
                  {selectedAsset.priceUsd != null && <span className="block text-xs font-normal text-secondaryText">{formatPrice(selectedAsset.priceUsd)}</span>}
                </DetailRow>
              )}
              {selectedAsset.mintedAt && <DetailRow label="Minted">{formatDateTime(selectedAsset.mintedAt)}</DetailRow>}
            </dl>
            {selectedAsset.description && <p className="mb-4 text-sm text-secondaryText">{selectedAsset.description}</p>}
            {selectedAsset.owner === accountId && selectedAsset.state !== "leased" && (
              <form
                className="rounded-xl border border-borderColor p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleTransfer();
                }}
              >
                <TextField
                  label="Transfer to another wallet"
                  placeholder={isMainnet ? "recipient.near" : "recipient.testnet"}
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value.toLowerCase())}
                  autoCapitalize="none"
                  spellCheck={false}
                  hint="The property and its records move to that wallet. This can't be undone."
                />
                {transferError && <p className="mt-2 text-sm text-red-600">{transferError}</p>}
                <Button type="submit" full className="mt-3" loading={transferring} disabled={!transferTo.trim() || transferTo.trim() === accountId}>
                  Transfer property
                </Button>
              </form>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

export default function WalletPage() {
  return (
    <AuthGuard requireAuth>
      <Portfolio />
    </AuthGuard>
  );
}

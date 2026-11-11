"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useWallet } from "@/contexts/WalletContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import nearContractService from "@/services/nearContract";
import {
  formatUsd,
  nairaToStablecoinUnits,
  stablecoinUnitsToUsd,
} from "@/constants/exchangeRates";

interface WalletToken {
  contractAddress: string;
  symbol: string;
  name: string;
  amount: number;
  totalValue: number;
  decimals: number;
  isSupportedForPayment: boolean;
}

const TOKEN_DECIMALS: Record<string, number> = { USDT: 6, USDC: 6, wNEAR: 24, NEAR: 24, DAI: 18 };

const formatBalance = (n: number) => (n === 0 ? "0.00" : n < 0.01 ? n.toFixed(6) : n.toFixed(2));

/**
 * Pick the stablecoin to pay with, and confirm the amount sent on chain.
 *
 * Either `onChainAmount` (an exact listing price in smallest units, which the
 * contract requires for fixed-price listings) or `nairaAmount` (a negotiable
 * bid, converted at the live rate). Only tokens the marketplace contract
 * accepts can be chosen; Confirm stays disabled while the balance is short,
 * because otherwise the transfer reverts on chain after a long wait.
 */
export default function TokenSelectionModal({
  visible,
  onClose,
  onConfirm,
  title,
  description,
  onChainAmount,
  nairaAmount,
  actionLabel = "Confirm",
  isLoading = false,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (tokenContractId: string, amount: string, decimals: number) => void;
  title: string;
  description?: string;
  onChainAmount?: string;
  nairaAmount?: number;
  actionLabel?: string;
  isLoading?: boolean;
}) {
  const { walletState, currentNetwork, getTokenBalances } = useWallet();
  const { formatPrice } = useCurrency();
  const { ngnPerUsd } = useExchangeRates();
  const [selected, setSelected] = useState<string | null>(null);
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const finalAmount = onChainAmount
    ? onChainAmount
    : nairaAmount && nairaAmount > 0 && ngnPerUsd
      ? String(nairaToStablecoinUnits(nairaAmount, ngnPerUsd))
      : "0";
  const finalAmountNum = parseInt(finalAmount) || 0;
  const usd = stablecoinUnitsToUsd(finalAmountNum);
  const exact = !!onChainAmount;

  useEffect(() => {
    if (!visible || !walletState.account?.accountId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [balances, supported] = await Promise.all([
          getTokenBalances(walletState.account!.accountId),
          (async () => {
            await nearContractService.initialize(currentNetwork);
            return nearContractService.getSupportedStablecoins();
          })(),
        ]);
        const accepted = new Set<string>(supported.success && supported.data ? supported.data : []);
        const list: WalletToken[] = (balances || []).map((t: any) => ({
          contractAddress: t.contractAddress,
          symbol: t.symbol,
          name: t.name || t.symbol,
          amount: t.amount || 0,
          totalValue: t.totalValue || 0,
          decimals: t.decimals || TOKEN_DECIMALS[t.symbol] || 6,
          isSupportedForPayment: accepted.has(t.contractAddress),
        }));
        list.sort((a, b) =>
          a.isSupportedForPayment === b.isSupportedForPayment
            ? b.amount - a.amount
            : a.isSupportedForPayment
              ? -1
              : 1
        );
        if (!cancelled) {
          setTokens(list);
          if (list.length === 0) setLoadError("No tokens found in your wallet");
        }
      } catch {
        if (!cancelled) setLoadError("Error loading wallet tokens");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, currentNetwork, walletState.account?.accountId, getTokenBalances]);

  const token = tokens.find((t) => t.contractAddress === selected);
  const insufficient = !!token && !!finalAmountNum && token.amount * 10 ** token.decimals < finalAmountNum;

  // Moves real funds: a second click in the same tick must not send twice.
  const latch = useRef(false);
  useEffect(() => {
    if (visible) latch.current = false;
  }, [visible]);

  const confirm = () => {
    if (latch.current || !token || finalAmountNum <= 0 || insufficient) return;
    latch.current = true;
    onConfirm(token.contractAddress, finalAmount, token.decimals);
  };

  const accepted = tokens.filter((t) => t.isSupportedForPayment);
  const others = tokens.filter((t) => !t.isSupportedForPayment);

  return (
    <Modal open={visible} onClose={isLoading ? undefined : onClose} title={title}>
      {description && <p className="mb-4 text-sm text-secondaryText">{description}</p>}

      {finalAmountNum > 0 && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${exact ? "border-green-100 bg-green-50" : "border-blue-100 bg-blue-50"}`}>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-medium">{exact ? "Exact Listing Price" : "Your Bid Amount"}</span>
            {exact && <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] text-green-700">Fixed Price</span>}
          </div>
          <Row label="Amount" value={formatPrice(usd)} />
          <Row label="USD Equivalent" value={<span className="text-blue-600">{formatUsd(usd)}</span>} />
          <Row label="On-chain Amount" value={<span className="text-green-700">{finalAmountNum.toLocaleString()} units</span>} />
        </div>
      )}

      <p className="mb-2 text-sm font-medium">Pay with</p>
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : loadError && tokens.length === 0 ? (
        <p className="py-4 text-center text-xs text-red-500">{loadError}</p>
      ) : (
        <div className="mb-4 max-h-56 overflow-y-auto">
          {accepted.length > 0 && (
            <>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-green-600">✓ Accepted for payment</p>
              {accepted.map((t) => (
                <button
                  key={t.contractAddress}
                  type="button"
                  onClick={() => setSelected(t.contractAddress)}
                  aria-pressed={selected === t.contractAddress}
                  className={`mb-2 flex w-full items-center justify-between rounded-lg border p-3 text-left ${
                    selected === t.contractAddress ? "border-primary bg-primary/5" : "border-green-200 bg-green-50/30 hover:border-green-300"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{t.symbol}</span>
                    <span className="block truncate text-xs text-secondaryText">{t.name}</span>
                  </span>
                  <span className="ml-2 text-right">
                    <span className="block text-sm font-medium">{formatBalance(t.amount)}</span>
                    <span className="block text-[10px] text-secondaryText">≈ {formatPrice(t.totalValue || 0)}</span>
                  </span>
                </button>
              ))}
            </>
          )}
          {others.length > 0 && (
            <>
              <p className="mb-1 mt-2 text-[10px] uppercase tracking-wider text-gray-400">Other wallet assets</p>
              {others.map((t) => (
                <div key={t.contractAddress} className="mb-2 flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-3 opacity-70">
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-500">{t.symbol}</span>
                    <span className="block truncate text-xs text-gray-400">{t.name}</span>
                  </span>
                  <span className="ml-2 text-right">
                    <span className="block text-sm text-gray-500">{formatBalance(t.amount)}</span>
                    <span className="block text-[10px] text-gray-400">Not accepted</span>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {insufficient && token && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          Insufficient {token.symbol} balance. You have {formatBalance(token.amount)} {token.symbol} but need ≈{" "}
          {formatPrice(usd)}.
        </p>
      )}

      <Button full onClick={confirm} loading={isLoading} disabled={!token || finalAmountNum <= 0 || insufficient}>
        {actionLabel}
      </Button>

      <p className="mt-4 rounded-lg bg-yellow-50 p-3 text-xs text-yellow-800">
        {exact
          ? "This property has a fixed price. The exact listing price will be sent to the blockchain."
          : "This is a negotiable offer. The seller can accept or reject your bid."}
      </p>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mt-1 flex items-center justify-between">
      <span className="text-xs text-secondaryText">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";
import { useWallet } from "@/contexts/WalletContext";

const SNOOZE_KEY = "sheda.backup-reminder.snoozed";

/**
 * Keeps asking until the wallet can survive this browser being cleared.
 *
 * New sign-ups get a wallet made for them without ever seeing its recovery
 * phrase, and that wallet lives only in this browser. Until it's backed up
 * to Google or the phrase is written down, clearing site data loses it, so
 * this shows on every page. "Later" hides it for this visit only.
 */
export default function BackupReminder() {
  const { hasLocalWallet, isWalletSafe, readiness } = useWallet();
  const pathname = usePathname() ?? "";
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    try {
      setSnoozed(sessionStorage.getItem(SNOOZE_KEY) === "1");
    } catch {
      setSnoozed(false);
    }
  }, []);

  const onSetupPage = pathname.startsWith("/wallet-recovery") || pathname.startsWith("/wallet-setup");
  // Wait for the stored wallet details to load, so it never flashes up
  // for someone whose wallet is already backed up.
  if (!hasLocalWallet || isWalletSafe || snoozed || onSetupPage || readiness === "idle") return null;

  return (
    <div role="alert" className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 md:items-center">
      <ShieldAlert size={18} className="mt-0.5 shrink-0 md:mt-0" aria-hidden="true" />
      <p className="flex-1">
        <strong>Back up your wallet.</strong> It&apos;s only saved in this browser. If its data is cleared, your wallet and anything in it
        are lost.
      </p>
      <Link href="/wallet-recovery" className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700">
        Back up now
      </Link>
      <button
        type="button"
        aria-label="Remind me later"
        title="Remind me later"
        onClick={() => {
          setSnoozed(true);
          try {
            sessionStorage.setItem(SNOOZE_KEY, "1");
          } catch {
            /* still hidden for now */
          }
        }}
        className="shrink-0 rounded p-1 hover:bg-amber-100"
      >
        <X size={16} />
      </button>
    </div>
  );
}

import { FlaskConical } from "lucide-react";
import { ACTIVE_NETWORK } from "@/config/near";

/**
 * A strip across the top of the testnet site. Someone can hold an account on
 * both testing.sheda.app and market.sheda.app with the same email, so every
 * page says which one this is and that nothing here is real money.
 */
export default function NetworkBanner() {
  if (ACTIVE_NETWORK !== "testnet") return null;
  return (
    <div role="note" className="flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-center text-xs font-medium text-amber-950">
      <FlaskConical size={14} aria-hidden="true" className="shrink-0" />
      <span>
        <strong>Testnet</strong>: test money only. Accounts, listings and balances here are separate from{" "}
        <a href="https://market.sheda.app" className="underline">market.sheda.app</a>.
      </span>
    </div>
  );
}

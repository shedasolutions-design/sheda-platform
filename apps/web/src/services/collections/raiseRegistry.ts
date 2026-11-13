import { RAISE_CONTRACT_ID } from "@/config/collections";

/**
 * Which raise contract each project lives on.
 *
 * Raises opened before v5 stay on the v4 contract; new ones open on v5.
 * Every project record carries its contract (`escrow_account_id`), and the
 * API layer records it here as projects load, so each call goes to the
 * contract that actually holds that raise's money.
 */
const bySlug = new Map<string, string>();

export function rememberRaise(slug: string, contract?: string | null): void {
  if (slug && contract) bySlug.set(slug, contract);
}

export function raiseOf(slug: string): string {
  return bySlug.get(slug) ?? RAISE_CONTRACT_ID;
}

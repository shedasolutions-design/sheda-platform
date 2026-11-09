import { RPC_ENDPOINTS } from "@/config/near";

/**
 * Reading vaults off the chain.
 *
 * Views only. Nothing here signs, because a wallet does not belong in a
 * read path and this app should be useful before anyone connects one. A
 * person browsing raises has not decided to invest yet.
 */

export interface VaultInfo {
  name: string;
  symbol: string;
  marketplace: string;
  property_id: string;
  stablecoin: string;
  manager: string;
  total_supply: string;
  supply_frozen: boolean;
  manager_bps: number;
  reserve_bps: number;
  platform_bps: number;
  reserve: string;
  acc_per_share: string;
  last_accounted: string;
  custody: Custody;
}

export type Custody =
  | "AwaitingUnit"
  | { Held: { token_id: string } }
  | { Redeemed: { token_id: string; to: string } };

/** Where a unit is, in a form a screen can switch on. */
export function custodyState(c: Custody): "awaiting" | "held" | "redeemed" {
  if (c === "AwaitingUnit") return "awaiting";
  if (typeof c === "object" && "Held" in c) return "held";
  return "redeemed";
}

export class RpcError extends Error {
  constructor(message: string, readonly endpoint?: string) {
    super(message);
    this.name = "RpcError";
  }
}

let endpointIndex = 0;

/**
 * One JSON-RPC view call, trying each endpoint before giving up.
 *
 * A single unreachable provider should degrade the app's speed, not its
 * function. The rental app learned this the hard way when a deprecated
 * endpoint started refusing every request.
 */
async function rpc<T>(body: unknown, signal?: AbortSignal): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < RPC_ENDPOINTS.length; attempt++) {
    const endpoint = RPC_ENDPOINTS[(endpointIndex + attempt) % RPC_ENDPOINTS.length];
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) throw new RpcError(`${response.status} ${response.statusText}`, endpoint);

      const json = await response.json();
      if (json.error) {
        const detail = json.error.data ?? json.error.message ?? "unknown RPC error";
        throw new RpcError(String(detail), endpoint);
      }
      // Remember what worked, so the next call starts there.
      endpointIndex = (endpointIndex + attempt) % RPC_ENDPOINTS.length;
      return json.result as T;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw new RpcError(
    `No NEAR endpoint answered: ${lastError instanceof Error ? lastError.message : lastError}`
  );
}

/** Call a read-only contract method. */
export async function view<T>(
  contractId: string,
  methodName: string,
  args: Record<string, unknown> = {},
  signal?: AbortSignal
): Promise<T> {
  const result = await rpc<{ result: number[]; error?: string }>(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: methodName,
        args_base64: toBase64(JSON.stringify(args)),
      },
    },
    signal
  );

  // A contract panic comes back inside a successful RPC response, so it has
  // to be checked explicitly or it reads as empty data.
  if (result.error) throw new RpcError(result.error, contractId);

  const text = fromBytes(result.result);
  return (text.length ? JSON.parse(text) : null) as T;
}

export const getVaultInfo = (vaultId: string, signal?: AbortSignal) =>
  view<VaultInfo>(vaultId, "get_info", {}, signal);

export const getShareBalance = (vaultId: string, accountId: string, signal?: AbortSignal) =>
  view<string>(vaultId, "ft_balance_of", { account_id: accountId }, signal);

/** Settled plus accrued, as of now. What the Claim button acts on. */
export const getClaimable = (vaultId: string, accountId: string, signal?: AbortSignal) =>
  view<string>(vaultId, "claimable", { account_id: accountId }, signal);

export const getOwnershipBps = (vaultId: string, accountId: string, signal?: AbortSignal) =>
  view<number>(vaultId, "ownership_bps", { account_id: accountId }, signal);

/** Everything one holding screen needs, in one round trip per vault. */
export async function getHolding(vaultId: string, accountId: string, signal?: AbortSignal) {
  const [info, balance, claimable] = await Promise.all([
    getVaultInfo(vaultId, signal),
    getShareBalance(vaultId, accountId, signal),
    getClaimable(vaultId, accountId, signal),
  ]);
  return { vaultId, info, balance, claimable };
}

export type Holding = Awaited<ReturnType<typeof getHolding>>;

// ---- encoding ------------------------------------------------------------
//
// Written out rather than reached for, because neither `btoa` nor Node's
// Buffer is reliably present across React Native, Hermes and the web build.
// Depending on either means a call that works in the simulator and throws on
// a device.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const remaining = bytes.length - i;
    const a = bytes[i];
    const b = remaining > 1 ? bytes[i + 1] : 0;
    const c = remaining > 2 ? bytes[i + 2] : 0;

    out += B64[a >> 2];
    out += B64[((a & 0x03) << 4) | (b >> 4)];
    out += remaining > 1 ? B64[((b & 0x0f) << 2) | (c >> 6)] : "=";
    out += remaining > 2 ? B64[c & 0x3f] : "=";
  }
  return out;
}

function fromBytes(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

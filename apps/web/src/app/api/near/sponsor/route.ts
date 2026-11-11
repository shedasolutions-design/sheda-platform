import { sponsorAccount } from "@/server/sponsor";
import { API_BASES } from "@/services/apiEndpoints";

/**
 * POST /api/near/sponsor  { accountId, publicKey }
 *
 * Creates a Sheda-funded NEAR account for a signed-in user. The caller sends
 * the same bearer token it uses with the Sheda backend, and the backend
 * decides whether this user may have this wallet funded
 * (POST /users/wallets/sponsor-claim): one funded wallet per Sheda account,
 * and a daily cap across everyone. That state lives in the backend because
 * this route runs on many short-lived serverless instances; the per-instance
 * memory it used before limited nothing.
 */

type Claim = { ok: true } | { ok: false; status: number; message: string };

async function claim(authorization: string, walletId: string, commit: boolean): Promise<Claim> {
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}/api/v1/users/wallets/sponsor-claim`, {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_id: walletId, commit }),
        cache: "no-store",
      });
      if (res.ok) return { ok: true };
      if (res.status >= 500) continue;
      const detail = await res
        .json()
        .then((j) => (typeof j?.detail === "string" ? j.detail : null))
        .catch(() => null);
      return { ok: false, status: res.status, message: detail ?? "Not allowed." };
    } catch {
      // Try the next backend.
    }
  }
  return { ok: false, status: 503, message: "Couldn't reach Sheda. Please try again." };
}

const fail = (status: number, code: string, message: string) =>
  Response.json({ ok: false, code, message }, { status });

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return fail(401, "unauthorized", "Sign in first.");

  let body: { accountId?: unknown; publicKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid", "Bad request.");
  }
  if (typeof body.accountId !== "string" || typeof body.publicKey !== "string") {
    return fail(400, "invalid", "Bad request.");
  }
  const accountId = body.accountId.trim().toLowerCase();

  // Signed in, and allowed this wallet? (Also proves the token is genuine.)
  const allowed = await claim(authorization, accountId, false);
  if (!allowed.ok) {
    const code = allowed.status === 401 || allowed.status === 403 ? "unauthorized" : allowed.status === 429 ? "unavailable" : "refused";
    return fail(allowed.status, code, allowed.message);
  }

  const outcome = await sponsorAccount(accountId, body.publicKey);
  if (outcome.ok) {
    // Record it so this account can't fund a second wallet. Best effort: the
    // wallet exists either way, and a retry for the same wallet is allowed.
    await claim(authorization, accountId, true).catch(() => {});
  }
  const status = outcome.ok ? 200 : outcome.code === "invalid" ? 400 : outcome.code === "taken" ? 409 : 503;
  return Response.json(outcome, { status });
}

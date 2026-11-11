import { sponsorAccount } from "@/server/sponsor";
import { API_BASES } from "@/services/apiEndpoints";

/**
 * POST /api/near/sponsor  { accountId, publicKey }
 *
 * Creates a Sheda-funded NEAR account for a signed-in user. The caller sends
 * the same bearer token it uses with the Sheda backend, and that token is
 * checked against the backend before anything is signed, so an anonymous
 * caller cannot spend the funding account.
 */

// One sponsorship attempt per user per window. In memory, so it resets on
// deploy and is per instance: it blunts a scripted loop, nothing more.
const WINDOW_MS = 10 * 60_000;
const lastAttempt = new Map<string, number>();

async function currentUserId(authorization: string): Promise<string | null> {
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}/api/v1/user/me`, {
        headers: { Authorization: authorization },
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) continue;
      const user = await res.json();
      return user && user.id != null ? String(user.id) : null;
    } catch {
      // Try the next backend.
    }
  }
  return null;
}

const fail = (status: number, code: string, message: string) =>
  Response.json({ ok: false, code, message }, { status });

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return fail(401, "unauthorized", "Sign in first.");

  const userId = await currentUserId(authorization);
  if (!userId) return fail(401, "unauthorized", "Sign in first.");

  const now = Date.now();
  const last = lastAttempt.get(userId);
  if (last && now - last < WINDOW_MS) {
    return fail(429, "unavailable", "A sponsored account was requested recently.");
  }

  let body: { accountId?: unknown; publicKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid", "Bad request.");
  }
  if (typeof body.accountId !== "string" || typeof body.publicKey !== "string") {
    return fail(400, "invalid", "Bad request.");
  }

  lastAttempt.set(userId, now);
  const outcome = await sponsorAccount(body.accountId, body.publicKey);
  const status = outcome.ok
    ? 200
    : outcome.code === "invalid"
      ? 400
      : outcome.code === "taken"
        ? 409
        : 503;
  return Response.json(outcome, { status });
}

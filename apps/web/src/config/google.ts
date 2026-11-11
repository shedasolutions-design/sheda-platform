// ============================================================================
// Google Sign-In Configuration — SINGLE SOURCE OF TRUTH
// ============================================================================
// Used for the "Sign in with Google" button on Login/Signup, which creates or
// logs into a Sheda backend account (POST /api/v1/auth/social-login) — this
//
// GOOGLE_WEB_CLIENT_ID must be a Google Cloud OAuth 2.0 "Web application"
// client ID (public, safe to expose — no client secret is used or needed for
// the id_token flow this app uses). It must also match the backend's
// GOOGLE_CLIENT_ID setting, since the backend verifies the token's audience
// against that value.
// ============================================================================

export const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

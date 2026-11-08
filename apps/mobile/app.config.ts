import { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Dynamic Expo config — extends app.json and injects sensitive keys at BUILD TIME.
 *
 * How the funding keys reach the app:
 *
 *   LOCAL DEV  → .env file  → Expo loads it automatically → process.env → extra
 *   EAS BUILD  → EAS Secrets dashboard → process.env → extra
 *
 * The keys are embedded in `extra` (NOT prefixed with EXPO_PUBLIC_), so they:
 *   ✅ Are available at runtime via Constants.expoConfig.extra
 *   ✅ Are NOT exposed as EXPO_PUBLIC_ env vars in the JS bundle
 *
 * For maximum security in production, consider moving funding account
 * operations to a backend API so private keys never leave the server.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    // Inherit everything from app.json
    ...config,
    name: config.name ?? "sheda-solution-mobile",
    slug: config.slug ?? "sheda-solution-mobile",
    extra: {
      // Keep existing extra values from app.json
      ...(config.extra ?? {}),
      // ── Backend API URL — public, prefixed EXPO_PUBLIC_ so it's also
      // readable directly via process.env if needed. Overrides app.json's
      // apiUrl when set (e.g. in the EAS web deploy workflow); otherwise
      // falls back to app.json's value. ──────────────────────────────
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? config.extra?.apiUrl,
      // ── The other deployment, used when the preferred one is unreachable.
      // Both share a database, so this is a change of route and not a change
      // of data. Set it empty to disable failover entirely. ──────────────
      apiUrlFallback:
        process.env.EXPO_PUBLIC_API_URL_FALLBACK ?? config.extra?.apiUrlFallback,
      // ── Funding keys (injected at build time, NOT public) ──────────
      nearTestnetFundingPrivateKey:
        process.env.NEAR_TESTNET_FUNDING_PRIVATE_KEY ?? "",
      nearMainnetFundingPrivateKey:
        process.env.NEAR_MAINNET_FUNDING_PRIVATE_KEY ?? "",
    },
  };
};

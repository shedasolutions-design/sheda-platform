import type { NextConfig } from "next";

/**
 * Browser security rules for every page.
 *
 * The wallet's keys live in the browser, so the thing to defend against is
 * code that isn't ours running in the page. The Content-Security-Policy
 * says which servers the page may talk to: even if someone got a script in,
 * it could not send a key to a server of theirs with fetch, XHR or a
 * WebSocket, and it could not load more code from anywhere. Keep this list
 * in step with the services the app calls; a new one that isn't here is
 * blocked by the browser (and shows in the console as a CSP error).
 */
const API_HOSTS = [
  "https://api.sheda.app",
  "https://api-testnet.sheda.app",
  "https://api-production-1e044370.up.railway.app",
  process.env.NEXT_PUBLIC_API_URL,
  process.env.NEXT_PUBLIC_API_URL_FALLBACK,
]
  .filter((u): u is string => !!u && /^https:\/\//.test(u))
  .map((u) => u.replace(/\/+$/, ""));

const CONNECT = [
  "'self'",
  "blob:", // photo uploads read the picked file through a blob: URL
  "data:",
  ...new Set(API_HOSTS),
  ...new Set(API_HOSTS.map((u) => u.replace(/^https:/, "wss:"))), // chat
  // NEAR RPC (config/walletConfig.ts)
  "https://test.rpc.fastnear.com",
  "https://free.rpc.fastnear.com",
  "https://near-testnet.drpc.org",
  "https://rpc.shitzuapes.xyz",
  // Transaction history, prices, cross-chain swaps
  "https://api.nearblocks.io",
  "https://api-testnet.nearblocks.io",
  "https://open.er-api.com",
  "https://api.coingecko.com",
  "https://api.coinbase.com",
  "https://1click.chaindefuser.com",
  // Google backup (Firebase Auth + Firestore)
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firestore.googleapis.com",
];

const CSP = [
  "default-src 'self'",
  // Next's own bootstrap runs inline; nothing is loaded from other hosts.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // Listing photos and NFT media come from many hosts (Cloudinary, IPFS
  // gateways, owners' own links), so images stay open to https.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${CONNECT.join(" ")}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'", // no one can show Sheda inside their page to trick clicks
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app needs the camera only for photo uploads via the file picker,
  // which doesn't need this permission; everything here is off.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // Development uses eval and hot-reload sockets; the rules apply to real builds.
    if (process.env.NODE_ENV !== "production") return [];
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

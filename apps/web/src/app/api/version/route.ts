/**
 * GET /api/version  ->  { build: "<commit or build stamp>" }
 *
 * The build that is live right now. Open tabs compare it with the build they
 * loaded and offer a refresh when they differ (components/UpdateBanner.tsx).
 */
export async function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID || "" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

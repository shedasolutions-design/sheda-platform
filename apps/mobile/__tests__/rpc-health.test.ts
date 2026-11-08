// @ts-nocheck — Test file
//
// The public testnet RPCs are shared and rate-limited, and a 429 from them
// arrives without CORS headers, so the browser reports "blocked by CORS
// policy" instead of "throttled". Chasing the CORS message leads nowhere —
// the only fix is to send fewer requests and to stop aiming them at an
// endpoint that has already said no.
import {
  pickEndpointIndex,
  markEndpointUnhealthy,
  markEndpointHealthy,
  isCoolingDown,
  isRateLimitError,
  resetRpcHealth,
} from "@/services/rpcHealth";
import { getRpcEndpoints } from "@/config/walletConfig";

const NETWORK = "testnet";
const ENDPOINT_COUNT = getRpcEndpoints(NETWORK).length;

beforeEach(() => {
  resetRpcHealth();
  jest.useRealTimers();
});

describe("endpoint selection", () => {
  it("prefers the requested endpoint while it is healthy", () => {
    expect(pickEndpointIndex(NETWORK, 0)).toBe(0);
  });

  it("skips an endpoint that rate-limited us", () => {
    markEndpointUnhealthy(NETWORK, 0, "rate-limited");
    expect(isCoolingDown(NETWORK, 0)).toBe(true);
    expect(pickEndpointIndex(NETWORK, 0)).not.toBe(0);
  });

  it("keeps returning a usable endpoint when every one is resting", () => {
    // A stale cooldown must never take the app permanently offline — better to
    // retry a throttled endpoint than to have no endpoint at all.
    for (let i = 0; i < ENDPOINT_COUNT; i++) {
      markEndpointUnhealthy(NETWORK, i, "rate-limited");
    }
    const picked = pickEndpointIndex(NETWORK, 0);
    expect(picked).toBeGreaterThanOrEqual(0);
    expect(picked).toBeLessThan(ENDPOINT_COUNT);
  });

  it("returns an endpoint to service once it responds again", () => {
    markEndpointUnhealthy(NETWORK, 0, "rate-limited");
    markEndpointHealthy(NETWORK, 0);
    expect(isCoolingDown(NETWORK, 0)).toBe(false);
    expect(pickEndpointIndex(NETWORK, 0)).toBe(0);
  });

  it("stops resting an endpoint once its cooldown elapses", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-02T00:00:00Z"));
    markEndpointUnhealthy(NETWORK, 0, "rate-limited");
    expect(isCoolingDown(NETWORK, 0)).toBe(true);

    jest.setSystemTime(new Date("2026-08-02T00:05:00Z"));
    expect(isCoolingDown(NETWORK, 0)).toBe(false);
  });

  it("rests a rate-limited endpoint longer than a merely failed one", () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-02T00:00:00Z"));
    markEndpointUnhealthy(NETWORK, 0, "rate-limited");
    markEndpointUnhealthy(NETWORK, 1, "failed");

    // 30s in: the ordinary failure is forgiven, the throttle is not.
    jest.setSystemTime(new Date("2026-08-02T00:00:30Z"));
    expect(isCoolingDown(NETWORK, 0)).toBe(true);
    expect(isCoolingDown(NETWORK, 1)).toBe(false);
  });
});

describe("rate-limit detection", () => {
  it("recognises an explicit throttle", () => {
    expect(isRateLimitError("Request failed with status 429")).toBe(true);
    expect(isRateLimitError("Too Many Requests")).toBe(true);
    expect(isRateLimitError("rate limit exceeded")).toBe(true);
  });

  it("treats the browser's CORS report as a throttle", () => {
    // A 429 from these endpoints carries no Access-Control-Allow-Origin
    // header, so the status code never reaches JS — all we see is a CORS or
    // "Failed to fetch" error. Backing off is right either way.
    expect(
      isRateLimitError("has been blocked by CORS policy: No 'Access-Control-Allow-Origin'")
    ).toBe(true);
    expect(isRateLimitError("Failed to fetch")).toBe(true);
    expect(isRateLimitError("Network request failed")).toBe(true);
  });

  it("does not mistake a contract error for a throttle", () => {
    expect(isRateLimitError("Smart contract panicked: bid not found")).toBe(false);
    expect(isRateLimitError("AccountDoesNotExist")).toBe(false);
  });
});

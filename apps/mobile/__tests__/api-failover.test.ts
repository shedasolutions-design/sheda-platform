// @ts-nocheck — Test file
//
// Two backend deployments share one database, so moving between them is a
// change of route, not a change of data. That makes falling back safe — but
// only for reads.
//
// A write that fails at the transport layer may still have been applied: a
// timeout says the answer never arrived, not that nothing happened. Retrying
// a POST against the other deployment writes to the same database, so the
// buyer gets two bids, the seller two appointments. Reads have no such
// hazard.
import {
  API_BASES,
  activeBase,
  alternateBase,
  isUnhealthyStatus,
  mayRetryAcrossBases,
  reportDown,
  reportUp,
  resetEndpointHealth,
} from "@/services/apiEndpoints";

const [PRIMARY, FALLBACK] = API_BASES;

beforeEach(() => resetEndpointHealth());

describe("which backend to use", () => {
  it("has two distinct backends configured", () => {
    expect(API_BASES).toHaveLength(2);
    expect(PRIMARY).not.toBe(FALLBACK);
  });

  it("prefers the primary while it is healthy", () => {
    expect(activeBase()).toBe(PRIMARY);
  });

  it("moves to the fallback once the primary has failed", () => {
    reportDown(PRIMARY);
    expect(activeBase()).toBe(FALLBACK);
  });

  it("keeps using the fallback for the whole cooldown, not just one request", () => {
    const t0 = 1_000_000;
    reportDown(PRIMARY, t0);
    expect(activeBase(t0 + 30_000)).toBe(FALLBACK);
  });

  it("returns to the primary once the cooldown has passed", () => {
    const t0 = 1_000_000;
    reportDown(PRIMARY, t0);
    expect(activeBase(t0 + 61_000)).toBe(PRIMARY);
  });

  it("returns to the primary immediately once it answers again", () => {
    reportDown(PRIMARY);
    reportUp(PRIMARY);
    expect(activeBase()).toBe(PRIMARY);
  });

  it("still prefers the primary when everything is benched", () => {
    // Every base failing usually means the device is offline, not that both
    // deployments are down. Pinning to whichever failed least recently would
    // strand the app on the slower one after the network returns.
    reportDown(PRIMARY);
    reportDown(FALLBACK);
    expect(activeBase()).toBe(PRIMARY);
  });

  it("offers the other backend as an alternate, and never the same one", () => {
    expect(alternateBase(PRIMARY)).toBe(FALLBACK);
    expect(alternateBase(FALLBACK)).toBe(PRIMARY);
  });

  it("offers no alternate when the other one is already benched", () => {
    reportDown(FALLBACK);
    expect(alternateBase(PRIMARY)).toBeNull();
  });
});

describe("what counts as the backend being unhealthy", () => {
  it("treats gateway errors as unhealthy", () => {
    for (const status of [502, 503, 504]) {
      expect(isUnhealthyStatus(status)).toBe(true);
    }
  });

  it("does not treat a 500 as worth failing over", () => {
    // Both deployments run the same code, so an application bug raises 500 on
    // each. Failing over would buy a second round trip to the same error.
    expect(isUnhealthyStatus(500)).toBe(false);
  });

  it("does not treat the backend disagreeing with us as unhealthy", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isUnhealthyStatus(status)).toBe(false);
    }
  });
});

describe("what may be retried on the other backend", () => {
  it("retries reads", () => {
    expect(mayRetryAcrossBases("GET")).toBe(true);
    expect(mayRetryAcrossBases(undefined)).toBe(true); // fetch defaults to GET
    expect(mayRetryAcrossBases("get")).toBe(true);
  });

  it("never retries a write", () => {
    // The hazard that motivates the whole rule: a timed-out POST may already
    // have been applied to the shared database.
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(mayRetryAcrossBases(verb)).toBe(false);
      expect(mayRetryAcrossBases(verb.toLowerCase())).toBe(false);
    }
  });
});

describe("the configuration that actually ships", () => {
  // The suite above reads API_BASES through expo-constants, which under
  // Jest falls back to the defaults compiled into apiEndpoints.ts. Those
  // defaults are two distinct hosts, so "has two distinct backends"
  // passed happily while the shipped app.json collapsed them to one and
  // the real app had no failover at all for months.
  //
  // So this reads app.json itself, which is the thing that gets built.
  const extra = require("../app.json").expo.extra;

  // The same resolution the real code performs: app.config.ts reads
  // app.json, then apiEndpoints.ts applies its own defaults for anything
  // left unset. Modelling only the first half is what let the collapse
  // through, because an absent fallback looks different from a duplicate
  // one right up until the default fills it in.
  const PRIMARY_SHIPPED = extra.apiUrl ?? "https://sheda.peni.dev";
  const FALLBACK_SHIPPED = extra.apiUrlFallback ?? "https://sheda-backend-1.onrender.com";
  const SHIPPED = [...new Set([PRIMARY_SHIPPED, FALLBACK_SHIPPED])].filter(Boolean);

  it("names both deployments, so there is something to fall back to", () => {
    expect(extra.apiUrl).toBeTruthy();
    expect(extra.apiUrlFallback).toBeTruthy();
    expect(SHIPPED).toHaveLength(2);
  });

  it("puts Cloudflare first, because it is the faster one and does not cold start", () => {
    // Render takes seconds to wake and answers a spec request roughly ten
    // times slower. It is the way back, not the way in.
    expect(PRIMARY_SHIPPED).toContain("sheda.peni.dev");
    expect(FALLBACK_SHIPPED).toContain("onrender.com");
  });

  it("does not let the two collapse into one base", () => {
    // The Set dedupe in apiEndpoints.ts is what silently removed the
    // fallback last time: both values were the same host.
    expect(PRIMARY_SHIPPED).not.toBe(FALLBACK_SHIPPED);
  });
});

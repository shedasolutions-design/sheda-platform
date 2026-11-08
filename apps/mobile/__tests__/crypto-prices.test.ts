// @ts-nocheck — Test file with Jest mocks
//
// Token prices vanished from the wallet: every row read "Price unavailable" and
// the portfolio total showed ~₦0.00 while the balances themselves were correct.
//
// The cause was hermes.pyth.network answering 401 to everyone — verified with
// plain curl, no Origin involved. The browser reported it as a CORS failure
// only because a 401 from that host carries no Access-Control-Allow-Origin, so
// the console pointed at the wrong problem entirely.
//
// What is pinned here is the behaviour that keeps a price outage from reading
// as "your money is gone": fall back, quote stablecoins at parity, and never
// let an unpriced token be mistaken for a worthless one.

import { fetchUsdPrices, SUPPORTED_PRICE_SYMBOLS } from "@/services/cryptoPrices";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

const json = (body: any, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) });

const coingeckoBody = {
  near: { usd: 2.4 },
  tether: { usd: 0.999 },
  "usd-coin": { usd: 0.9998 },
  ethereum: { usd: 2521 },
  bitcoin: { usd: 77876 },
};

describe("happy path", () => {
  it("prices everything from one CoinGecko call", async () => {
    const fetchMock = jest.fn(() => json(coingeckoBody));
    global.fetch = fetchMock;

    const prices = await fetchUsdPrices(["NEAR", "USDT", "USDC"]);

    expect(prices).toEqual({ NEAR: 2.4, USDT: 0.999, USDC: 0.9998 });
    // One request for all symbols, not one per symbol — this runs on wallet
    // mount and on every poll.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks CoinGecko only for symbols it knows", async () => {
    const fetchMock = jest.fn(() => json(coingeckoBody));
    global.fetch = fetchMock;

    await fetchUsdPrices(["NEAR", "DOGECOIN_THAT_DOES_NOT_EXIST"]);
    const url = fetchMock.mock.calls[0][0];
    expect(url).toContain("near");
    expect(url).not.toContain("DOGECOIN");
  });
});

describe("when the primary source is down", () => {
  it("falls back to Coinbase for real prices", async () => {
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes("coingecko")) return json({}, false, 500);
      if (String(url).includes("NEAR-USD")) return json({ data: { amount: "2.41" } });
      return json({}, false, 404);
    });

    const prices = await fetchUsdPrices(["NEAR"]);
    expect(prices.NEAR).toBeCloseTo(2.41);
  });

  it("does not spend a request on stablecoins it can assume", async () => {
    // Parity is a better answer than a round trip for USDT/USDC, and the
    // fallback is one request per symbol.
    const fetchMock = jest.fn((url: string) => {
      if (String(url).includes("coingecko")) return json({}, false, 500);
      return json({ data: { amount: "2.41" } });
    });
    global.fetch = fetchMock;

    await fetchUsdPrices(["USDT", "USDC"]);

    const coinbaseCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("coinbase")
    );
    expect(coinbaseCalls).toHaveLength(0);
  });
});

describe("when every source is down", () => {
  it("still quotes stablecoins at parity", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("network down")));

    const prices = await fetchUsdPrices(["USDT", "USDC"]);

    // A wallet that is mostly USDC reading as ₦0.00 is alarming and wrong;
    // $1 is very close to right.
    expect(prices.USDT).toBe(1);
    expect(prices.USDC).toBe(1);
  });

  it("omits what it cannot price, rather than reporting zero", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("network down")));

    const prices = await fetchUsdPrices(["NEAR"]);

    // The distinction the UI depends on: absent means "not known", which
    // renders as "Price unavailable". A 0 would mean "worthless" and would
    // silently drag the portfolio total down.
    expect(prices.NEAR).toBeUndefined();
    expect(prices.NEAR).not.toBe(0);
  });

  it("never throws — a missing price must not take the wallet down", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("network down")));
    await expect(fetchUsdPrices(["NEAR", "ETH"])).resolves.toEqual({});
  });
});

describe("bad data from a source", () => {
  it("ignores non-numeric and non-positive quotes", async () => {
    global.fetch = jest.fn((url: string) => {
      if (String(url).includes("coingecko")) {
        return json({ near: { usd: "not-a-number" }, ethereum: { usd: 0 } });
      }
      return Promise.reject(new Error("no fallback"));
    });

    const prices = await fetchUsdPrices(["NEAR", "ETH"]);
    // A zero or a string would poison every total computed from it.
    expect(prices.NEAR).toBeUndefined();
    expect(prices.ETH).toBeUndefined();
  });
});

describe("supported symbols", () => {
  it("covers the tokens the wallet actually holds", () => {
    for (const s of ["NEAR", "USDT", "USDC"]) {
      expect(SUPPORTED_PRICE_SYMBOLS).toContain(s);
    }
  });
});

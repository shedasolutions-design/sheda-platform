// react-native's own WebSocket polyfill (pulled in via the jest-expo preset)
// happily attempts a REAL network connection when instantiated under Jest —
// slow, network-dependent, and prone to hanging a test run. ApiContext now
// connects its chat WebSocket for the whole authenticated session rather
// than only while a chat screen happens to be mounted, so any test that
// renders a real ApiProvider with a mock-authenticated user reaches this
// code path now, whether or not the test itself cares about WebSocket
// behavior at all.
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    // Deliberately never transitions to OPEN/fires onopen — nothing here
    // simulates a live server. Tests that need to exercise connected-state
    // behavior should drive the instance's callbacks directly.
  }

  send() {}

  close() {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ reason: "mock close", code: 1000, wasClean: true });
  }
}

global.WebSocket = MockWebSocket;

// NEAR RPC is real network, and under Jest it is reached for real.
//
// The contract service probes each endpoint with a 15-second ceiling and
// walks the whole list before giving up, so any suite that touches it pays
// 30 seconds or more — and under a full parallel run that was enough to push
// property-listing and seller-navigation past their timeouts and fail them,
// intermittently and for no reason connected to what they assert.
//
// Failing the connection immediately reaches exactly the same place: the
// service catches it, marks the endpoint unhealthy, tries the next, and ends
// at ERR_RPC_TIMEOUT just as it does now. Same outcome, without the wait.
//
// Only these hosts are intercepted. Everything else — including the API
// client, and any fetch a test installs for itself afterwards — is untouched.
const NEAR_RPC_HOSTS = [
  "test.rpc.fastnear.com",
  "near-testnet.drpc.org",
  "free.rpc.fastnear.com",
  "rpc.shitzuapes.xyz",
];

const realFetch = global.fetch;
global.fetch = function (input, init) {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (NEAR_RPC_HOSTS.some((host) => url.includes(host))) {
    return Promise.reject(
      new Error("NEAR RPC is not reachable from tests (blocked by jest.setup.js)")
    );
  }
  if (typeof realFetch !== "function") {
    return Promise.reject(new Error(`No fetch available in this environment for ${url}`));
  }
  return realFetch(input, init);
};

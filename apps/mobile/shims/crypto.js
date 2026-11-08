// Crypto shim for React Native
// This shim serves two purposes:
// 1. Acts as the `crypto` module alias for metro bundler
// 2. Patches globalThis.crypto so @noble/hashes (and similar libs) can find getRandomValues

// Import the polyfill first - this patches global.crypto.getRandomValues
require("react-native-get-random-values");

// Ensure globalThis.crypto is set up (some libs check globalThis, not global)
if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = {};
}

// Copy getRandomValues from global.crypto (set by polyfill) to globalThis.crypto if needed
if (typeof globalThis.crypto.getRandomValues !== "function") {
  if (global.crypto && typeof global.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues = global.crypto.getRandomValues.bind(global.crypto);
  }
}

module.exports = globalThis.crypto;
module.exports.default = globalThis.crypto;
module.exports.crypto = globalThis.crypto;

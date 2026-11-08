// Override for @noble/hashes/crypto
// Ensures globalThis.crypto.getRandomValues is available before noble-hashes accesses it
require("react-native-get-random-values");

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = {};
}
if (typeof globalThis.crypto.getRandomValues !== "function" && global.crypto && typeof global.crypto.getRandomValues === "function") {
  globalThis.crypto.getRandomValues = global.crypto.getRandomValues.bind(global.crypto);
}

// This matches the export shape of @noble/hashes/crypto
exports.crypto = globalThis.crypto;

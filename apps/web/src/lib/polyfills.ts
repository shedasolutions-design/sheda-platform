// Must be the first import of the client tree (see app/providers.tsx).
//
// The NEAR libraries and bip39 expect Node's Buffer on the global object.
// Browsers do not have one, so it is installed here before any of those
// modules evaluate. ES modules evaluate in import order, which is what makes
// "first import" a guarantee rather than a hope.
import { Buffer } from "buffer";

if (typeof globalThis !== "undefined" && !(globalThis as any).Buffer) {
  (globalThis as any).Buffer = Buffer;
}

// MetaMask injects a script into every page and throws unhandled rejections
// when it cannot reach its own background service. Not our code.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const msg = String(event?.reason?.message || event?.reason || "");
    if (msg.includes("MetaMask") || msg.includes("inpage.js")) event.preventDefault();
  });
}

export {};

// ============================================================================
// Randomness and hashing, from the browser's Web Crypto API.
// ============================================================================
// Replaces expo-crypto with the same function names, so the wallet code that
// generates salts, nonces and PIN hashes reads exactly as it did on mobile.
// Every function here uses crypto.getRandomValues / crypto.subtle, which are
// cryptographically secure in every browser Sheda supports.
// ============================================================================

export enum CryptoDigestAlgorithm {
  SHA256 = "SHA-256",
  SHA512 = "SHA-512",
}

export function getRandomBytes(byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export async function getRandomBytesAsync(byteCount: number): Promise<Uint8Array> {
  return getRandomBytes(byteCount);
}

export function getRandomValues<T extends ArrayBufferView>(array: T): T {
  return globalThis.crypto.getRandomValues(array as any) as T;
}

export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

/** Hex digest of a UTF-8 string, matching expo-crypto's default encoding. */
export async function digestStringAsync(
  algorithm: CryptoDigestAlgorithm,
  data: string
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    algorithm,
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

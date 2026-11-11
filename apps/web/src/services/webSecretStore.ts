// ============================================================================
// Web Secret Store — encrypted at-rest storage for the browser
// ============================================================================
// Its own module so the import graph stays acyclic:
//
//   secureStorage   -> webSecretStore    (web secrets live here)
//   platformAdapter -> secureStorage     (dispatches by platform)
//
// Folding this into platformAdapter meant secureStorage and platformAdapter
// imported each other, which only worked via dynamic import() — and that in
// turn cannot run under this project's Jest config.
//
// WHY crypto.subtle HERE BUT PURE-JS IN services/walletCrypto.ts:
// Opposite requirements. Cloud backups must be portable across Hermes and the
// browser, so those use @noble. At-rest web storage never leaves the browser,
// so it uses the strictly better primitive available: a NON-EXTRACTABLE
// CryptoKey. Script on the origin can ask it to decrypt but cannot read the key
// bytes out to exfiltrate them. Plain localStorage — the previous behaviour —
// handed the seed phrase to anything that could read the origin's storage.
// ============================================================================



const isWeb = true;

// A hand-rolled ~60-line IndexedDB wrapper instead of the `idb` package: the
// surface needed here is three operations on two object stores, and adding a
// dependency that only matters on one of two platforms is a worse trade than
// the code below.

const DB_NAME = "sheda-wallet";
const DB_VERSION = 1;
const STORE_BLOBS = "blobs";
const STORE_KEYS = "keys";
const DEVICE_KEY_ID = "device-wrap-key";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BLOBS))
        db.createObjectStore(STORE_BLOBS);
      if (!db.objectStoreNames.contains(STORE_KEYS))
        db.createObjectStore(STORE_KEYS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(
  db: IDBDatabase,
  store: string,
  key: string
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(
  db: IDBDatabase,
  store: string,
  key: string,
  value: unknown
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Fetches (or creates) this browser's wrapping key.
 *
 * extractable: false is the whole point — IndexedDB stores the live CryptoKey
 * object, and neither devtools nor injected script can read its bytes back out.
 */
async function getDeviceWrapKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(db, STORE_KEYS, DEVICE_KEY_ID);
  if (existing) return existing;
  const key = await globalThis.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  await idbPut(db, STORE_KEYS, DEVICE_KEY_ID, key);
  return key;
}

interface WebBlobRecord {
  iv: ArrayBuffer;
  data: ArrayBuffer;
}

/**
 * True when secrets can be encrypted at rest on this runtime. False on native,
 * during SSR/prerender, and in a bare Jest environment — all of which lack
 * IndexedDB, crypto.subtle, or both.
 */
export function webAvailable(): boolean {
  return (
    isWeb &&
    typeof globalThis.indexedDB !== "undefined" &&
    typeof globalThis.crypto?.subtle !== "undefined"
  );
}

/** The web-only encrypted secret store. */
export const webSecretStore = {
  available: webAvailable,

  async set(key: string, plaintext: string): Promise<void> {
    const db = await openDb();
    const wrapKey = await getDeviceWrapKey(db);
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const data = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      wrapKey,
      new TextEncoder().encode(plaintext)
    );
    await idbPut(db, STORE_BLOBS, key, { iv: iv.buffer, data } as WebBlobRecord);
  },

  async get(key: string): Promise<string | null> {
    const db = await openDb();
    const rec = await idbGet<WebBlobRecord>(db, STORE_BLOBS, key);
    if (!rec) return null;
    const wrapKey = await getDeviceWrapKey(db);
    const plain = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(rec.iv) },
      wrapKey,
      rec.data
    );
    return new TextDecoder().decode(plain);
  },

  async remove(key: string): Promise<void> {
    const db = await openDb();
    await idbDelete(db, STORE_BLOBS, key);
  },
};

export default webSecretStore;

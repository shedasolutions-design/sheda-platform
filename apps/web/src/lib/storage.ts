// ============================================================================
// Key-value storage for the browser.
// ============================================================================
// The logic carried over from the Expo app was written against AsyncStorage's
// promise API. Rather than rewrite seventy call sites, this module offers the
// same shape on top of localStorage, so the services read exactly as they did.
//
// localStorage does not exist while Next renders on the server, so every call
// is a no-op there and answers "nothing stored". Anything that reads storage
// runs again on the client after hydration, which is where it matters.
// ============================================================================

function store(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Private windows and blocked site data can throw on access.
    return null;
  }
}

const storage = {
  async getItem(key: string): Promise<string | null> {
    return store()?.getItem(key) ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    store()?.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    store()?.removeItem(key);
  },

  async getAllKeys(): Promise<string[]> {
    const s = store();
    if (!s) return [];
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k !== null) keys.push(k);
    }
    return keys;
  },

  async multiGet(keys: readonly string[]): Promise<[string, string | null][]> {
    const s = store();
    return keys.map((k) => [k, s?.getItem(k) ?? null]);
  },

  async multiRemove(keys: readonly string[]): Promise<void> {
    const s = store();
    keys.forEach((k) => s?.removeItem(k));
  },

  async clear(): Promise<void> {
    store()?.clear();
  },
};

export type KeyValueStorage = typeof storage;
export default storage;

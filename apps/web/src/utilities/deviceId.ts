/**
 * A random id for this browser, sent when signing in so the server can tell
 * a device it has seen before from a new one (which is asked for a code).
 *
 * It identifies nothing about the person or the machine: it is a random
 * value kept in this browser. Clearing site data makes a new one, and the
 * next sign-in here asks for a code again, which is the safe direction.
 */
const KEY = "sheda_device_id";

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Storage blocked (private mode): no id, so every sign-in asks for a code.
    return "";
  }
}

import { AppState } from "@/lib/appState";

/**
 * Shows a browser notification when a transaction finishes while the Sheda
 * tab is in the background. Local only: the app raises it the moment its own
 * call resolves, so it fires only while the tab is still open. The in-app
 * toast and notification inbox cover every other case.
 */

let permissionRequested = false;

async function ensurePermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied" || permissionRequested) return false;
  permissionRequested = true;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch (error) {
    console.warn("localNotifications: permission request failed:", error);
    return false;
  }
}

export async function notifyIfBackgrounded(title: string, body: string): Promise<void> {
  if (AppState.currentState === "active") return;
  try {
    if (!(await ensurePermission())) return;
    new Notification(title, { body });
  } catch (error) {
    console.warn("localNotifications: failed to show notification:", error);
  }
}

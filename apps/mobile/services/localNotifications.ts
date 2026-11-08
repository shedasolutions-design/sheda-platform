import { AppState } from "react-native";
import * as Notifications from "expo-notifications";

/**
 * Fires a real OS notification when a transaction finishes while the app
 * isn't in the foreground. This is a LOCAL notification the app schedules
 * itself the moment its own async call resolves — not a server-sent push.
 * There is no backend leg in the NEAR transaction flow to push from, so
 * this only works while the app process is still alive (foregrounded or
 * backgrounded); it will never fire if the app has been force-quit.
 */

let permissionRequested = false;

async function ensurePermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (permissionRequested) return false;
    permissionRequested = true;
    const result = await Notifications.requestPermissionsAsync();
    return !!result.granted;
  } catch (error) {
    // Not supported on this platform (e.g. some web contexts) — degrade
    // silently, the in-app toast + notification inbox still cover it.
    console.warn("localNotifications: permission check/request failed:", error);
    return false;
  }
}

export async function notifyIfBackgrounded(title: string, body: string): Promise<void> {
  if (AppState.currentState === "active") return;

  try {
    const granted = await ensurePermission();
    if (!granted) return;

    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
  } catch (error) {
    console.warn("localNotifications: failed to schedule notification:", error);
  }
}

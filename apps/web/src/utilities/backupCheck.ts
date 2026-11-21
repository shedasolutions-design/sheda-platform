/**
 * When this wallet's backup password was last shown to work.
 *
 * A forgotten backup password cannot be reset by anyone: it is the only key
 * to the backup. What can be done is to notice early, while the wallet is
 * still open on a device and a new password can simply be set. So the app
 * remembers when the password last worked (a backup made, a restore, or a
 * test) and nudges a test after CHECK_EVERY_DAYS.
 *
 * Only a date is stored, in this browser. Never the password.
 */
const PREFIX = "sheda.backup.checked.v1.";
export const CHECK_EVERY_DAYS = 90;

export function getLastChecked(accountId: string): number | null {
  try {
    const v = Number(localStorage.getItem(PREFIX + accountId));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function markChecked(accountId: string): void {
  try {
    localStorage.setItem(PREFIX + accountId, String(Date.now()));
  } catch {
    /* storage blocked: the nudge just shows again */
  }
}

/** True when a test is due: never recorded here, or older than CHECK_EVERY_DAYS. */
export function isCheckDue(accountId: string, now = Date.now()): boolean {
  const last = getLastChecked(accountId);
  return last === null || now - last > CHECK_EVERY_DAYS * 86_400_000;
}

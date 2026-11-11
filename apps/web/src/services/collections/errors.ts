/**
 * Turning a failed request into a sentence worth showing.
 *
 * Its own module, not a helper inside the hook, because the hook imports
 * the wallet context and that reaches native storage. Anything importing
 * it to test a pure function pulls the whole tree in and fails on a
 * missing native module, which has caught this repository twice already.
 * Pure logic lives where it can be loaded on its own.
 */

/**
 * `ApiResponse.error` is `any`: sometimes a string this app wrote,
 * sometimes the backend's own body. Passing that object straight to
 * `new Error` renders "[object Object]" on screen, which tells the reader
 * nothing and tells whoever is debugging it less.
 *
 * FastAPI puts its reason in `detail`: a string for an ordinary failure,
 * a list of field errors for a 422.
 */
export function describeApiError(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;

  if (error && typeof error === "object") {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;

    if (Array.isArray(detail)) {
      const messages = detail
        .map((d) => (d && typeof d === "object" ? (d as { msg?: string }).msg : null))
        .filter((m): m is string => Boolean(m && m.trim()));
      if (messages.length > 0) return messages.join(". ");
    }

    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return fallback;
}

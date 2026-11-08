// @ts-nocheck — Test file
//
// A CORS-blocked error response is indistinguishable from a dead connection at
// the JS level: the browser reports "TypeError: Failed to fetch" and hides the
// status code. This backend's error responses don't send
// Access-Control-Allow-Origin, so a plain 500 (e.g. DELETE
// /api/v1/property/delete/7) surfaced to the user as "Unable to connect to the
// server. Please check your internet connection" — sending them to debug the
// one thing that wasn't broken.
import { getUserFriendlyError, categorizeError } from "@/utilities/errorUtils";

const originalNavigator = global.navigator;

function setOnline(value) {
    Object.defineProperty(global, "navigator", {
        value: value === undefined ? undefined : { onLine: value },
        configurable: true,
        writable: true,
    });
}

afterEach(() => {
    Object.defineProperty(global, "navigator", {
        value: originalNavigator,
        configurable: true,
        writable: true,
    });
});

describe("network error messaging", () => {
    const fetchFailure = new TypeError("Failed to fetch");

    it("does not blame the connection when the device is online", () => {
        setOnline(true);
        const message = getUserFriendlyError(fetchFailure);

        expect(message).not.toMatch(/your internet connection/i);
        expect(message).toMatch(/couldn't reach the server/i);
    });

    it("says so plainly when the device really is offline", () => {
        setOnline(false);
        expect(getUserFriendlyError(fetchFailure)).toMatch(/offline/i);
    });

    it("stays vague when the platform can't report connectivity", () => {
        // React Native has no navigator.onLine — guessing "you're offline"
        // there would be the same false claim.
        setOnline(undefined);
        const message = getUserFriendlyError(fetchFailure);

        expect(message).not.toMatch(/your internet connection/i);
        expect(message).toMatch(/couldn't reach the server/i);
    });

    it("still categorises the failure as retryable network trouble", () => {
        setOnline(true);
        const categorized = categorizeError(fetchFailure);

        expect(categorized.category).toBe("network");
        expect(categorized.shouldRetry).toBe(true);
    });

    it("leaves errors the server did explain alone", () => {
        setOnline(true);
        // A response that reached us with a readable status keeps its own
        // handling — this fix is only about the ambiguous case.
        expect(categorizeError(new Error("404 not found")).category).toBe("notFound");
        expect(categorizeError(new Error("401 unauthorized")).category).toBe("auth");
    });
});

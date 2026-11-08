/**
 * Network connectivity utilities
 * Note: For a production app, consider using @react-native-community/netinfo
 */

/**
 * Simple network check by attempting to fetch a known resource
 * This is a basic implementation - for production, use @react-native-community/netinfo
 */
export async function checkNetworkConnectivity(): Promise<boolean> {
    try {
        // Try to fetch a lightweight resource with a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch('https://www.google.com/favicon.ico', {
            method: 'HEAD',
            signal: controller.signal,
        });

        clearTimeout(timeoutId);
        return response.ok;
    } catch (error) {
        return false;
    }
}

/**
 * Gets a user-friendly message when offline
 */
export function getOfflineMessage(): string {
    return 'You appear to be offline. Please check your internet connection.';
}

/**
 * Checks if we should proceed with a network request
 * Returns an error message if we shouldn't proceed, null otherwise
 */
export async function shouldProceedWithRequest(): Promise<string | null> {
    const isOnline = await checkNetworkConnectivity();
    if (!isOnline) {
        return getOfflineMessage();
    }
    return null;
}

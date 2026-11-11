/**
 * Error handling utilities for consistent error processing across the app
 */

export type ErrorCategory =
    | 'network'
    | 'auth'
    | 'validation'
    | 'notFound'
    | 'server'
    | 'client'
    | 'timeout'
    | 'unknown';

export interface CategorizedError {
    category: ErrorCategory;
    message: string;
    originalError: any;
    shouldRetry: boolean;
    userFriendly: boolean;
}

/**
 * Categorizes an error into one of the predefined categories
 */
export function categorizeError(error: any): CategorizedError {
    const errorString = error?.message || String(error) || '';
    const errorLower = errorString.toLowerCase();

    // Network errors
    if (
        errorLower.includes('network') ||
        errorLower.includes('fetch') ||
        errorLower.includes('internet') ||
        errorLower.includes('connection') ||
        error?.name === 'NetworkError' ||
        error?.code === 'NETWORK_ERROR'
    ) {
        return {
            category: 'network',
            message: errorString,
            originalError: error,
            shouldRetry: true,
            userFriendly: false,
        };
    }

    // Timeout errors
    if (
        errorLower.includes('timeout') ||
        errorLower.includes('timed out') ||
        error?.name === 'AbortError' ||
        error?.name === 'TimeoutError'
    ) {
        return {
            category: 'timeout',
            message: errorString,
            originalError: error,
            shouldRetry: true,
            userFriendly: false,
        };
    }

    // Authentication errors
    if (
        errorLower.includes('401') ||
        errorLower.includes('unauthorized') ||
        errorLower.includes('authentication') ||
        errorLower.includes('token') ||
        errorLower.includes('login')
    ) {
        return {
            category: 'auth',
            message: errorString,
            originalError: error,
            shouldRetry: false,
            userFriendly: false,
        };
    }

    // Not found errors
    if (
        errorLower.includes('404') ||
        errorLower.includes('not found')
    ) {
        return {
            category: 'notFound',
            message: errorString,
            originalError: error,
            shouldRetry: false,
            userFriendly: false,
        };
    }

    // Validation errors
    if (
        errorLower.includes('validation') ||
        errorLower.includes('invalid') ||
        errorLower.includes('required') ||
        error?.name === 'ValidationError'
    ) {
        return {
            category: 'validation',
            message: errorString,
            originalError: error,
            shouldRetry: false,
            userFriendly: true,
        };
    }

    // Server errors (5xx)
    if (
        errorLower.includes('500') ||
        errorLower.includes('502') ||
        errorLower.includes('503') ||
        errorLower.includes('504') ||
        errorLower.includes('server error')
    ) {
        return {
            category: 'server',
            message: errorString,
            originalError: error,
            shouldRetry: true,
            userFriendly: false,
        };
    }

    // Client errors (4xx, excluding auth and validation)
    if (
        errorLower.includes('400') ||
        errorLower.includes('403') ||
        errorLower.includes('client error')
    ) {
        return {
            category: 'client',
            message: errorString,
            originalError: error,
            shouldRetry: false,
            userFriendly: false,
        };
    }

    // Unknown errors
    return {
        category: 'unknown',
        message: errorString,
        originalError: error,
        shouldRetry: false,
        userFriendly: false,
    };
}

/**
 * Whether the platform positively reports the device as offline.
 *
 * A failed fetch is ambiguous: a dead connection and an error response without
 * CORS headers both surface as "TypeError: Failed to fetch" with no status
 * code. So we only blame the connection when the platform actually says it is
 * down. React Native exposes no navigator.onLine, and a browser that cannot
 * report connectivity is not evidence of anything — both stay ambiguous.
 */
function isDefinitelyOffline(): boolean {
    return (globalThis as any)?.navigator?.onLine === false;
}

/**
 * Converts technical errors to user-friendly messages
 */
export function getUserFriendlyError(error: any): string {
    const categorized = categorizeError(error);

    // If the error is already user-friendly, return it
    if (categorized.userFriendly && categorized.message) {
        return categorized.message;
    }

    // Generate user-friendly messages based on category
    switch (categorized.category) {
        case 'network':
            return isDefinitelyOffline()
                ? "You're offline. Reconnect and try again."
                : "We couldn't reach the server. Please try again in a moment.";

        case 'timeout':
            return 'The request took too long to complete. Please try again.';

        case 'auth': {
            const msgLower = categorized.message.toLowerCase();
            if (msgLower.includes('password') || msgLower.includes('incorrect') || msgLower.includes('wrong')) {
                return 'Incorrect password. Please try again.';
            }
            if (msgLower.includes('not found') || msgLower.includes('no account') || msgLower.includes('does not exist')) {
                return 'Account not found. Please check your credentials or sign up.';
            }
            if (msgLower.includes('already') || msgLower.includes('exists') || msgLower.includes('registered') || msgLower.includes('duplicate')) {
                return 'This email is already registered. Try signing in instead.';
            }
            if (msgLower.includes('token') || msgLower.includes('session') || msgLower.includes('expired')) {
                return 'Your session has expired. Please log in again.';
            }
            return 'Authentication failed. Please check your credentials and try again.';
        }

        case 'notFound':
            return 'Account not found. Please check your credentials or sign up.';

        case 'validation':
            // Try to extract the validation message
            if (categorized.message && !categorized.message.includes('HTTP')) {
                return categorized.message;
            }
            return 'Please check your input and try again.';

        case 'server':
            return 'The server is experiencing issues. Please try again later.';

        case 'client': {
            const clientMsg = categorized.message.toLowerCase();
            if (clientMsg.includes('already') || clientMsg.includes('exists') || clientMsg.includes('registered')) {
                return 'This email is already registered. Try signing in instead.';
            }
            if (categorized.message && !categorized.message.includes('HTTP')) {
                return categorized.message;
            }
            return 'There was a problem with your request. Please try again.';
        }

        case 'unknown':
        default:
            // Try to use the original message if it's not too technical
            if (categorized.message &&
                !categorized.message.includes('HTTP') &&
                !categorized.message.includes('Error:') &&
                categorized.message.length < 100) {
                return categorized.message;
            }
            return 'An unexpected error occurred. Please try again.';
    }
}

/**
 * Checks if an error is network-related
 */
export function isNetworkError(error: any): boolean {
    return categorizeError(error).category === 'network';
}

/**
 * Determines if an operation should be retried based on the error
 */
export function shouldRetry(error: any): boolean {
    return categorizeError(error).shouldRetry;
}

/**
 * Centralized error logging with context
 */
export function logError(error: any, context?: string): void {
    const categorized = categorizeError(error);
    const timestamp = new Date().toISOString();

    console.group(`🔴 Error ${context ? `[${context}]` : ''} - ${timestamp}`);
    console.log('Category:', categorized.category);
    console.log('Message:', categorized.message);
    console.log('Should Retry:', categorized.shouldRetry);

    if (categorized.originalError?.stack) {
        console.log('Stack:', categorized.originalError.stack);
    }

    console.groupEnd();

    // In production, you could send this to an error tracking service
    // e.g., Sentry, Bugsnag, etc.
}

/**
 * Formats error for display in development mode
 */
export function getErrorDetails(error: any): string {
    if ((process.env.NODE_ENV !== "production")) {
        const categorized = categorizeError(error);
        return `
Category: ${categorized.category}
Message: ${categorized.message}
Should Retry: ${categorized.shouldRetry}
${categorized.originalError?.stack ? `\nStack:\n${categorized.originalError.stack}` : ''}
    `.trim();
    }
    return '';
}

/**
 * Error handling utilities for consistent error management.
 * Provides error code extraction, formatting, and categorization.
 */

/**
 * Error categories for retry decisions.
 */
export const ERROR_CATEGORIES = {
  /** Network connectivity errors - usually retryable */
  NETWORK: ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'EPIPE'],
  /** Rate limiting errors - retryable with backoff */
  RATE_LIMIT: ['429', 'RATE_LIMITED', 'TOO_MANY_REQUESTS', 'RESOURCE_EXHAUSTED'],
  /** Authentication errors - usually not retryable */
  AUTH: ['401', '403', 'UNAUTHORIZED', 'FORBIDDEN', 'UNAUTHENTICATED', 'PERMISSION_DENIED'],
  /** Server errors - may be retryable */
  SERVER: ['500', '502', '503', '504', 'INTERNAL', 'UNAVAILABLE'],
  /** Client errors - usually not retryable */
  CLIENT: ['400', '404', '405', '422', 'INVALID_ARGUMENT', 'NOT_FOUND'],
} as const;

/**
 * Context information for error reporting.
 */
export interface ErrorContext {
  /** Where the error occurred (e.g., 'agent:execute', 'api:request') */
  source: string;
  /** Additional metadata about the error context */
  metadata?: Record<string, unknown>;
  /** Timestamp when the error occurred */
  timestamp?: Date;
}

/**
 * Handler function for aggregated errors.
 */
export type ErrorHandler = (error: unknown, context: ErrorContext) => void;

/** Private registry of error handlers */
const errorHandlers = new Set<ErrorHandler>();

/**
 * Register a handler to receive error reports.
 * @param handler - Function to call when errors are reported
 * @returns Unsubscribe function to remove the handler
 */
export function registerErrorHandler(handler: ErrorHandler): () => void {
  errorHandlers.add(handler);
  return () => {
    errorHandlers.delete(handler);
  };
}

/**
 * Report an error to all registered handlers.
 * @param error - The error that occurred
 * @param context - Context information about where/how the error occurred
 */
export function reportError(error: unknown, context: ErrorContext): void {
  const contextWithTimestamp: ErrorContext = {
    ...context,
    timestamp: context.timestamp ?? new Date(),
  };

  for (const handler of errorHandlers) {
    try {
      handler(error, contextWithTimestamp);
    } catch {
      // Prevent handler errors from affecting other handlers
    }
  }
}

/**
 * Extract an error code from an unknown error.
 */
export function extractErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') {
    return undefined;
  }

  const errObj = err as { code?: unknown; statusCode?: unknown; status?: unknown; httpCode?: unknown };

  if (typeof errObj.code === 'string') {
    return errObj.code;
  }
  if (typeof errObj.code === 'number') {
    return String(errObj.code);
  }
  if (typeof errObj.statusCode === 'number') {
    return String(errObj.statusCode);
  }
  if (typeof errObj.status === 'number') {
    return String(errObj.status);
  }
  if (typeof errObj.httpCode === 'number') {
    return String(errObj.httpCode);
  }

  return undefined;
}

/**
 * Extract HTTP status code from an error.
 */
export function extractHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') {
    return undefined;
  }

  const errObj = err as { statusCode?: unknown; status?: unknown; response?: { status?: unknown } };

  if (typeof errObj.statusCode === 'number') {
    return errObj.statusCode;
  }
  if (typeof errObj.status === 'number') {
    return errObj.status;
  }
  if (errObj.response && typeof errObj.response.status === 'number') {
    return errObj.response.status;
  }

  return undefined;
}

/**
 * Format an error into a user-friendly message.
 */
export function formatErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message || err.name || 'Error';
  }
  if (typeof err === 'string') {
    return err;
  }
  if (typeof err === 'number' || typeof err === 'boolean' || typeof err === 'bigint') {
    return String(err);
  }
  try {
    return JSON.stringify(err);
  } catch {
    return Object.prototype.toString.call(err);
  }
}

/**
 * Format an uncaught error with full details including stack trace.
 */
export function formatUncaughtError(err: unknown): string {
  if (extractErrorCode(err) === 'INVALID_CONFIG') {
    return formatErrorMessage(err);
  }
  if (err instanceof Error) {
    return err.stack ?? err.message ?? err.name;
  }
  return formatErrorMessage(err);
}

/**
 * Check if an error is retryable based on its code.
 */
export function isRetryableError(err: unknown): boolean {
  const code = extractErrorCode(err);
  if (!code) {
    return true; // Unknown errors may be retryable
  }

  // Network errors are retryable
  if ((ERROR_CATEGORIES.NETWORK as readonly string[]).includes(code)) {
    return true;
  }

  // Rate limits are retryable
  if ((ERROR_CATEGORIES.RATE_LIMIT as readonly string[]).includes(code)) {
    return true;
  }

  // Server errors are retryable
  if ((ERROR_CATEGORIES.SERVER as readonly string[]).includes(code)) {
    return true;
  }

  // Auth and client errors are not retryable
  if ((ERROR_CATEGORIES.AUTH as readonly string[]).includes(code)) {
    return false;
  }
  if ((ERROR_CATEGORIES.CLIENT as readonly string[]).includes(code)) {
    return false;
  }

  return true;
}

/**
 * Check if an error is a network connectivity error.
 */
export function isNetworkError(err: unknown): boolean {
  const code = extractErrorCode(err);
  return code !== undefined && (ERROR_CATEGORIES.NETWORK as readonly string[]).includes(code);
}

/**
 * Check if an error is a rate limit error.
 */
export function isRateLimitError(err: unknown): boolean {
  const code = extractErrorCode(err);
  if (code && (ERROR_CATEGORIES.RATE_LIMIT as readonly string[]).includes(code)) {
    return true;
  }

  // Also check error message for rate limit indicators
  const message = formatErrorMessage(err).toLowerCase();
  return message.includes('rate limit') || message.includes('quota') || message.includes('too many requests');
}

/**
 * Check if an error is a server error (5xx).
 */
export function isServerError(err: unknown): boolean {
  const code = extractErrorCode(err);
  return code !== undefined && (ERROR_CATEGORIES.SERVER as readonly string[]).includes(code);
}

/**
 * Check if an error is an authentication error.
 */
export function isAuthError(err: unknown): boolean {
  const code = extractErrorCode(err);
  return code !== undefined && (ERROR_CATEGORIES.AUTH as readonly string[]).includes(code);
}

/**
 * Extract Retry-After header value from an error (for rate limiting).
 */
export function extractRetryAfter(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') {
    return undefined;
  }

  const errObj = err as {
    headers?: { get?: (key: string) => string | null; 'retry-after'?: string };
    response?: { headers?: { get?: (key: string) => string | null; 'retry-after'?: string } };
    retryAfter?: number;
    retryDelay?: number;
  };

  // Direct retry delay property (Gemini SDK style)
  if (typeof errObj.retryAfter === 'number') {
    return errObj.retryAfter * 1000;
  }
  if (typeof errObj.retryDelay === 'number') {
    return errObj.retryDelay;
  }

  // Check for headers.get method (Response-like)
  let retryAfter: string | null | undefined;

  if (errObj.headers?.get) {
    retryAfter = errObj.headers.get('retry-after');
  } else if (errObj.response?.headers?.get) {
    retryAfter = errObj.response.headers.get('retry-after');
  } else if (typeof errObj.headers?.['retry-after'] === 'string') {
    retryAfter = errObj.headers['retry-after'];
  } else if (typeof errObj.response?.headers?.['retry-after'] === 'string') {
    retryAfter = errObj.response.headers['retry-after'];
  }

  if (!retryAfter) {
    return undefined;
  }

  // Parse as seconds (most common)
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  // Parse as HTTP date
  const date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    const delayMs = date - Date.now();
    return delayMs > 0 ? delayMs : undefined;
  }

  return undefined;
}

/**
 * Create a custom error with a code.
 */
export function createError(message: string, code: string): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

export default {
  extractErrorCode,
  extractHttpStatus,
  formatErrorMessage,
  formatUncaughtError,
  isRetryableError,
  isNetworkError,
  isRateLimitError,
  isServerError,
  isAuthError,
  extractRetryAfter,
  createError,
  ERROR_CATEGORIES,
  registerErrorHandler,
  reportError,
};

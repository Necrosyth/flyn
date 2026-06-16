import { Injectable, Logger } from '@nestjs/common';

/**
 * Retry configuration
 */
export interface RetryConfig {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors?: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
};

/**
 * Retry result
 */
export interface RetryResult<T> {
    success: boolean;
    result?: T;
    attempts: number;
    error?: Error;
}

/**
 * Retry Policy Service
 * 
 * Provides configurable retry logic with exponential backoff.
 * Used for:
 * - HTTP actions that may fail transiently
 * - Database operations
 * - External service calls
 */
@Injectable()
export class RetryPolicyService {
    private readonly logger = new Logger(RetryPolicyService.name);

    /**
     * Execute a function with retry logic
     */
    async execute<T>(
        fn: () => Promise<T>,
        config: Partial<RetryConfig> = {},
        context?: string,
    ): Promise<RetryResult<T>> {
        const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
        let lastError: Error | undefined;
        let attempts = 0;

        while (attempts <= retryConfig.maxRetries) {
            attempts++;

            try {
                const result = await fn();
                if (attempts > 1) {
                    this.logger.log(`${context || 'Operation'} succeeded on attempt ${attempts}`);
                }
                return { success: true, result, attempts };
            } catch (error) {
                lastError = error as Error;

                // Check if error is retryable
                if (!this.isRetryable(lastError, retryConfig)) {
                    this.logger.warn(`${context || 'Operation'} failed with non-retryable error: ${lastError.message}`);
                    return { success: false, attempts, error: lastError };
                }

                if (attempts <= retryConfig.maxRetries) {
                    const delay = this.calculateDelay(attempts, retryConfig);
                    this.logger.warn(
                        `${context || 'Operation'} failed (attempt ${attempts}/${retryConfig.maxRetries + 1}), ` +
                        `retrying in ${delay}ms: ${lastError.message}`
                    );
                    await this.sleep(delay);
                }
            }
        }

        this.logger.error(`${context || 'Operation'} failed after ${attempts} attempts: ${lastError?.message}`);
        return { success: false, attempts, error: lastError };
    }

    /**
     * Check if an error is retryable
     */
    private isRetryable(error: Error, config: RetryConfig): boolean {
        // Check for specific error codes
        if (config.retryableErrors && config.retryableErrors.length > 0) {
            const errorCode = (error as Error & { code?: string }).code;
            if (errorCode && config.retryableErrors.includes(errorCode)) {
                return true;
            }
        }

        // Common retryable conditions
        const message = error.message.toLowerCase();
        const retryablePatterns = [
            'timeout',
            'econnreset',
            'econnrefused',
            'socket hang up',
            'network error',
            'rate limit',
            '429',
            '503',
            '504',
            'temporary',
            'unavailable',
        ];

        return retryablePatterns.some(pattern => message.includes(pattern));
    }

    /**
     * Calculate delay with exponential backoff and jitter
     */
    private calculateDelay(attempt: number, config: RetryConfig): number {
        const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
        const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

        // Add jitter (±25%)
        const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
        return Math.round(cappedDelay + jitter);
    }

    /**
     * Sleep for specified ms
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Create a retry wrapper for a function
     */
    createWrapper<T extends (...args: unknown[]) => Promise<unknown>>(
        fn: T,
        config: Partial<RetryConfig> = {},
        context?: string,
    ): T {
        return (async (...args: unknown[]) => {
            const result = await this.execute(() => fn(...args), config, context);
            if (!result.success) {
                throw result.error;
            }
            return result.result;
        }) as T;
    }
}

import * as core from '@actions/core';
import createDebug from 'debug';
const debug = createDebug('manage-stale-branches:rateLimitService');

export class RateLimitService {
    private thresholdPercentage: number;

    constructor(
        private octokit: any,
        thresholdPercentage: number = 95
    ) {
        this.thresholdPercentage = thresholdPercentage;
    }

    /**
     * Check if the rate limit has reached the threshold
     * @returns A promise that resolves to true if the rate limit is below the threshold, false otherwise
     */
    async checkRateLimit(): Promise<boolean> {
        try {
            const { data: rateLimitData } =
                await this.octokit.rest.rateLimit.get();
            const { rate } = rateLimitData;

            const remaining = rate.remaining;
            const limit = rate.limit;
            const usedPercentage = ((limit - remaining) / limit) * 100;

            debug(
                `Rate limit: ${remaining}/${limit} (${usedPercentage.toFixed(2)}% used)`
            );

            if (usedPercentage >= this.thresholdPercentage) {
                const resetDate = new Date(rate.reset * 1000);
                core.warning(
                    `Rate limit threshold reached: ${usedPercentage.toFixed(2)}% used. Limit resets at ${resetDate.toISOString()}`
                );
                return false;
            }

            return true;
        } catch (error) {
            core.warning(
                `Failed to check rate limit: ${(error as Error).message}`
            );
            // If we can't check the rate limit, assume it's safe to continue
            return true;
        }
    }

    /**
     * Check rate limit after each API operation
     * @param operation The name of the operation for logging purposes
     * @returns A function that wraps an API operation and checks the rate limit after it completes
     */
    withRateLimitCheck<T>(
        operation: string
    ): (fn: () => Promise<T>) => Promise<T | null> {
        return async (fn: () => Promise<T>): Promise<T | null> => {
            const result = await fn();

            // Check rate limit after the operation
            const isBelowThreshold = await this.checkRateLimit();
            if (!isBelowThreshold) {
                core.warning(
                    `Rate limit threshold reached after ${operation}. Exiting gracefully.`
                );
                return null;
            }

            return result as T;
        };
    }
}

export function parseTimeWithUnit(input: string, paramName: string): number {
    const trimmed = input.trim();
    const match = trimmed.match(/^(-?\d+)\s*([hdw])$/i);

    if (!match) {
        throw new Error(`Invalid format for ${paramName}`);
    }

    const [, value, unit] = match;
    const numValue = parseInt(value, 10);

    if (numValue <= 0) {
        throw new Error(
            `Invalid format for ${paramName}: value must be positive`
        );
    }

    // Convert to milliseconds
    const HOUR_IN_MS = 60 * 60 * 1000;
    const DAY_IN_MS = 24 * HOUR_IN_MS;
    const WEEK_IN_MS = 7 * DAY_IN_MS;

    switch (unit.toLowerCase()) {
        case 'h':
            return numValue * HOUR_IN_MS;
        case 'd':
            return numValue * DAY_IN_MS;
        case 'w':
            return numValue * WEEK_IN_MS;
        default:
            throw new Error(
                `Invalid format for ${paramName}: unknown unit '${unit}'`
            );
    }
}

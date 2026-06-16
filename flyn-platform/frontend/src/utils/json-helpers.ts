/**
 * Flattens a nested object into a single level object with dot notation keys
 * Example: { a: { b: 1 } } -> { "a.b": 1 }
 */
const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
};

export const flattenObject = (obj: unknown, prefix = ''): Record<string, string> => {
    const asRecord = (obj ?? {}) as Record<string, unknown>;
    return Object.keys(asRecord).reduce((acc: Record<string, string>, k) => {
        const pre = prefix.length ? prefix + '.' : '';
        const value = asRecord[k];
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            Object.assign(acc, flattenObject(value, pre + k));
        } else {
            acc[pre + k] = String(value);
        }
        return acc;
    }, {});
};

/**
 * Unflattens a single level object with dot notation keys into a nested object
 * Example: { "a.b": 1 } -> { a: { b: 1 } }
 */
export const unflattenObject = (obj: Record<string, string>): unknown => {
    const result: Record<string, unknown> = {};
    for (const i in obj) {
        const keys = i.split('.');
        keys.reduce<unknown>((acc, key, index) => {
            const container = (isRecord(acc) ? acc : {}) as Record<string, unknown>;

            const nextKey = keys[index + 1];
            const shouldBeArray = !isNaN(Number(nextKey));
            const shouldSetLeaf = keys.length - 1 === index;

            if (!(key in container)) {
                container[key] = shouldSetLeaf ? obj[i] : shouldBeArray ? [] : {};
            }

            return container[key];
        }, result);
    }
    return result;
};

/**
 * Extracts values from a flattened object in order
 */
export const extractValues = (obj: Record<string, string>): string[] => {
    return Object.values(obj);
};

/**
 * Reconstructs a flattened object from keys and new values
 */
export const reconstructFlattened = (keys: string[], values: string[]): Record<string, string> => {
    const result: Record<string, string> = {};
    keys.forEach((key, index) => {
        result[key] = values[index];
    });
    return result;
};

// frontend/src/utils/object.ts
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function merge<T extends object>(target: T, source: Partial<T>): T {
  return { ...target, ...source };
}

export function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result: any = {};
  keys.forEach(key => {
    result[key] = obj[key];
  });
  return result;
}

export function omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result: any = { ...obj };
  keys.forEach(key => {
    delete result[key];
  });
  return result;
}

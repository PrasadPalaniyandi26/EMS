/**
 * Row Mapper Utility
 * Adds UPPERCASE aliases for all snake_case properties.
 * Bridges Prisma camelCase → snake_case → frontend UPPERCASE.
 */
export function addUppercaseAliases<T extends Record<string, any>>(obj: T): T & Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, any> = { ...obj };
  for (const key of Object.keys(obj)) {
    const upper = key.toUpperCase();
    if (upper !== key && !(upper in result)) {
      result[upper] = obj[key];
    }
  }
  return result as T & Record<string, any>;
}

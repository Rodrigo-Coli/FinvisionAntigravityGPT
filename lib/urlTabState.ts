/**
 * Resolves a URL query-param value against a whitelist of valid values,
 * falling back to a default when the param is missing or not in the list.
 * Used by every page whose active tab/section/category is driven by a URL
 * query parameter (see components/Nav.tsx's submenu system).
 */
export function resolveTabParam<T extends string>(
  paramValue: string | null,
  validValues: readonly T[],
  defaultValue: T
): T {
  if (paramValue && (validValues as readonly string[]).includes(paramValue)) {
    return paramValue as T;
  }
  return defaultValue;
}

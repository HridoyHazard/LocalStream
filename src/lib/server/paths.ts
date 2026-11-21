/** Validates a library-relative media path from a query string. */
export function normalizeMediaPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith("/") || trimmed.includes("\0")) return null;
  const segments = trimmed.split("/");
  if (!segments.length) return null;
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
    return null;
  }
  return trimmed;
}

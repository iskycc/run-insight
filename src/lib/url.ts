/**
 * Validate that a string is a safe external URL for use as an `href`.
 * Only `http:` and `https:` protocols are allowed to prevent XSS via
 * `javascript:` or other custom schemes.
 */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

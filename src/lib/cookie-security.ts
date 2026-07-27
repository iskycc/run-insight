export function shouldUseSecureCookies(
  configured = process.env.COOKIE_SECURE,
  environment = process.env.NODE_ENV,
): boolean {
  const normalized = configured?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;

  // Preserve the secure production default when the override is missing or
  // malformed. Plain HTTP must always be an explicit deployment choice.
  return environment === "production";
}

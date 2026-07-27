import { shouldUseSecureCookies } from "@/lib/cookie-security";

describe("shouldUseSecureCookies", () => {
  it.each([
    ["true", "development", true],
    [" TRUE ", "development", true],
    ["false", "production", false],
    [" False ", "production", false],
    [undefined, "production", true],
    [undefined, "development", false],
    ["invalid", "production", true],
    ["invalid", "test", false],
  ])(
    "resolves COOKIE_SECURE=%p in NODE_ENV=%p to %p",
    (configured, environment, expected) => {
      expect(shouldUseSecureCookies(configured, environment)).toBe(expected);
    },
  );
});

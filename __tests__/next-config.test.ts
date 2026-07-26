import {
  buildContentSecurityPolicy,
  buildSecurityHeaders,
} from "../next.config";

describe("security headers", () => {
  it("sets the required browser security policy globally", () => {
    const headers = Object.fromEntries(
      buildSecurityHeaders("production").map(({ key, value }) => [key, value]),
    );

    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "font-src 'self' data:",
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "style-src 'self' 'unsafe-inline'",
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toContain("camera=()");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("never enables unsafe-eval in production but keeps Next dev tooling usable", () => {
    expect(buildContentSecurityPolicy("production")).not.toContain(
      "'unsafe-eval'",
    );
    expect(buildContentSecurityPolicy("development")).toContain(
      "'unsafe-eval'",
    );
    expect(buildContentSecurityPolicy("development")).toContain("ws: wss:");
  });

  it("does not override response MIME or download disposition headers", () => {
    const headerNames = buildSecurityHeaders("production").map(
      ({ key }) => key.toLowerCase(),
    );

    expect(headerNames).not.toContain("content-type");
    expect(headerNames).not.toContain("content-disposition");
  });
});

import { proxy } from "@/proxy";
import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/auth", () => ({
  verifyToken: jest.fn(),
  getTokenFromCookies: jest.fn(),
}));

import { verifyToken, getTokenFromCookies } from "@/lib/auth";

const mockVerifyToken = verifyToken as jest.Mock;
const mockGetTokenFromCookies = getTokenFromCookies as jest.Mock;

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("proxy middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("public paths → next()", () => {
    it("should allow / (root)", () => {
      const req = createRequest("/");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it("should allow /login", () => {
      const req = createRequest("/login");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it("should allow /api/auth/login", () => {
      const req = createRequest("/api/auth/login");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it("should allow /api/stats", () => {
      const req = createRequest("/api/stats");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it("should allow /api/auth/logout", () => {
      const req = createRequest("/api/auth/logout");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it("should allow /api/auth/me", () => {
      const req = createRequest("/api/auth/me");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });
  });

  describe("/api/ routes → next()", () => {
    it("should allow /api/cases", () => {
      const req = createRequest("/api/cases");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it("should allow /api/import", () => {
      const req = createRequest("/api/import");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });
  });

  describe("static assets → next()", () => {
    it("should allow /_next/ paths", () => {
      const req = createRequest("/_next/static/chunk.js");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it("should allow /favicon.ico", () => {
      const req = createRequest("/favicon.ico");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });

    it("should allow files with extensions (e.g. /file.png)", () => {
      const req = createRequest("/images/logo.png");
      const res = proxy(req);
      expect(res).toBeInstanceOf(NextResponse);
    });
  });

  describe("protected paths — redirect logic", () => {
    it("should redirect to /login when no cookie is present", () => {
      mockGetTokenFromCookies.mockReturnValue(null);
      const req = createRequest("/workspace");
      const res = proxy(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("should redirect to /login when token is invalid", () => {
      mockGetTokenFromCookies.mockReturnValue("bad-token");
      mockVerifyToken.mockImplementation(() => {
        throw new Error("Invalid token");
      });
      const req = createRequest("/workspace");
      const res = proxy(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("should allow next() when token is valid", () => {
      mockGetTokenFromCookies.mockReturnValue("valid-token");
      mockVerifyToken.mockReturnValue({ userId: "user_1", username: "admin" });
      const req = createRequest("/workspace");
      const res = proxy(req);
      // next() response should not have a location redirect header
      expect(res.headers.get("location")).toBeNull();
    });
  });
});

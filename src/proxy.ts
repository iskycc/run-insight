import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, getTokenFromCookies } from "@/lib/auth";
import { resolveRequestId } from "@/lib/logger";

const PUBLIC_PAGES = new Set(["/", "/login"]);
const STATIC_FILE_PATTERN = /\/[^/]+\.[A-Za-z0-9]{1,10}$/;

function continueRequest(request: NextRequest, requestId: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

function redirectToLogin(request: NextRequest, requestId: string) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.headers.set("x-request-id", requestId);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = resolveRequestId(request.headers.get("x-request-id"));

  // 允许公开路径
  if (PUBLIC_PAGES.has(pathname)) {
    return continueRequest(request, requestId);
  }

  // 允许所有 API 路由通过（API 自行处理认证，返回 401 而非重定向）
  if (pathname.startsWith("/api/")) {
    return continueRequest(request, requestId);
  }

  // 允许静态资源
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    STATIC_FILE_PATTERN.test(pathname)
  ) {
    return continueRequest(request, requestId);
  }

  const cookieHeader = request.headers.get("cookie");
  const token = getTokenFromCookies(cookieHeader);

  if (!token) {
    return redirectToLogin(request, requestId);
  }

  try {
    verifyToken(token);
    return continueRequest(request, requestId);
  } catch {
    // Token 无效，重定向到登录页
    return redirectToLogin(request, requestId);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

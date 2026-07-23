import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, getTokenFromCookies } from "@/lib/auth";

const PUBLIC_PATHS = ["/", "/login", "/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/stats"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 允许公开路径
  if (PUBLIC_PATHS.some((path) => path === "/" ? pathname === "/" : pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // 允许所有 API 路由通过（API 自行处理认证，返回 401 而非重定向）
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 允许静态资源
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const cookieHeader = request.headers.get("cookie");
  const token = getTokenFromCookies(cookieHeader);

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    verifyToken(token);
    return NextResponse.next();
  } catch {
    // Token 无效，重定向到登录页
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

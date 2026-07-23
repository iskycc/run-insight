import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import type { ApiError } from "@/types";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET 环境变量未设置，使用不安全的默认值。生产环境请务必设置！");
}
const SECRET = JWT_SECRET || "run-insight-jwt-secret-change-in-production-2026";
const JWT_EXPIRES_IN = "7d";
const COOKIE_NAME = "run_insight_token";

export interface TokenPayload {
  userId: string;
  username: string;
}

/**
 * Authenticate an API request by verifying the JWT token from cookies.
 * Returns the token payload on success, or a NextResponse with 401 on failure.
 */
export function authenticateRequest(request: NextRequest): TokenPayload | NextResponse<ApiError> {
  const cookieHeader = request.headers.get("cookie");
  const token = getTokenFromCookies(cookieHeader);

  if (!token) {
    return NextResponse.json<ApiError>(
      { error: "UNAUTHORIZED", message: "未登录" },
      { status: 401 }
    );
  }

  try {
    return verifyToken(token);
  } catch {
    return NextResponse.json<ApiError>(
      { error: "UNAUTHORIZED", message: "登录已过期" },
      { status: 401 }
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

export function getTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const tokenCookie = cookies.find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!tokenCookie) return null;
  return tokenCookie.split("=").slice(1).join("=");
}

export function createTokenCookie(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${secure}`;
}

export function createLogoutCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

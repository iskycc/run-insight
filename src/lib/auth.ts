import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { parseApiKeyScopes } from "@/lib/api-keys";
import { prisma } from "@/lib/prisma";
import type { ApiError, ApiKeyScope, Role } from "@/types";

const DEVELOPMENT_SECRET = "run-insight-jwt-secret-change-in-production-2026";
let hasWarnedAboutDevelopmentSecret = false;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }

  if (!hasWarnedAboutDevelopmentSecret) {
    console.warn("⚠️ JWT_SECRET 环境变量未设置，使用不安全的默认值。生产环境请务必设置！");
    hasWarnedAboutDevelopmentSecret = true;
  }

  return DEVELOPMENT_SECRET;
}

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const COOKIE_NAME = "run_insight_token";

export interface TokenPayload {
  userId: string;
  username: string;
  sessionId?: string;
}

/**
 * Authenticate an API request by verifying the JWT token from cookies.
 * Returns the token payload on success, or a NextResponse with 401 on failure.
 */
export async function authenticateRequest(
  request: NextRequest,
): Promise<TokenPayload | NextResponse<ApiError>> {
  const cookieHeader = request.headers.get("cookie");
  const token = getTokenFromCookies(cookieHeader);

  if (!token) {
    return NextResponse.json<ApiError>(
      { error: "UNAUTHORIZED", message: "未登录" },
      { status: 401 }
    );
  }

  try {
    const payload = verifyToken(token);

    // Tokens issued before server-side sessions were deployed have no
    // sessionId. Keep accepting them until their original JWT expiry so the
    // rollout does not force every user to sign in simultaneously.
    if (!payload.sessionId) return payload;

    const now = new Date();
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        revokedAt: true,
        lastSeenAt: true,
      },
    });
    if (
      !session
      || session.userId !== payload.userId
      || session.revokedAt
      || session.expiresAt <= now
    ) {
      return NextResponse.json<ApiError>(
        { error: "UNAUTHORIZED", message: "登录会话已失效" },
        { status: 401 },
      );
    }

    if (
      now.getTime() - session.lastSeenAt.getTime()
      >= SESSION_ACTIVITY_WRITE_INTERVAL_MS
    ) {
      await prisma.session.updateMany({
        where: {
          id: session.id,
          userId: payload.userId,
          revokedAt: null,
          expiresAt: { gt: now },
          lastSeenAt: {
            lte: new Date(now.getTime() - SESSION_ACTIVITY_WRITE_INTERVAL_MS),
          },
        },
        data: { lastSeenAt: now },
      });
    }

    return payload;
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
  return jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_TTL_SECONDS });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
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
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function createLogoutCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export function getSessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
}

export function describeSessionDevice(userAgent: string | null): string {
  if (!userAgent) return "未知设备";

  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : /curl\//i.test(userAgent)
            ? "命令行客户端"
            : "其他客户端";
  const system = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? "iOS"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "未知系统";

  return `${browser} · ${system}`;
}

export async function requireRole(
  userId: string,
  requiredRoles: Role[],
  prismaClient: { user: { findUnique: (args: { where: { id: string } }) => Promise<{ role: string } | null> } }
): Promise<NextResponse<ApiError> | null> {
  const user = await prismaClient.user.findUnique({ where: { id: userId } });
  if (!user || !requiredRoles.includes(user.role as Role)) {
    return NextResponse.json<ApiError>(
      { error: "FORBIDDEN", message: "权限不足" },
      { status: 403 }
    );
  }
  return null;
}

export async function authenticateApiKey(
  request: NextRequest,
  prismaClient: {
    apiKey: {
      findUnique: (args: {
        where: { keyHash: string };
        include: { project: { select: { archived: true } } };
      }) => Promise<{
        id: string;
        projectId: string;
        userId: string | null;
        scopes: unknown;
        expiresAt: Date | null;
        revokedAt: Date | null;
        project: { archived: boolean };
      } | null>;
      updateMany: (args: {
        where: {
          id: string;
          revokedAt: null;
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: Date } },
          ];
        };
        data: { lastUsedAt: Date };
      }) => Promise<{ count: number }>;
    };
  },
  requiredScope: ApiKeyScope,
): Promise<{ projectId: string; userId: string } | null> {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) return null;

  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
  const record = await prismaClient.apiKey.findUnique({
    where: { keyHash },
    include: { project: { select: { archived: true } } },
  });
  const now = new Date();
  const scopes = parseApiKeyScopes(record?.scopes);
  if (
    !record
    || !record.userId
    || record.project.archived
    || record.revokedAt
    || (record.expiresAt && record.expiresAt <= now)
    || !scopes?.includes(requiredScope)
  ) {
    return null;
  }

  // Re-check revocation and expiry while recording usage. If an administrator
  // revoked the key after the read above, no row is updated and authentication
  // fails instead of allowing one final request through.
  const usageUpdate = await prismaClient.apiKey.updateMany({
    where: {
      id: record.id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: { lastUsedAt: now },
  });
  if (usageUpdate.count !== 1) return null;

  return { projectId: record.projectId, userId: record.userId };
}

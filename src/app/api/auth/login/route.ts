import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createTokenCookie,
  describeSessionDevice,
  generateToken,
  getSessionExpiresAt,
  verifyPassword,
} from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import {
  LdapConfigurationError,
  LdapUnavailableError,
  authenticateLdapUser,
} from "@/lib/ldap";
import { checkLoginRateLimit } from "@/lib/rate-limiter";
import { writeAuditLog } from "@/lib/audit";
import type { LoginRequest, LoginResponse, UserDTO } from "@/types";

const LOGIN_USER_SELECT = {
  id: true,
  username: true,
  password: true,
  role: true,
  authSource: true,
  ldapExternalId: true,
  ldapDn: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type LoginUser = Prisma.UserGetPayload<{ select: typeof LOGIN_USER_SELECT }>;

type AuthenticationResult = {
  user: LoginUser;
  method: "password" | "ldap";
  provisioned: boolean;
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error
    && "code" in error
    && (error as { code: unknown }).code === "P2002"
  );
}

async function authenticate(
  username: string,
  password: string,
): Promise<AuthenticationResult | null> {
  const existing = await prisma.user.findUnique({
    where: { username },
    select: LOGIN_USER_SELECT,
  });

  if (existing?.authSource === "LOCAL") {
    if (!existing.password || !(await verifyPassword(password, existing.password))) {
      return null;
    }
    return { user: existing, method: "password", provisioned: false };
  }

  const identity = await authenticateLdapUser(username, password);
  if (!identity) return null;

  if (existing) {
    if (
      existing.authSource !== "LDAP"
      || existing.ldapExternalId !== identity.externalId
    ) {
      return null;
    }
    const user =
      existing.ldapDn === identity.dn
        ? existing
        : await prisma.user.update({
            where: { id: existing.id },
            data: { ldapDn: identity.dn },
            select: LOGIN_USER_SELECT,
          });
    return { user, method: "ldap", provisioned: false };
  }

  try {
    const previousIdentity = await prisma.user.findUnique({
      where: { ldapExternalId: identity.externalId },
      select: { id: true },
    });
    const user = await prisma.user.upsert({
      where: { ldapExternalId: identity.externalId },
      update: {
        username,
        ldapDn: identity.dn,
      },
      create: {
        username,
        password: null,
        role: "EDITOR",
        authSource: "LDAP",
        ldapExternalId: identity.externalId,
        ldapDn: identity.dn,
      },
      select: LOGIN_USER_SELECT,
    });
    if (user.authSource !== "LDAP") return null;
    return {
      user,
      method: "ldap",
      provisioned: previousIdentity === null,
    };
  } catch (error) {
    // A local account created concurrently with the LDAP login always wins.
    // Do not link identities by username after a uniqueness race.
    if (isUniqueConstraintError(error)) return null;
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: LoginRequest = await request.json();
    const { username: suppliedUsername, password } = body;

    if (!suppliedUsername || !password) {
      return jsonError("VALIDATION_ERROR", "用户名和密码不能为空");
    }

    const rateLimit = await checkLoginRateLimit(request, suppliedUsername);
    if (rateLimit) return rateLimit;

    const username = suppliedUsername.normalize("NFKC").trim();
    if (!username) {
      return jsonError("AUTH_FAILED", "用户名或密码错误", 401);
    }

    const authentication = await authenticate(username, password);
    if (!authentication) {
      return jsonError("AUTH_FAILED", "用户名或密码错误", 401);
    }
    const { user, method, provisioned } = authentication;

    const deviceInfo = describeSessionDevice(request.headers.get("user-agent"));
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        deviceInfo,
        expiresAt: getSessionExpiresAt(),
      },
      select: { id: true },
    });
    const token = generateToken({
      userId: user.id,
      username: user.username,
      sessionId: session.id,
    });
    const userDTO: UserDTO = {
      id: user.id,
      username: user.username,
      role: user.role,
      authSource: user.authSource,
      createdAt: user.createdAt.toISOString(),
    };

    const response = NextResponse.json<LoginResponse>({ user: userDTO });
    response.headers.set("set-cookie", createTokenCookie(token));
    await writeAuditLog({
      userId: user.id,
      action: "LOGIN",
      entityType: "session",
      entityId: session.id,
      changes: {
        authentication: method,
        provisioned,
        deviceInfo,
      },
    });
    return response;
  } catch (error) {
    if (error instanceof LdapConfigurationError) {
      return internalError("LDAP 配置无效，请联系管理员", {
        request,
        error,
        event: "auth.ldap_configuration_invalid",
      });
    }
    if (error instanceof LdapUnavailableError) {
      return jsonError("LDAP_UNAVAILABLE", "LDAP 服务暂不可用，请稍后重试", 503);
    }
    return internalError("登录失败", {
      request,
      error,
      event: "auth.login_failed",
    });
  }
}

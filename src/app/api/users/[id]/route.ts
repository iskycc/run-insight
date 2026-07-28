import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateRequest,
  createTokenCookie,
  generateToken,
  requireRole,
} from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import { isValidRole, normalizeUsername } from "@/lib/validations";
import type { Role, UserWithRole } from "@/types";

type UpdateResult =
  | { status: "not-found" }
  | { status: "last-admin" }
  | { status: "ldap-username" }
  | { status: "username-exists" }
  | {
      status: "updated";
      previous: { username: string; role: Role };
      user: {
        id: string;
        username: string;
        role: Role;
        authSource: "LOCAL" | "LDAP";
        createdAt: Date;
        updatedAt: Date;
      };
    };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error
    && "code" in error
    && (error as { code: unknown }).code === "P2002"
  );
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await authenticateRequest(request);
  if (authResult instanceof NextResponse) return authResult;

  const roleCheck = await requireRole(authResult.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const { id } = await params;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("VALIDATION_ERROR", "请求体必须是 JSON 对象");
    }

    const values = body as Record<string, unknown>;
    const hasRole = Object.hasOwn(values, "role");
    const hasUsername = Object.hasOwn(values, "username");
    if (!hasRole && !hasUsername) {
      return jsonError("VALIDATION_ERROR", "用户名或角色至少需要提供一项");
    }

    const role = hasRole ? values.role : undefined;
    if (hasRole && !isValidRole(role)) {
      return jsonError("VALIDATION_ERROR", "角色不合法");
    }

    const username = hasUsername ? normalizeUsername(values.username) : null;
    if (hasUsername && !username) {
      return jsonError(
        "VALIDATION_ERROR",
        "用户名必须为 3 到 50 个字符，且不能包含空格或控制字符",
      );
    }

    if (hasRole && id === authResult.userId) {
      return jsonError("FORBIDDEN", "不能修改自己的角色", 403);
    }

    const result = await prisma.$transaction(async (tx): Promise<UpdateResult> => {
      const existing = await tx.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          role: true,
          authSource: true,
        },
      });
      if (!existing) return { status: "not-found" };

      if (username && existing.authSource === "LDAP") {
        return { status: "ldap-username" };
      }

      if (username && username !== existing.username) {
        const duplicate = await tx.user.findUnique({
          where: { username },
          select: { id: true },
        });
        if (duplicate && duplicate.id !== id) {
          return { status: "username-exists" };
        }
      }

      if (existing.role === "ADMIN" && role && role !== "ADMIN") {
        const adminCount = await tx.user.count({ where: { role: "ADMIN" } });
        if (adminCount <= 1) return { status: "last-admin" };
      }

      const user = await tx.user.update({
        where: { id },
        data: {
          ...(username ? { username } : {}),
          ...(role ? { role } : {}),
        },
        select: {
          id: true,
          username: true,
          role: true,
          authSource: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const keepCurrentSession =
        id === authResult.userId && authResult.sessionId
          ? { id: { not: authResult.sessionId } }
          : {};
      await tx.session.updateMany({
        where: {
          userId: id,
          revokedAt: null,
          ...keepCurrentSession,
        },
        data: { revokedAt: new Date() },
      });
      return {
        status: "updated",
        previous: {
          username: existing.username,
          role: existing.role as Role,
        },
        user: {
          ...user,
          role: user.role as Role,
        },
      };
    }, { isolationLevel: "Serializable" });

    if (result.status === "not-found") {
      return jsonError("NOT_FOUND", "用户不存在", 404);
    }
    if (result.status === "last-admin") {
      return jsonError("FORBIDDEN", "系统至少需要保留一个管理员", 403);
    }
    if (result.status === "ldap-username") {
      return jsonError(
        "FORBIDDEN",
        "LDAP 用户名由目录服务管理，不能在本系统中修改",
        403,
      );
    }
    if (result.status === "username-exists") {
      return jsonError("CONFLICT", "用户名已存在", 409);
    }

    const { user: updated, previous } = result;
    await writeAuditLog({
      userId: authResult.userId,
      action: "UPDATE",
      entityType: "user",
      entityId: id,
      changes: {
        ...(previous.username !== updated.username
          ? {
              username: {
                from: previous.username,
                to: updated.username,
              },
            }
          : {}),
        ...(previous.role !== updated.role
          ? {
              role: {
                from: previous.role,
                to: updated.role,
              },
            }
          : {}),
      },
    });

    const response = NextResponse.json<UserWithRole>({
      id: updated.id,
      username: updated.username,
      role: updated.role,
      authSource: updated.authSource,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
    if (id === authResult.userId && previous.username !== updated.username) {
      const token = generateToken({
        userId: updated.id,
        username: updated.username,
        sessionId: authResult.sessionId,
      });
      response.headers.set("set-cookie", createTokenCookie(token));
    }
    return response;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return jsonError("CONFLICT", "用户名已存在", 409);
    }
    return internalError("更新用户失败", {
      request,
      error,
      event: "user.update_failed",
    });
  }
}

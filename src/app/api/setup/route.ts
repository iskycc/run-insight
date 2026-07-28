import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
} from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { checkSetupRateLimit } from "@/lib/rate-limiter";
import { secretsEqual } from "@/lib/secrets";
import { normalizeUsername } from "@/lib/validations";
import type {
  InitializeInstanceResponse,
  InstanceSetupStatusResponse,
} from "@/types";

const SETUP_MARKER_ID = 1;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MIN_SETUP_TOKEN_LENGTH = 32;

class InstanceAlreadyInitializedError extends Error {}

function noStore<T>(response: NextResponse<T>): NextResponse<T> {
  response.headers.set("cache-control", "no-store, max-age=0");
  return response;
}

async function isInstanceInitialized(): Promise<boolean> {
  const marker = await prisma.instanceSetup.findUnique({
    where: { id: SETUP_MARKER_ID },
    select: { id: true },
  });
  if (marker) return true;

  const user = await prisma.user.findFirst({ select: { id: true } });
  return Boolean(user);
}

function configuredSetupToken(): string | null {
  const token = process.env.INSTANCE_SETUP_TOKEN;
  return token && token.length >= MIN_SETUP_TOKEN_LENGTH ? token : null;
}

function validatePassword(
  value: unknown,
  username: string,
): value is string {
  return (
    typeof value === "string"
    && value.length >= MIN_PASSWORD_LENGTH
    && value.length <= MAX_PASSWORD_LENGTH
    && value !== username
  );
}

function isConflictError(error: unknown): boolean {
  return (
    error instanceof InstanceAlreadyInitializedError
    || (
      error instanceof Error
      && "code" in error
      && (error as { code: unknown }).code === "P2002"
    )
  );
}

export async function GET() {
  try {
    const initialized = await isInstanceInitialized();
    return noStore(
      NextResponse.json<InstanceSetupStatusResponse>({
        initialized,
        setupAvailable: initialized || configuredSetupToken() !== null,
      }),
    );
  } catch (error) {
    return noStore(
      internalError("检查实例初始化状态失败", {
        error,
        event: "instance_setup.status_failed",
      }),
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (await isInstanceInitialized()) {
      return noStore(
        jsonError("ALREADY_INITIALIZED", "实例已经完成初始化", 409),
      );
    }

    const parsed = await parseJsonObject(request, [
      "setupToken",
      "adminUsername",
      "adminPassword",
      "viewerUsername",
      "viewerPassword",
    ]);
    if (!parsed.ok) return noStore(parsed.response);

    const rateLimit = await checkSetupRateLimit(request);
    if (rateLimit) return noStore(rateLimit);

    const expectedSetupToken = configuredSetupToken();
    if (!expectedSetupToken) {
      return noStore(
        jsonError(
          "SETUP_UNAVAILABLE",
          "服务器尚未配置有效的 INSTANCE_SETUP_TOKEN",
          503,
        ),
      );
    }
    const suppliedSetupToken = parsed.value.setupToken;
    if (
      typeof suppliedSetupToken !== "string"
      || !secretsEqual(expectedSetupToken, suppliedSetupToken)
    ) {
      return noStore(
        jsonError("AUTH_FAILED", "实例初始化密钥错误", 401),
      );
    }

    const adminUsername = normalizeUsername(parsed.value.adminUsername);
    const viewerUsername = normalizeUsername(parsed.value.viewerUsername);
    if (!adminUsername || !viewerUsername) {
      return noStore(
        jsonError(
          "VALIDATION_ERROR",
          "用户名必须为 3 到 50 个字符，且不能包含空格或控制字符",
        ),
      );
    }
    if (adminUsername.toLowerCase() === viewerUsername.toLowerCase()) {
      return noStore(
        jsonError("VALIDATION_ERROR", "管理员和只读用户必须使用不同用户名"),
      );
    }

    const adminPassword = parsed.value.adminPassword;
    const viewerPassword = parsed.value.viewerPassword;
    if (!validatePassword(adminPassword, adminUsername)) {
      return noStore(
        jsonError(
          "VALIDATION_ERROR",
          "管理员密码必须为 12 到 128 个字符，且不能与用户名相同",
        ),
      );
    }
    if (!validatePassword(viewerPassword, viewerUsername)) {
      return noStore(
        jsonError(
          "VALIDATION_ERROR",
          "只读用户密码必须为 12 到 128 个字符，且不能与用户名相同",
        ),
      );
    }
    if (adminPassword === viewerPassword) {
      return noStore(
        jsonError("VALIDATION_ERROR", "管理员和只读用户不能使用相同密码"),
      );
    }

    // Hash before opening the transaction so the database lock is held only
    // for the short, atomic bootstrap write.
    const adminPasswordHash = await hashPassword(adminPassword);
    const viewerPasswordHash = await hashPassword(viewerPassword);

    await prisma.$transaction(async (tx) => {
      const existingMarker = await tx.instanceSetup.findUnique({
        where: { id: SETUP_MARKER_ID },
        select: { id: true },
      });
      const existingUser = await tx.user.findFirst({ select: { id: true } });
      if (existingMarker || existingUser) {
        throw new InstanceAlreadyInitializedError();
      }

      // This unique singleton row is the concurrency gate. A simultaneous
      // request can reach this insert, but only one transaction can commit it.
      await tx.instanceSetup.create({ data: { id: SETUP_MARKER_ID } });

      const admin = await tx.user.create({
        data: {
          username: adminUsername,
          password: adminPasswordHash,
          role: "ADMIN",
        },
        select: { id: true },
      });
      const viewer = await tx.user.create({
        data: {
          username: viewerUsername,
          password: viewerPasswordHash,
          role: "VIEWER",
        },
        select: { id: true },
      });

      let organization = await tx.organization.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, archived: true },
      });
      if (!organization) {
        organization = await tx.organization.create({
          data: { name: "默认组织" },
          select: { id: true, archived: true },
        });
      } else if (organization.archived) {
        organization = await tx.organization.update({
          where: { id: organization.id },
          data: { archived: false },
          select: { id: true, archived: true },
        });
      }

      await tx.organizationMember.createMany({
        data: [
          {
            organizationId: organization.id,
            userId: admin.id,
            role: "OWNER",
          },
          {
            organizationId: organization.id,
            userId: viewer.id,
            role: "MEMBER",
          },
        ],
      });
      await tx.auditLog.create({
        data: {
          userId: admin.id,
          action: "CREATE",
          entityType: "user",
          entityId: admin.id,
          changes: {
            instanceInitialized: true,
            adminUsername,
            viewerUsername,
          },
        },
      });
    });

    return noStore(
      NextResponse.json<InitializeInstanceResponse>(
        {
          initialized: true,
          adminUsername,
          viewerUsername,
        },
        { status: 201 },
      ),
    );
  } catch (error) {
    if (isConflictError(error)) {
      return noStore(
        jsonError(
          "ALREADY_INITIALIZED",
          "实例已由其他请求完成初始化，请直接登录",
          409,
        ),
      );
    }
    return noStore(
      internalError("初始化实例失败", {
        request,
        error,
        event: "instance_setup.initialize_failed",
      }),
    );
  }
}

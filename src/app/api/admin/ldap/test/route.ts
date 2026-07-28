import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  LdapConfigurationError,
  LdapUnavailableError,
  parseLdapConfigurationInput,
  testLdapConfiguration,
} from "@/lib/ldap";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = await requireRole(auth.userId, ["ADMIN"], prisma);
  if (roleCheck) return roleCheck;

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("VALIDATION_ERROR", "测试参数必须是 JSON 对象");
    }
    const values = body as Record<string, unknown>;
    const configuration = parseLdapConfigurationInput(
      values.configuration,
    );
    const succeeded = await testLdapConfiguration(
      configuration,
      values.testUsername,
      values.testPassword,
    );
    await writeAuditLog({
      userId: auth.userId,
      action: "UPDATE",
      entityType: "ldapConfiguration",
      entityId: "singleton",
      changes: { connectionTest: succeeded ? "succeeded" : "failed" },
    });
    if (!succeeded) {
      return jsonError(
        "LDAP_TEST_FAILED",
        "未找到唯一用户或测试用户名、密码不正确",
        400,
      );
    }
    return NextResponse.json({
      success: true,
      message: "LDAP 连接、用户搜索和用户认证均成功",
    });
  } catch (error) {
    if (error instanceof LdapConfigurationError) {
      return jsonError("VALIDATION_ERROR", error.message);
    }
    if (error instanceof LdapUnavailableError) {
      return jsonError(
        "LDAP_UNAVAILABLE",
        "无法连接 LDAP，或绑定账号认证失败",
        502,
      );
    }
    return internalError("LDAP 连接测试失败", {
      request,
      error,
      event: "ldap.connection_test_failed",
    });
  }
}

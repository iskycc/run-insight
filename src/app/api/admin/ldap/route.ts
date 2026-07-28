import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth";
import { internalError, jsonError } from "@/lib/api-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  LdapConfigurationError,
  getLdapConfiguration,
  parseLdapConfigurationInput,
  saveLdapConfiguration,
} from "@/lib/ldap";
import { prisma } from "@/lib/prisma";
import type { LdapConfigurationDTO } from "@/types";

async function requireAdministrator(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = await requireRole(auth.userId, ["ADMIN"], prisma);
  return roleCheck ?? auth;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdministrator(request);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json<LdapConfigurationDTO>(
      await getLdapConfiguration(),
    );
  } catch (error) {
    return internalError("获取 LDAP 配置失败", {
      request,
      error,
      event: "ldap.configuration_read_failed",
    });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdministrator(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const input = parseLdapConfigurationInput(await request.json());
    const saved = await saveLdapConfiguration(input);
    await writeAuditLog({
      userId: auth.userId,
      action: "UPDATE",
      entityType: "ldapConfiguration",
      entityId: "singleton",
      changes: {
        enabled: saved.enabled,
        url: saved.url,
        bindDn: saved.bindDn,
        searchBase: saved.searchBase,
        userFilter: saved.userFilter,
        uniqueIdAttribute: saved.uniqueIdAttribute,
        startTls: saved.startTls,
        tlsRejectUnauthorized: saved.tlsRejectUnauthorized,
        tlsCaConfigured: Boolean(saved.tlsCaCertificate),
        connectTimeoutMs: saved.connectTimeoutMs,
        operationTimeoutMs: saved.operationTimeoutMs,
        allowInsecure: saved.allowInsecure,
        bindCredentialUpdated: Boolean(input.bindPassword),
      },
    });
    return NextResponse.json<LdapConfigurationDTO>(saved);
  } catch (error) {
    if (error instanceof LdapConfigurationError) {
      return jsonError("VALIDATION_ERROR", error.message);
    }
    return internalError("保存 LDAP 配置失败", {
      request,
      error,
      event: "ldap.configuration_write_failed",
    });
  }
}

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

export async function writeAuditLog(params: {
  userId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  entityType: string;
  entityId: string;
  changes?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: params as unknown as Prisma.AuditLogCreateInput,
    });
  } catch {
    // Log write failure should not affect main operation
  }
}
import { prisma } from "@/lib/prisma";

export async function writeAuditLog(params: {
  userId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  entityType: string;
  entityId: string;
  changes?: unknown;
}) {
  try {
    await prisma.auditLog.create({ data: params });
  } catch {
    // Log write failure should not affect main operation
  }
}
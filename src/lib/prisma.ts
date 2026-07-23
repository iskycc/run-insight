import { PrismaClient } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  return rawUrl.trim().replace(/^(['"])(.*)\1$/, "$2");
}

function createPrismaClient() {
  const url = new URL(getDatabaseUrl());
  const adapter = new PrismaMariaDb({
    host: url.hostname || "127.0.0.1",
    port: Number(url.port) || 3306,
    user: url.username || "root",
    password: url.password,
    database: url.pathname.slice(1),
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

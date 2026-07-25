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

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

// Next.js evaluates route modules while collecting build metadata. Defer
// runtime-only environment validation and connection setup until a query runs.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

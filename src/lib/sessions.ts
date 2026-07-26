import type { SessionDTO, SessionStatus } from "@/types";

export function getSessionStatus(
  session: { revokedAt: Date | null; expiresAt: Date },
  now = new Date(),
): SessionStatus {
  if (session.revokedAt) return "REVOKED";
  if (session.expiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}

export function serializeSession(
  session: {
    id: string;
    deviceInfo: string;
    expiresAt: Date;
    revokedAt: Date | null;
    lastSeenAt: Date;
    createdAt: Date;
  },
  currentSessionId: string | undefined,
  now = new Date(),
): SessionDTO {
  return {
    id: session.id,
    deviceInfo: session.deviceInfo,
    status: getSessionStatus(session, now),
    isCurrent: session.id === currentSessionId,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    revokedAt: session.revokedAt?.toISOString() ?? null,
    lastSeenAt: session.lastSeenAt.toISOString(),
  };
}

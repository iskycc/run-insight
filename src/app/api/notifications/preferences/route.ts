import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import {
  internalError,
  jsonError,
  parseJsonObject,
} from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import type { NotificationPreferencesDTO } from "@/types";

const FIELDS = [
  "assignmentEnabled",
  "mentionEnabled",
  "watchedEnabled",
  "dueSoonEnabled",
  "overdueEnabled",
  "dueSoonHours",
] as const;
const BOOLEAN_FIELDS = [
  "assignmentEnabled",
  "mentionEnabled",
  "watchedEnabled",
  "dueSoonEnabled",
  "overdueEnabled",
] as const;
const PREFERENCE_SELECT = {
  assignmentEnabled: true,
  mentionEnabled: true,
  watchedEnabled: true,
  dueSoonEnabled: true,
  overdueEnabled: true,
  dueSoonHours: true,
} as const;

const DEFAULT_PREFERENCES: NotificationPreferencesDTO = {
  assignmentEnabled: true,
  mentionEnabled: true,
  watchedEnabled: true,
  dueSoonEnabled: true,
  overdueEnabled: true,
  dueSoonHours: 48,
};

function toDTO(
  preference: NotificationPreferencesDTO | null,
): NotificationPreferencesDTO {
  return preference ?? DEFAULT_PREFERENCES;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const preference = await prisma.notificationPreference.findUnique({
      where: { userId: auth.userId },
      select: PREFERENCE_SELECT,
    });
    return NextResponse.json({ preferences: toDTO(preference) });
  } catch {
    return internalError("获取通知偏好失败");
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsedBody = await parseJsonObject(request, FIELDS);
    if (!parsedBody.ok) return parsedBody.response;
    const body = parsedBody.value;
    if (Object.keys(body).length === 0) {
      return jsonError("VALIDATION_ERROR", "请至少提供一项通知偏好");
    }

    let data: Partial<NotificationPreferencesDTO> = {};
    for (const field of BOOLEAN_FIELDS) {
      const value = body[field];
      if (value === undefined) continue;
      if (typeof value !== "boolean") {
        return jsonError("VALIDATION_ERROR", `${field} 必须为布尔值`);
      }
      data = { ...data, [field]: value };
    }
    if (body.dueSoonHours !== undefined) {
      if (
        !Number.isInteger(body.dueSoonHours) ||
        (body.dueSoonHours as number) < 1 ||
        (body.dueSoonHours as number) > 168
      ) {
        return jsonError("VALIDATION_ERROR", "dueSoonHours 必须是 1 到 168 的整数");
      }
      data.dueSoonHours = body.dueSoonHours as number;
    }

    const preference = await prisma.notificationPreference.upsert({
      where: { userId: auth.userId },
      create: { userId: auth.userId, ...data },
      update: data,
      select: PREFERENCE_SELECT,
    });
    return NextResponse.json({ preferences: toDTO(preference) });
  } catch {
    return internalError("更新通知偏好失败");
  }
}

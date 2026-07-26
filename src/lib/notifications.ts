import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { NotificationType } from "@/types";

export type NotificationEvent = {
  userId: string;
  actorId?: string | null;
  projectId: string;
  caseResultId: string;
  type: NotificationType;
  dedupeKey?: string | null;
};

export type CaseNotificationUpdate = {
  caseResultId: string;
  projectId: string;
  assigneeId: string | null;
  assigneeChanged: boolean;
  watchedChanged: boolean;
};

const PREFERENCE_FIELD: Record<
  NotificationType,
  | "assignmentEnabled"
  | "mentionEnabled"
  | "watchedEnabled"
  | "dueSoonEnabled"
  | "overdueEnabled"
> = {
  ASSIGNMENT: "assignmentEnabled",
  MENTION: "mentionEnabled",
  WATCHED_COMMENT: "watchedEnabled",
  WATCHED_UPDATE: "watchedEnabled",
  DUE_SOON: "dueSoonEnabled",
  OVERDUE: "overdueEnabled",
};

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  ASSIGNMENT: "将用例分派给了你",
  MENTION: "在评论中提到了你",
  WATCHED_COMMENT: "评论了你关注的用例",
  WATCHED_UPDATE: "更新了你关注的用例",
  DUE_SOON: "用例即将到期",
  OVERDUE: "用例已逾期",
};

type PreferenceRecord = {
  userId: string;
  assignmentEnabled: boolean;
  mentionEnabled: boolean;
  watchedEnabled: boolean;
  dueSoonEnabled: boolean;
  overdueEnabled: boolean;
};

function logDeliveryFailure(error: unknown) {
  logger.error("notification.delivery_failed", {
    error,
    safeErrorMessage: "Notification delivery failed",
  });
}

export function extractMentionUsernames(comment: string): string[] {
  const usernames = new Set<string>();
  for (const match of comment.matchAll(/@([\p{L}\p{N}_.-]{1,50})/gu)) {
    usernames.add(match[1]);
  }
  return Array.from(usernames);
}

export async function createNotificationsBestEffort(
  events: NotificationEvent[],
): Promise<number> {
  if (events.length === 0) return 0;

  try {
    const notificationClient = prisma.notification;
    const preferenceClient = prisma.notificationPreference;
    if (!notificationClient?.createMany || !preferenceClient?.findMany) return 0;

    const uniqueEvents = Array.from(
      new Map(
        events.map((event) => [
          [
            event.userId,
            event.type,
            event.caseResultId,
            event.dedupeKey ?? "",
          ].join(":"),
          event,
        ]),
      ).values(),
    );
    const userIds = Array.from(
      new Set(uniqueEvents.map((event) => event.userId)),
    );
    const preferences = await preferenceClient.findMany({
      where: { userId: { in: userIds } },
      select: {
        userId: true,
        assignmentEnabled: true,
        mentionEnabled: true,
        watchedEnabled: true,
        dueSoonEnabled: true,
        overdueEnabled: true,
      },
    });
    const preferenceByUser = new Map<string, PreferenceRecord>(
      preferences.map((preference) => [preference.userId, preference]),
    );
    const enabledEvents = uniqueEvents.filter((event) => {
      const preference = preferenceByUser.get(event.userId);
      return preference?.[PREFERENCE_FIELD[event.type]] ?? true;
    });
    if (enabledEvents.length === 0) return 0;

    const result = await notificationClient.createMany({
      data: enabledEvents,
      skipDuplicates: true,
    });
    return result.count;
  } catch (error) {
    logDeliveryFailure(error);
    return 0;
  }
}

export async function notifyCommentBestEffort(input: {
  actorId: string;
  caseResultId: string;
  projectId: string;
  comment: string;
}): Promise<void> {
  try {
    const watcherClient = prisma.caseWatcher;
    if (!watcherClient?.findMany) return;

    const mentionUsernames = extractMentionUsernames(input.comment);
    const [mentionedUsers, watchers] = await Promise.all([
      mentionUsernames.length > 0
        ? prisma.user.findMany({
            where: { username: { in: mentionUsernames } },
            select: {
              id: true,
              role: true,
              projectMemberships: {
                where: { projectId: input.projectId },
                select: { id: true },
                take: 1,
              },
            },
          })
        : Promise.resolve([]),
      watcherClient.findMany({
        where: {
          caseResultId: input.caseResultId,
          userId: { not: input.actorId },
        },
        select: { userId: true },
      }),
    ]);
    const mentionedUserIds = new Set(
      mentionedUsers
        .filter(
          (user) =>
            user.id !== input.actorId &&
            (user.role === "ADMIN" || user.projectMemberships.length > 0),
        )
        .map((user) => user.id),
    );
    const events: NotificationEvent[] = Array.from(mentionedUserIds).map(
      (userId) => ({
        userId,
        actorId: input.actorId,
        projectId: input.projectId,
        caseResultId: input.caseResultId,
        type: "MENTION",
      }),
    );
    for (const watcher of watchers) {
      if (mentionedUserIds.has(watcher.userId)) continue;
      events.push({
        userId: watcher.userId,
        actorId: input.actorId,
        projectId: input.projectId,
        caseResultId: input.caseResultId,
        type: "WATCHED_COMMENT",
      });
    }
    await createNotificationsBestEffort(events);
  } catch (error) {
    logDeliveryFailure(error);
  }
}

export async function notifyCaseUpdatesBestEffort(input: {
  actorId: string;
  updates: CaseNotificationUpdate[];
}): Promise<void> {
  if (input.updates.length === 0) return;

  try {
    const watcherClient = prisma.caseWatcher;
    if (!watcherClient?.findMany) return;

    const watchedCaseIds = input.updates
      .filter((update) => update.watchedChanged)
      .map((update) => update.caseResultId);
    const watchers =
      watchedCaseIds.length > 0
        ? await watcherClient.findMany({
            where: {
              caseResultId: { in: watchedCaseIds },
              userId: { not: input.actorId },
            },
            select: { userId: true, caseResultId: true },
          })
        : [];
    const updateByCaseId = new Map(
      input.updates.map((update) => [update.caseResultId, update]),
    );
    const events: NotificationEvent[] = [];

    for (const update of input.updates) {
      if (
        update.assigneeChanged &&
        update.assigneeId &&
        update.assigneeId !== input.actorId
      ) {
        events.push({
          userId: update.assigneeId,
          actorId: input.actorId,
          projectId: update.projectId,
          caseResultId: update.caseResultId,
          type: "ASSIGNMENT",
        });
      }
    }
    for (const watcher of watchers) {
      const update = updateByCaseId.get(watcher.caseResultId);
      if (!update) continue;
      events.push({
        userId: watcher.userId,
        actorId: input.actorId,
        projectId: update.projectId,
        caseResultId: update.caseResultId,
        type: "WATCHED_UPDATE",
      });
    }
    await createNotificationsBestEffort(events);
  } catch (error) {
    logDeliveryFailure(error);
  }
}

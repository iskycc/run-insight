-- CreateTable
CREATE TABLE `Notification` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `caseResultId` VARCHAR(191) NOT NULL,
  `type` ENUM(
    'ASSIGNMENT',
    'MENTION',
    'WATCHED_COMMENT',
    'WATCHED_UPDATE',
    'DUE_SOON',
    'OVERDUE'
  ) NOT NULL,
  `dedupeKey` VARCHAR(191) NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `Notification_dedupeKey_key`(`dedupeKey`),
  INDEX `Notification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
  INDEX `Notification_projectId_createdAt_idx`(`projectId`, `createdAt`),
  INDEX `Notification_caseResultId_createdAt_idx`(`caseResultId`, `createdAt`),
  INDEX `Notification_actorId_idx`(`actorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseWatcher` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `caseResultId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `CaseWatcher_userId_caseResultId_key`(`userId`, `caseResultId`),
  INDEX `CaseWatcher_caseResultId_createdAt_idx`(`caseResultId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationPreference` (
  `userId` VARCHAR(191) NOT NULL,
  `assignmentEnabled` BOOLEAN NOT NULL DEFAULT true,
  `mentionEnabled` BOOLEAN NOT NULL DEFAULT true,
  `watchedEnabled` BOOLEAN NOT NULL DEFAULT true,
  `dueSoonEnabled` BOOLEAN NOT NULL DEFAULT true,
  `overdueEnabled` BOOLEAN NOT NULL DEFAULT true,
  `dueSoonHours` INTEGER NOT NULL DEFAULT 48,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notification`
  ADD CONSTRAINT `Notification_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Notification`
  ADD CONSTRAINT `Notification_actorId_fkey`
  FOREIGN KEY (`actorId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Notification`
  ADD CONSTRAINT `Notification_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Notification`
  ADD CONSTRAINT `Notification_caseResultId_fkey`
  FOREIGN KEY (`caseResultId`) REFERENCES `CaseResult`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CaseWatcher`
  ADD CONSTRAINT `CaseWatcher_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CaseWatcher`
  ADD CONSTRAINT `CaseWatcher_caseResultId_fkey`
  FOREIGN KEY (`caseResultId`) REFERENCES `CaseResult`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `NotificationPreference`
  ADD CONSTRAINT `NotificationPreference_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

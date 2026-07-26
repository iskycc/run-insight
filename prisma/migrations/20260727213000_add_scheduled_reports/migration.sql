-- CreateTable
CREATE TABLE `ScheduledReport` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `type` ENUM('QUALITY_GATE', 'ASSIGNEE', 'TREND') NOT NULL,
  `config` JSON NOT NULL,
  `cadence` ENUM('DAILY', 'WEEKLY') NOT NULL,
  `timezone` VARCHAR(100) NOT NULL,
  `runHour` INTEGER NOT NULL DEFAULT 9,
  `runMinute` INTEGER NOT NULL DEFAULT 0,
  `weekDay` INTEGER NOT NULL DEFAULT 1,
  `nextRunAt` DATETIME(3) NOT NULL,
  `lastRunAt` DATETIME(3) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `claimToken` VARCHAR(64) NULL,
  `claimedAt` DATETIME(3) NULL,
  `lastError` TEXT NULL,
  `consecutiveFails` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ScheduledReport_claimToken_key`(`claimToken`),
  INDEX `ScheduledReport_ownerId_updatedAt_idx`(`ownerId`, `updatedAt`),
  INDEX `ScheduledReport_projectId_updatedAt_idx`(`projectId`, `updatedAt`),
  INDEX `ScheduledReport_active_nextRunAt_idx`(`active`, `nextRunAt`),
  INDEX `ScheduledReport_claimToken_claimedAt_idx`(`claimToken`, `claimedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportSnapshot` (
  `id` VARCHAR(191) NOT NULL,
  `scheduledReportId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `reportName` VARCHAR(100) NOT NULL,
  `reportType` ENUM('QUALITY_GATE', 'ASSIGNEE', 'TREND') NOT NULL,
  `periodKey` VARCHAR(100) NOT NULL,
  `summary` JSON NOT NULL,
  `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `ReportSnapshot_scheduledReportId_periodKey_key`(`scheduledReportId`, `periodKey`),
  INDEX `ReportSnapshot_projectId_generatedAt_idx`(`projectId`, `generatedAt`),
  INDEX `ReportSnapshot_scheduledReportId_generatedAt_idx`(`scheduledReportId`, `generatedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportNotification` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `snapshotId` VARCHAR(191) NOT NULL,
  `link` VARCHAR(500) NOT NULL,
  `readAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `ReportNotification_snapshotId_key`(`snapshotId`),
  INDEX `ReportNotification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
  INDEX `ReportNotification_projectId_createdAt_idx`(`projectId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ScheduledReport`
  ADD CONSTRAINT `ScheduledReport_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ScheduledReport`
  ADD CONSTRAINT `ScheduledReport_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportSnapshot`
  ADD CONSTRAINT `ReportSnapshot_scheduledReportId_fkey`
  FOREIGN KEY (`scheduledReportId`) REFERENCES `ScheduledReport`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportSnapshot`
  ADD CONSTRAINT `ReportSnapshot_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportNotification`
  ADD CONSTRAINT `ReportNotification_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportNotification`
  ADD CONSTRAINT `ReportNotification_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ReportNotification`
  ADD CONSTRAINT `ReportNotification_snapshotId_fkey`
  FOREIGN KEY (`snapshotId`) REFERENCES `ReportSnapshot`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

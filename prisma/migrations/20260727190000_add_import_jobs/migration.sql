-- CreateTable
CREATE TABLE `ImportJob` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `testStageId` VARCHAR(191) NOT NULL,
  `batchScopeId` VARCHAR(191) NOT NULL,
  `importRecordId` VARCHAR(191) NULL,
  `importType` VARCHAR(32) NOT NULL,
  `fileName` VARCHAR(191) NOT NULL,
  `requestId` VARCHAR(64) NOT NULL,
  `status` ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `progress` INTEGER NOT NULL DEFAULT 0,
  `totalRows` INTEGER NOT NULL,
  `processedRows` INTEGER NOT NULL DEFAULT 0,
  `errorCount` INTEGER NOT NULL DEFAULT 0,
  `errorSummary` TEXT NULL,
  `errorDetails` JSON NULL,
  `payload` JSON NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `claimToken` VARCHAR(64) NULL,
  `claimedAt` DATETIME(3) NULL,
  `heartbeatAt` DATETIME(3) NULL,
  `cancelRequested` BOOLEAN NOT NULL DEFAULT false,
  `startedAt` DATETIME(3) NULL,
  `finishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ImportJob_importRecordId_key`(`importRecordId`),
  UNIQUE INDEX `ImportJob_requestId_key`(`requestId`),
  UNIQUE INDEX `ImportJob_claimToken_key`(`claimToken`),
  INDEX `ImportJob_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
  INDEX `ImportJob_projectId_createdAt_idx`(`projectId`, `createdAt`),
  INDEX `ImportJob_status_createdAt_idx`(`status`, `createdAt`),
  INDEX `ImportJob_status_heartbeatAt_idx`(`status`, `heartbeatAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ImportJob`
  ADD CONSTRAINT `ImportJob_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ImportJob`
  ADD CONSTRAINT `ImportJob_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ImportJob`
  ADD CONSTRAINT `ImportJob_testStageId_fkey`
  FOREIGN KEY (`testStageId`) REFERENCES `TestStage`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ImportJob`
  ADD CONSTRAINT `ImportJob_batchScopeId_fkey`
  FOREIGN KEY (`batchScopeId`) REFERENCES `BatchScope`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ImportJob`
  ADD CONSTRAINT `ImportJob_importRecordId_fkey`
  FOREIGN KEY (`importRecordId`) REFERENCES `ImportRecord`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

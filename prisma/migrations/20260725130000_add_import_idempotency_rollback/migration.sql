-- Persist idempotency keys and reversible per-case import changes.

-- AlterTable
ALTER TABLE `ImportRecord`
  ADD COLUMN `requestId` VARCHAR(191) NULL,
  ADD COLUMN `rolledBackAt` DATETIME(3) NULL,
  ADD COLUMN `rolledBackBy` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `ImportRecord_requestId_key`
  ON `ImportRecord`(`requestId`);

-- CreateTable
CREATE TABLE `ImportChange` (
  `id` VARCHAR(191) NOT NULL,
  `importRecordId` VARCHAR(191) NOT NULL,
  `caseResultId` VARCHAR(191) NOT NULL,
  `changeType` ENUM('CREATED', 'UPDATED') NOT NULL,
  `before` JSON NULL,
  `appliedUpdatedAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `ImportChange_importRecordId_idx`(`importRecordId`),
  INDEX `ImportChange_caseResultId_idx`(`caseResultId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ImportChange`
  ADD CONSTRAINT `ImportChange_importRecordId_fkey`
  FOREIGN KEY (`importRecordId`) REFERENCES `ImportRecord`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

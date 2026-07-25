-- Add standardized root-cause categories and independent knowledge assets.
-- The legacy CaseResult.assetSaved flag is intentionally retained for backward
-- compatibility; existing saved cases are backfilled as published assets below.

-- AlterTable
ALTER TABLE `CaseResult`
  ADD COLUMN `rootCauseCategoryId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `RootCauseCategory` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `archived` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `RootCauseCategory_projectId_name_key`(`projectId`, `name`),
  INDEX `RootCauseCategory_projectId_archived_idx`(`projectId`, `archived`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Asset` (
  `id` VARCHAR(191) NOT NULL,
  `sourceCaseId` VARCHAR(191) NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `rootCauseCategoryId` VARCHAR(191) NULL,
  `title` VARCHAR(191) NOT NULL,
  `summary` TEXT NOT NULL,
  `solution` TEXT NOT NULL,
  `rootCauseText` TEXT NULL,
  `tags` JSON NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdBy` VARCHAR(191) NULL,
  `updatedBy` VARCHAR(191) NULL,
  `viewCount` INTEGER NOT NULL DEFAULT 0,
  `reuseCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `Asset_sourceCaseId_key`(`sourceCaseId`),
  INDEX `Asset_projectId_status_updatedAt_idx`(`projectId`, `status`, `updatedAt`),
  INDEX `Asset_rootCauseCategoryId_idx`(`rootCauseCategoryId`),
  INDEX `Asset_createdBy_idx`(`createdBy`),
  INDEX `Asset_updatedBy_idx`(`updatedBy`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill every legacy saved case into an independent, published asset.
INSERT INTO `Asset` (
  `id`,
  `sourceCaseId`,
  `projectId`,
  `title`,
  `summary`,
  `solution`,
  `rootCauseText`,
  `tags`,
  `status`,
  `version`,
  `createdBy`,
  `updatedBy`,
  `viewCount`,
  `reuseCount`,
  `createdAt`,
  `updatedAt`
)
SELECT
  CONCAT('legacy_', LEFT(SHA2(`id`, 256), 24)),
  `id`,
  `projectId`,
  `name`,
  CONCAT(
    '用例 ', `caseNo`, '（', `resultSummary`, '）',
    IF(`rootCause` IS NULL OR `rootCause` = '', '', CONCAT('：', `rootCause`))
  ),
  COALESCE(NULLIF(`notes`, ''), NULLIF(`mrOrTicket`, ''), '由历史资产标记迁移，待补充解决方案'),
  `rootCause`,
  JSON_ARRAY(),
  'PUBLISHED',
  1,
  `updatedBy`,
  `updatedBy`,
  0,
  0,
  `createdAt`,
  `updatedAt`
FROM `CaseResult`
WHERE `assetSaved` = true;

-- CreateIndex
CREATE INDEX `CaseResult_rootCauseCategoryId_idx`
  ON `CaseResult`(`rootCauseCategoryId`);

-- AddForeignKey
ALTER TABLE `RootCauseCategory`
  ADD CONSTRAINT `RootCauseCategory_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CaseResult`
  ADD CONSTRAINT `CaseResult_rootCauseCategoryId_fkey`
  FOREIGN KEY (`rootCauseCategoryId`) REFERENCES `RootCauseCategory`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Asset`
  ADD CONSTRAINT `Asset_sourceCaseId_fkey`
  FOREIGN KEY (`sourceCaseId`) REFERENCES `CaseResult`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Asset`
  ADD CONSTRAINT `Asset_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Asset`
  ADD CONSTRAINT `Asset_rootCauseCategoryId_fkey`
  FOREIGN KEY (`rootCauseCategoryId`) REFERENCES `RootCauseCategory`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Asset`
  ADD CONSTRAINT `Asset_createdBy_fkey`
  FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Asset`
  ADD CONSTRAINT `Asset_updatedBy_fkey`
  FOREIGN KEY (`updatedBy`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TABLE `Asset`
  MODIFY `status` ENUM('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED')
    NOT NULL DEFAULT 'DRAFT',
  MODIFY `title` VARCHAR(200) NOT NULL;

-- CreateTable
CREATE TABLE `AssetVersion` (
  `id` VARCHAR(191) NOT NULL,
  `assetId` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `summary` TEXT NOT NULL,
  `solution` TEXT NOT NULL,
  `rootCauseText` TEXT NULL,
  `tags` JSON NOT NULL,
  `status` ENUM('DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED') NOT NULL,
  `changedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `AssetVersion_assetId_version_key`(`assetId`, `version`),
  INDEX `AssetVersion_assetId_createdAt_idx`(`assetId`, `createdAt`),
  INDEX `AssetVersion_changedBy_idx`(`changedBy`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill one immutable baseline for every existing asset. Historical
-- versions before this migration cannot be reconstructed, so the current
-- version number is preserved rather than renumbered.
INSERT INTO `AssetVersion` (
  `id`,
  `assetId`,
  `version`,
  `title`,
  `summary`,
  `solution`,
  `rootCauseText`,
  `tags`,
  `status`,
  `changedBy`,
  `createdAt`
)
SELECT
  CONCAT('av_', `id`),
  `id`,
  `version`,
  `title`,
  `summary`,
  `solution`,
  `rootCauseText`,
  `tags`,
  `status`,
  COALESCE(`updatedBy`, `createdBy`),
  `updatedAt`
FROM `Asset`;

-- AddForeignKey
ALTER TABLE `AssetVersion`
  ADD CONSTRAINT `AssetVersion_assetId_fkey`
  FOREIGN KEY (`assetId`) REFERENCES `Asset`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `AssetVersion`
  ADD CONSTRAINT `AssetVersion_changedBy_fkey`
  FOREIGN KEY (`changedBy`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `CaseResult`
  ADD COLUMN `assigneeId` VARCHAR(191) NULL,
  ADD COLUMN `priority` ENUM('HIGH', 'MEDIUM', 'LOW') NULL,
  ADD COLUMN `dueDate` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `ProjectMember` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `role` ENUM('ADMIN', 'EDITOR', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `ProjectMember_projectId_userId_key`(`projectId`, `userId`),
  INDEX `ProjectMember_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CaseActivity` (
  `id` VARCHAR(191) NOT NULL,
  `caseResultId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `type` ENUM('CREATED', 'UPDATED', 'COMMENT') NOT NULL,
  `changes` JSON NULL,
  `comment` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `CaseActivity_caseResultId_createdAt_idx`(`caseResultId`, `createdAt`),
  INDEX `CaseActivity_userId_idx`(`userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `CaseResult_assigneeId_priority_dueDate_idx`
  ON `CaseResult`(`assigneeId`, `priority`, `dueDate`);

-- AddForeignKey
ALTER TABLE `CaseResult`
  ADD CONSTRAINT `CaseResult_assigneeId_fkey`
  FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ProjectMember`
  ADD CONSTRAINT `ProjectMember_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ProjectMember`
  ADD CONSTRAINT `ProjectMember_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CaseActivity`
  ADD CONSTRAINT `CaseActivity_caseResultId_fkey`
  FOREIGN KEY (`caseResultId`) REFERENCES `CaseResult`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CaseActivity`
  ADD CONSTRAINT `CaseActivity_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill an administrator membership for every existing project. This keeps
-- historical projects manageable when project-scoped authorization is enabled.
INSERT INTO `ProjectMember`
  (`id`, `projectId`, `userId`, `role`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('pm_', REPLACE(UUID(), '-', '')),
  `Project`.`id`,
  `User`.`id`,
  'ADMIN',
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `Project`
CROSS JOIN `User`
WHERE `User`.`role` = 'ADMIN';

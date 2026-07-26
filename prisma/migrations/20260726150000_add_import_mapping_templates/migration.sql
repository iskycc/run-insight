-- CreateTable
CREATE TABLE `ImportMappingTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `name` VARCHAR(100) NOT NULL,
  `importType` VARCHAR(32) NOT NULL,
  `mapping` JSON NOT NULL,
  `scope` ENUM('PERSONAL', 'PROJECT') NOT NULL DEFAULT 'PERSONAL',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `ImportMappingTemplate_ownerId_importType_scope_updatedAt_idx`(
    `ownerId`,
    `importType`,
    `scope`,
    `updatedAt`
  ),
  INDEX `ImportMappingTemplate_projectId_importType_scope_updatedAt_idx`(
    `projectId`,
    `importType`,
    `scope`,
    `updatedAt`
  ),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ImportMappingTemplate`
  ADD CONSTRAINT `ImportMappingTemplate_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportMappingTemplate`
  ADD CONSTRAINT `ImportMappingTemplate_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

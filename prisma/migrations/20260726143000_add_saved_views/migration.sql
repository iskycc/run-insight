-- CreateTable
CREATE TABLE `SavedView` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NULL,
  `name` VARCHAR(100) NOT NULL,
  `filters` JSON NOT NULL,
  `scope` ENUM('PERSONAL', 'PROJECT') NOT NULL DEFAULT 'PERSONAL',
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `SavedView_ownerId_scope_updatedAt_idx`(`ownerId`, `scope`, `updatedAt`),
  INDEX `SavedView_projectId_scope_updatedAt_idx`(`projectId`, `scope`, `updatedAt`),
  INDEX `SavedView_ownerId_isDefault_idx`(`ownerId`, `isDefault`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SavedView`
  ADD CONSTRAINT `SavedView_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SavedView`
  ADD CONSTRAINT `SavedView_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

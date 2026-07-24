-- AlterTable
ALTER TABLE `BatchScope` ADD COLUMN `archived` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Project` ADD COLUMN `archived` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `TestStage` ADD COLUMN `archived` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `User` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateTable
CREATE TABLE `ApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ApiKey_keyHash_idx`(`keyHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ApiKey` ADD CONSTRAINT `ApiKey_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

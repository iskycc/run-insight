-- Establish a deterministic legacy tenant before making Project.organizationId
-- required. Existing users and projects are retained without changing IDs.
CREATE TABLE `Organization` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `archived` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Organization_name_key`(`name`),
  INDEX `Organization_archived_createdAt_idx`(`archived`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `OrganizationMember` (
  `id` VARCHAR(191) NOT NULL,
  `organizationId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `role` ENUM('OWNER', 'ADMIN', 'MEMBER') NOT NULL DEFAULT 'MEMBER',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `OrganizationMember_organizationId_userId_key`(`organizationId`, `userId`),
  INDEX `OrganizationMember_userId_createdAt_idx`(`userId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Organization` (`id`, `name`, `archived`, `createdAt`, `updatedAt`)
VALUES ('legacy-default-organization', '默认组织', false, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT INTO `OrganizationMember` (`id`, `organizationId`, `userId`, `role`, `createdAt`, `updatedAt`)
SELECT UUID(), 'legacy-default-organization', `id`,
  CASE WHEN `role` = 'ADMIN' THEN 'OWNER' ELSE 'MEMBER' END,
  CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `User`;

ALTER TABLE `Project` ADD COLUMN `organizationId` VARCHAR(191) NULL;
UPDATE `Project` SET `organizationId` = 'legacy-default-organization' WHERE `organizationId` IS NULL;
ALTER TABLE `Project` MODIFY `organizationId` VARCHAR(191) NOT NULL;

DROP INDEX `Project_name_key` ON `Project`;
CREATE UNIQUE INDEX `Project_organizationId_name_key` ON `Project`(`organizationId`, `name`);
CREATE INDEX `Project_organizationId_archived_createdAt_idx`
  ON `Project`(`organizationId`, `archived`, `createdAt`);

ALTER TABLE `OrganizationMember`
  ADD CONSTRAINT `OrganizationMember_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `OrganizationMember_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `Project`
  ADD CONSTRAINT `Project_organizationId_fkey`
  FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

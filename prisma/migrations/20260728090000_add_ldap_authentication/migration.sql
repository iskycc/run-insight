ALTER TABLE `User`
    MODIFY `password` VARCHAR(191) NULL,
    ADD COLUMN `authSource` ENUM('LOCAL', 'LDAP') NOT NULL DEFAULT 'LOCAL',
    ADD COLUMN `ldapExternalId` VARCHAR(191) NULL,
    ADD COLUMN `ldapDn` VARCHAR(512) NULL;

CREATE UNIQUE INDEX `User_ldapExternalId_key` ON `User`(`ldapExternalId`);

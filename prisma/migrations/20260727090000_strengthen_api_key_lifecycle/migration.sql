-- AlterTable
-- Existing keys cannot recover their raw prefix from a one-way hash. Mark them
-- as legacy while preserving the hash and granting the only pre-existing
-- capability, IMPORT.
ALTER TABLE `ApiKey`
  ADD COLUMN `prefix` VARCHAR(16) NULL,
  ADD COLUMN `scopes` JSON NULL,
  ADD COLUMN `expiresAt` DATETIME(3) NULL,
  ADD COLUMN `revokedAt` DATETIME(3) NULL,
  ADD COLUMN `lastUsedAt` DATETIME(3) NULL,
  ADD COLUMN `updatedAt` DATETIME(3) NULL;

UPDATE `ApiKey`
SET
  `prefix` = 'legacy',
  `scopes` = JSON_ARRAY('IMPORT'),
  `updatedAt` = `createdAt`;

ALTER TABLE `ApiKey`
  MODIFY `prefix` VARCHAR(16) NOT NULL,
  MODIFY `scopes` JSON NOT NULL,
  MODIFY `updatedAt` DATETIME(3) NOT NULL;

-- Replace the non-unique lookup index with a uniqueness guarantee. SHA-256
-- collisions are not expected; failing here also surfaces corrupt duplicate
-- credentials instead of silently choosing one.
DROP INDEX `ApiKey_keyHash_idx` ON `ApiKey`;
CREATE UNIQUE INDEX `ApiKey_keyHash_key` ON `ApiKey`(`keyHash`);

CREATE INDEX `ApiKey_projectId_revokedAt_createdAt_idx`
  ON `ApiKey`(`projectId`, `revokedAt`, `createdAt`);

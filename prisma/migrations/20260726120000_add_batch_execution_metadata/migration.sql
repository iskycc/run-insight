ALTER TABLE `BatchScope`
    ADD COLUMN `executedAt` DATETIME(3) NULL,
    ADD COLUMN `startedAt` DATETIME(3) NULL,
    ADD COLUMN `finishedAt` DATETIME(3) NULL,
    ADD COLUMN `environment` VARCHAR(100) NULL,
    ADD COLUMN `buildVersion` VARCHAR(191) NULL,
    ADD COLUMN `commitSha` VARCHAR(64) NULL,
    ADD COLUMN `pipelineUrl` VARCHAR(500) NULL;

UPDATE `BatchScope` SET `executedAt` = `createdAt` WHERE `executedAt` IS NULL;

ALTER TABLE `BatchScope`
    MODIFY `executedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

CREATE INDEX `BatchScope_projectId_executedAt_idx`
    ON `BatchScope`(`projectId`, `executedAt`);

CREATE INDEX `BatchScope_testStageId_executedAt_idx`
    ON `BatchScope`(`testStageId`, `executedAt`);

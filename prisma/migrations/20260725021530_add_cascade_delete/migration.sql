-- DropForeignKey
ALTER TABLE `ApiKey` DROP FOREIGN KEY `ApiKey_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `ApiKey` DROP FOREIGN KEY `ApiKey_userId_fkey`;

-- DropForeignKey
ALTER TABLE `BatchScope` DROP FOREIGN KEY `BatchScope_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `BatchScope` DROP FOREIGN KEY `BatchScope_testStageId_fkey`;

-- DropForeignKey
ALTER TABLE `CaseResult` DROP FOREIGN KEY `CaseResult_batchScopeId_fkey`;

-- DropForeignKey
ALTER TABLE `CaseResult` DROP FOREIGN KEY `CaseResult_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `CaseResult` DROP FOREIGN KEY `CaseResult_testStageId_fkey`;

-- DropForeignKey
ALTER TABLE `ImportRecord` DROP FOREIGN KEY `ImportRecord_projectId_fkey`;

-- DropForeignKey
ALTER TABLE `TestStage` DROP FOREIGN KEY `TestStage_projectId_fkey`;

-- DropIndex
DROP INDEX `ApiKey_projectId_fkey` ON `ApiKey`;

-- DropIndex
DROP INDEX `ApiKey_userId_fkey` ON `ApiKey`;

-- DropIndex
DROP INDEX `BatchScope_testStageId_fkey` ON `BatchScope`;

-- AddForeignKey
ALTER TABLE `TestStage` ADD CONSTRAINT `TestStage_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BatchScope` ADD CONSTRAINT `BatchScope_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BatchScope` ADD CONSTRAINT `BatchScope_testStageId_fkey` FOREIGN KEY (`testStageId`) REFERENCES `TestStage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseResult` ADD CONSTRAINT `CaseResult_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseResult` ADD CONSTRAINT `CaseResult_testStageId_fkey` FOREIGN KEY (`testStageId`) REFERENCES `TestStage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CaseResult` ADD CONSTRAINT `CaseResult_batchScopeId_fkey` FOREIGN KEY (`batchScopeId`) REFERENCES `BatchScope`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportRecord` ADD CONSTRAINT `ImportRecord_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApiKey` ADD CONSTRAINT `ApiKey_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApiKey` ADD CONSTRAINT `ApiKey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

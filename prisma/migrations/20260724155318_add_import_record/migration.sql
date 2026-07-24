-- CreateTable
CREATE TABLE `ImportRecord` (
    `id` VARCHAR(191) NOT NULL,
    `projectId` VARCHAR(191) NOT NULL,
    `importType` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `totalRows` INTEGER NOT NULL,
    `importedCount` INTEGER NOT NULL,
    `errorCount` INTEGER NOT NULL,
    `errors` JSON NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ImportRecord_projectId_idx`(`projectId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `CaseResult_projectId_resultSummary_idx` ON `CaseResult`(`projectId`, `resultSummary`);

-- CreateIndex
CREATE INDEX `CaseResult_testStageId_resultSummary_idx` ON `CaseResult`(`testStageId`, `resultSummary`);

-- CreateIndex
CREATE INDEX `CaseResult_batchScopeId_resultSummary_idx` ON `CaseResult`(`batchScopeId`, `resultSummary`);

-- CreateIndex
CREATE INDEX `CaseResult_batchScopeId_progressCategory_idx` ON `CaseResult`(`batchScopeId`, `progressCategory`);

-- CreateIndex
CREATE INDEX `CaseResult_projectId_progressCategory_idx` ON `CaseResult`(`projectId`, `progressCategory`);

-- CreateIndex
CREATE INDEX `CaseResult_assetSaved_idx` ON `CaseResult`(`assetSaved`);

-- AddForeignKey
ALTER TABLE `ImportRecord` ADD CONSTRAINT `ImportRecord_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ImportRecord` ADD CONSTRAINT `ImportRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

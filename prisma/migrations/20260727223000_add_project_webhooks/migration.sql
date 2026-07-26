-- CreateTable
CREATE TABLE `WebhookEndpoint` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `url` VARCHAR(2048) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `events` JSON NOT NULL,
  `secretCiphertext` TEXT NOT NULL,
  `secretPrefix` VARCHAR(16) NOT NULL,
  `deletedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `WebhookEndpoint_projectId_deletedAt_updatedAt_idx`(`projectId`, `deletedAt`, `updatedAt`),
  INDEX `WebhookEndpoint_projectId_active_deletedAt_idx`(`projectId`, `active`, `deletedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WebhookDelivery` (
  `id` VARCHAR(191) NOT NULL,
  `endpointId` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `eventId` VARCHAR(64) NOT NULL,
  `event` ENUM('IMPORT_COMPLETED', 'IMPORT_FAILED', 'QUALITY_GATE_FAILED', 'REPORT_GENERATED') NOT NULL,
  `targetUrl` VARCHAR(2048) NOT NULL,
  `payload` JSON NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `maxAttempts` INTEGER NOT NULL DEFAULT 6,
  `nextAttemptAt` DATETIME(3) NULL,
  `claimToken` VARCHAR(64) NULL,
  `claimedAt` DATETIME(3) NULL,
  `responseStatus` INTEGER NULL,
  `responseBody` VARCHAR(2048) NULL,
  `errorCode` VARCHAR(64) NULL,
  `deliveredAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `WebhookDelivery_claimToken_key`(`claimToken`),
  INDEX `WebhookDelivery_status_nextAttemptAt_createdAt_idx`(`status`, `nextAttemptAt`, `createdAt`),
  INDEX `WebhookDelivery_projectId_createdAt_idx`(`projectId`, `createdAt`),
  INDEX `WebhookDelivery_endpointId_createdAt_idx`(`endpointId`, `createdAt`),
  INDEX `WebhookDelivery_eventId_idx`(`eventId`),
  INDEX `WebhookDelivery_claimToken_claimedAt_idx`(`claimToken`, `claimedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `WebhookEndpoint`
  ADD CONSTRAINT `WebhookEndpoint_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `WebhookDelivery`
  ADD CONSTRAINT `WebhookDelivery_endpointId_fkey`
  FOREIGN KEY (`endpointId`) REFERENCES `WebhookEndpoint`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `WebhookDelivery`
  ADD CONSTRAINT `WebhookDelivery_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

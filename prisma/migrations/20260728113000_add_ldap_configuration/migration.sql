CREATE TABLE `LdapConfiguration` (
    `id` INTEGER NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `url` VARCHAR(512) NOT NULL,
    `bindDn` VARCHAR(512) NOT NULL,
    `bindPasswordCiphertext` TEXT NOT NULL,
    `encryptionKey` VARCHAR(64) NOT NULL,
    `searchBase` VARCHAR(512) NOT NULL,
    `userFilter` VARCHAR(1024) NOT NULL,
    `uniqueIdAttribute` VARCHAR(191) NOT NULL DEFAULT 'entryUUID',
    `startTls` BOOLEAN NOT NULL DEFAULT true,
    `tlsRejectUnauthorized` BOOLEAN NOT NULL DEFAULT true,
    `tlsCaCertificate` TEXT NULL,
    `connectTimeoutMs` INTEGER NOT NULL DEFAULT 5000,
    `operationTimeoutMs` INTEGER NOT NULL DEFAULT 5000,
    `allowInsecure` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

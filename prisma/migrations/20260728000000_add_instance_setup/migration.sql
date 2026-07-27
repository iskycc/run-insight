-- A single-row marker makes first-run account registration atomic. Existing
-- installations are marked initialized during migration so the public setup
-- endpoint can never be reopened by an upgrade.
CREATE TABLE `InstanceSetup` (
  `id` INTEGER NOT NULL,
  `initializedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `InstanceSetup` (`id`, `initializedAt`)
SELECT 1, CURRENT_TIMESTAMP(3)
WHERE EXISTS (SELECT 1 FROM `User` LIMIT 1);

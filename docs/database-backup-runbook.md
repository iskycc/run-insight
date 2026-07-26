# Run Insight 数据库备份与恢复 Runbook

本文只适用于 `docker-compose.yaml` 中的内置 `db` 服务。脚本通过容器已有的
`MARIADB_USER`、`MARIADB_PASSWORD` 和 `MARIADB_DATABASE` 环境变量连接数据库，
不会把密码放进宿主机命令参数、备份名或日志。

## 安全边界

- 逻辑备份使用 `mariadb-dump --single-transaction --quick`，适合当前 InnoDB 表。
- 备份目录权限为 `0700`，备份和 SHA-256 文件受 `umask 077` 保护。
- 文件名固定为 `run-insight-db-YYYYMMDDTHHMMSSZ.sql.gz`；恢复前备份增加
  `pre-restore-` 标记。
- 恢复只接受 `BACKUP_DIR` 内一个符合命名规则的普通文件，拒绝符号链接、glob、
  目录和目录外文件。
- 恢复前必须通过 SHA-256 与 gzip 完整性检查、确认数据库名，并自动创建一次
  pre-restore 备份。
- `prune` 只删除符合上述项目命名规则且超过保留期的备份及其同名校验文件。

备份包含业务数据和密码哈希，应将 `BACKUP_DIR` 放在加密磁盘或受控备份卷中，
限制主机访问，并另行复制到异地存储。SHA-256 用于发现损坏，不代替加密或签名。
备份窗口内不要同时执行数据库迁移或其他 DDL；事务快照只能保证事务表的数据一致性。

## 日常操作

默认目录为仓库下的 `backups/`，默认保留阈值为 30 天：

```bash
scripts/db-backup.sh backup
scripts/db-backup.sh list
scripts/db-backup.sh verify run-insight-db-20260727T020000Z.sql.gz
```

生产环境建议使用仓库外的专用目录：

```bash
BACKUP_DIR=/var/backups/run-insight scripts/db-backup.sh backup
BACKUP_DIR=/var/backups/run-insight scripts/db-backup.sh list
BACKUP_DIR=/var/backups/run-insight \
  scripts/db-backup.sh verify run-insight-db-20260727T020000Z.sql.gz
```

只有显式运行 `prune` 才会清理旧文件：

```bash
BACKUP_DIR=/var/backups/run-insight BACKUP_RETENTION_DAYS=30 \
  scripts/db-backup.sh prune
```

## 定时任务示例

以下 cron 每天 02:15 备份、02:45 清理超过 30 天的受管备份。日志中只记录结果和
文件名，不记录密码：

```cron
15 2 * * * cd /opt/run-insight && BACKUP_DIR=/var/backups/run-insight scripts/db-backup.sh backup >> /var/log/run-insight-backup.log 2>&1
45 2 * * * cd /opt/run-insight && BACKUP_DIR=/var/backups/run-insight BACKUP_RETENTION_DAYS=30 scripts/db-backup.sh prune >> /var/log/run-insight-backup.log 2>&1
```

cron 用户必须能读取项目 Compose 配置、访问 Docker daemon，并独占备份目录。
建议对 cron 失败配置主机监控告警，并定期将备份复制到独立故障域。

## 恢复

先进入维护窗口并停止应用写入；不要停止 `db` 服务：

```bash
docker compose stop app
```

先列出并验证一个明确文件：

```bash
export BACKUP_DIR=/var/backups/run-insight
scripts/db-backup.sh list
scripts/db-backup.sh verify run-insight-db-20260727T020000Z.sql.gz
```

交互恢复会要求输入 Compose 容器中的数据库名：

```bash
scripts/db-backup.sh restore run-insight-db-20260727T020000Z.sql.gz
```

无人值守或受控变更窗口可显式确认，值必须与容器的 `MARIADB_DATABASE` 完全相同：

```bash
scripts/db-backup.sh restore \
  run-insight-db-20260727T020000Z.sql.gz \
  --confirm run_insight
```

脚本验证选定文件后，先创建
`run-insight-db-pre-restore-<timestamp>.sql.gz`，再执行恢复。恢复旧备份后，先按当前
应用版本重新执行迁移，再启动应用和检查：

```bash
docker compose run --rm migrate
docker compose up -d app
docker compose ps
curl --fail http://localhost:3300/api/health/ready
```

随后登录应用抽查项目、批次、用例与审计日志。若恢复结果不符合预期，先停止写入，
再把刚生成的 pre-restore 备份作为新的明确恢复源。

## 恢复演练

至少每季度在隔离主机或隔离 Compose 项目上演练，禁止直接把演练指向生产数据库：

1. 复制一份备份和 `.sha256` 到隔离且权限为 `0700` 的目录。
2. 在隔离环境启动相同 MariaDB 主版本，并配置不同的 Compose project name、端口和卷。
3. 使用隔离仓库与隔离 `BACKUP_DIR` 执行 `verify` 和 `restore`。
4. 应用全部迁移，运行就绪检查并抽查关键记录数与关联数据。
5. 记录恢复耗时、备份时间、校验结果和抽查结果，随后销毁隔离卷。

脚本固定使用 Compose 项目中的 `db` 服务，因此演练前必须确认当前目录和
`docker compose config` 指向隔离项目。

## 外部数据库

当 `DATABASE_URL` 指向云数据库或独立 MariaDB/MySQL 时，不要使用此脚本；它只访问
Compose 的 `db` 服务。应优先使用供应商的快照、时间点恢复（PITR）、跨区域复制和
保留策略，并使用供应商提供的校验与恢复演练流程。若另行使用 `mariadb-dump`：

- 通过受限配置文件、密钥管理器或进程环境传递凭据，不把密码放到命令参数；
- 明确 TLS、主机证书、数据库名和只读备份账号；
- 评估 GTID、存储过程、事件、触发器和一致性快照支持；
- 恢复到新实例验证后再切换，不直接覆盖生产实例。

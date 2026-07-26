# Run Insight

用例结果分析平台 —— 管理测试用例执行结果、分析问题根因、追踪修复进展。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS v4 |
| ORM | Prisma v7 + MariaDB adapter |
| 数据库 | MySQL / MariaDB |
| 图表 | Recharts 3 |
| 测试 | Jest 30 + ts-jest |

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
npm install

# 复制环境变量模板并填写
cp .env.example .env
```

`.env` 必须包含：

```env
DATABASE_URL=mysql://root:root123@127.0.0.1:3306/run_insight
JWT_SECRET=<使用 openssl rand -hex 48 生成>
NEXT_PUBLIC_TIME_ZONE=Asia/Shanghai
```

上面的数据库账号仅用于本机开发，请勿用于 Docker 或生产部署。生产环境缺少
`DATABASE_URL` 或 `JWT_SECRET` 时应用会拒绝启动。

`NEXT_PUBLIC_TIME_ZONE` 控制页面上日期和日期时间的显示时区，使用标准 IANA
时区名称（如 `Asia/Shanghai`、`UTC`）。未设置或配置无效时会安全回退到
`Asia/Shanghai`。日期输入框和 `datetime-local` 输入框仍按用户设备的本地墙上时间
处理，避免提交时产生额外时区偏移。

### 2. 数据库初始化

```bash
# 运行迁移
npx prisma migrate dev

# 填充种子数据（含管理员账号 + 3 个项目示例数据）
npx prisma db seed
```

本地种子数据默认创建 `admin / admin123` 和 `viewer / viewer123`，也可以通过
`SEED_ADMIN_PASSWORD`、`SEED_VIEWER_PASSWORD` 覆盖。种子脚本会重建演示项目，
因此生产环境默认拒绝执行。确需在生产执行时，必须同时设置
`RUN_INSIGHT_ALLOW_PRODUCTION_SEED=true`，并为两个种子账号提供至少 12 位的独立密码。

### 3. 启动开发服务器

```bash
npm run dev
```

打开 http://localhost:3000 ，使用管理员账号登录。

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── api/                #   REST API 路由
│   │   ├── assets/         #     资产库列表
│   │   ├── auth/           #     登录 / 登出 / 当前用户
│   │   ├── cases/          #     用例列表 & 批量更新
│   │   ├── import/         #     CSV 导入
│   │   ├── projects/       #     项目 & 阶段
│   │   ├── stages/         #     阶段 & 批次
│   │   └── stats/          #     仪表盘 & 趋势
│   ├── workspace/          #   工作台页面
│   ├── assets/             #   资产库页面
│   ├── case/[id]/          #   用例详情页
│   ├── import/             #   导入页面
│   └── login/              #   登录页面
├── components/             # React 组件
│   ├── workspace/          #   工作台（筛选栏、用例表格、指标卡片）
│   ├── dashboard/          #   仪表盘（趋势图、统计卡片）
│   ├── case/               #   用例详情 & 编辑分析
│   ├── assets/             #   资产列表 & 详情
│   ├── import/             #   导入（文件上传、字段映射、校验报告）
│   ├── layout/             #   布局（Header、Nav）
│   └── shared/             #   通用组件
├── lib/
│   ├── auth.ts             #   密码哈希、JWT、Cookie、认证中间件
│   ├── prisma.ts           #   Prisma 客户端单例
│   └── validations.ts     #   输入校验 & 导入数据校验
├── types/                  # TypeScript 类型定义
└── proxy.ts                # Next.js Middleware（路由鉴权）

prisma/
├── schema.prisma           # 数据模型
├── seed.ts                 # 种子数据
└── migrations/             # 迁移文件
```

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户信息 |
| GET / POST | `/api/organizations` | 当前用户的组织列表 / 创建组织 |
| POST | `/api/organizations/current` | 切换当前组织（安全 HttpOnly Cookie） |
| GET / POST | `/api/organizations/:id/members` | 组织成员列表 / 添加成员 |
| PATCH / DELETE | `/api/organizations/:id/members/:memberId` | 修改角色 / 移除成员 |
| GET | `/api/projects` | 当前组织内的项目列表 |
| GET | `/api/projects/:id/stages` | 项目下阶段列表 |
| GET | `/api/stages/:id/batches` | 阶段下批次列表 |
| GET | `/api/cases` | 用例列表（支持筛选分页） |
| PATCH | `/api/cases` | 批量更新用例 |
| GET | `/api/cases/:id` | 单条用例详情 |
| PATCH | `/api/cases/:id` | 更新单条用例 |
| POST | `/api/cases/:id/save-asset` | 保存单条资产 |
| POST | `/api/cases/batch-save-asset` | 批量保存资产 |
| GET | `/api/assets` | 资产库列表 |
| POST | `/api/import` | CSV 导入 |
| GET | `/api/stats/dashboard` | 仪表盘统计 |
| GET | `/api/stats/trend` | 趋势数据 |
| GET | `/api/health/live` | 应用存活检查（不依赖数据库） |
| GET | `/api/health/ready` | 应用就绪检查（包含数据库连通性） |

健康检查、`/api/auth/*` 和 `/api/stats/*` 无需认证；其余 API 未认证时返回 `401`。

## 反向代理与请求限流

`TRUST_PROXY_HOPS` 表示应用前方由部署方控制的反向代理层数，默认为 `0`。
未显式配置时，应用不会信任客户端可伪造的 `X-Forwarded-For` 或 `X-Real-IP`，
而是使用安全的 `untrusted-source` 来源标识。

```env
# 应用直接对外，或本地开发
TRUST_PROXY_HOPS=0

# 例如：客户端 → Nginx → 应用
TRUST_PROXY_HOPS=1

# 例如：客户端 → CDN → Nginx → 应用
TRUST_PROXY_HOPS=2
```

配置为 `N` 时，应用选择 `X-Forwarded-For` 中从右侧数第 `N` 个有效地址作为客户端来源。
代理必须覆盖或可靠追加该请求头，并阻止客户端绕过代理直接访问应用端口；否则应保持
`0`。单代理配置下，缺少 `X-Forwarded-For` 时才会接受 `X-Real-IP`。

登录限流同时使用“规范化用户名 + 客户端来源”和跨来源的“用户名”两级限额，
避免同一出口 IP 下不同账号互相占用额度，同时限制分布式单账号爆破。导入限流使用
“已认证用户 + 客户端来源”作为键。触发限流时接口返回 `429`，并通过
`Retry-After` 告知建议重试秒数。当前限流器保存在单个应用进程内，多副本部署时各副本
独立计数。

## 数据模型

- **User** — 管理员账号
- **Organization / OrganizationMember** — 租户边界及 OWNER、ADMIN、MEMBER 成员关系
- **Project** — 项目（如"支付系统"），必须归属一个 Organization
- **TestStage** — 测试阶段（如 SIT-1、UAT-1），归属 Project
- **BatchScope** — 批次（如 Batch-20260701），归属 TestStage
- **CaseResult** — 用例结果，归属 BatchScope，包含结果概要、分析字段、资产标记

## 组织与旧数据兼容

当前组织保存在 `run_insight_organization` HttpOnly、SameSite=Lax Cookie 中，服务端每次
都会重新验证组织成员关系，客户端不能通过伪造 Cookie 越权。系统级 `ADMIN` 不是
跨租户超级管理员；它仍必须属于目标组织。组织 OWNER/ADMIN 可管理本组织项目，普通
MEMBER 继续使用项目级 ADMIN/EDITOR/VIEWER 权限。

组织迁移会先创建 `默认组织`，将所有既有项目回填到该组织，并把既有用户加入组织
（原系统 ADMIN 为 OWNER，其他用户为 MEMBER），之后才将 `Project.organizationId`
设为必填。旧 JWT/旧服务端会话不需要重新签发：没有组织 Cookie 或 Cookie 已失效时，
服务端会安全选择该用户最早加入的有效组织。新用户若尚未加入组织，会看到空项目列表，
可自行创建组织或由 OWNER/ADMIN 邀请加入。

## 脚本

```bash
npm run dev        # 开发服务器
npm run build      # 生产构建
npm run start      # 启动生产服务器
npm run lint       # ESLint 检查
npm run test       # 运行测试
npm run test:integration # 对隔离 MariaDB 执行迁移与事务冒烟检查
npm run test:e2e   # 运行 Chromium 关键路径测试
npm run test:watch # 监听模式运行测试
```

## 测试

测试覆盖 `src/lib`、`src/app/api`、`src/proxy.ts`。随着异步任务、定时报表、Webhook
和多租户边界加入，当前全量覆盖率为 83.71% statements / 76.62% branches /
87.60% functions / 86.56% lines；CI 下限分别为 80% / 75% / 85% / 85%，用于阻止
覆盖率继续回退。

```bash
# 运行测试
npm test

# 带覆盖率报告
npx jest --coverage

# 需要先配置 DATABASE_URL，且只能指向可安全写入的隔离测试库
npm run test:integration
```

浏览器 E2E 覆盖公开大盘、管理员角色导航、项目与工作台筛选，以及健康检查端点。
先对隔离数据库应用迁移并执行种子，再构建和启动生产应用：

```bash
npx prisma migrate deploy
npx prisma db seed
npm run build
npm run start
```

在另一个终端按需安装 Chromium 并运行测试（本地不会由 `npm install` 自动下载浏览器）：

```bash
npx playwright install chromium
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

## Docker 部署

项目提供 `docker-compose.yaml`，用于拉取已发布的 Docker Hub 镜像并启动 MariaDB。

默认应用镜像：

```text
iskycc/run-insight:latest
```

首次部署先创建 Compose 环境文件：

```bash
cp .env.docker.example .env
```

编辑 `.env`，填写 `MARIADB_PASSWORD`、`MARIADB_ROOT_PASSWORD`、`DATABASE_URL`、
`JWT_SECRET`、`CRON_SECRET` 和 `WEBHOOK_ENCRYPTION_KEY`。密码建议使用
`openssl rand -hex 24`，JWT 密钥建议使用
`openssl rand -hex 48`。`DATABASE_URL` 中的账号、密码和数据库名必须与 MariaDB
变量一致，例如：

```env
MARIADB_DATABASE=run_insight
MARIADB_USER=run_insight
MARIADB_PASSWORD=<URL 安全的随机密码>
MARIADB_ROOT_PASSWORD=<另一个随机密码>
DATABASE_URL=mysql://run_insight:<与 MARIADB_PASSWORD 相同>@db:3306/run_insight
JWT_SECRET=<至少 32 字节的随机密钥>
CRON_SECRET=<与 JWT_SECRET 不同的随机密钥>
WEBHOOK_ENCRYPTION_KEY=<openssl rand -base64 32 的输出>
NEXT_PUBLIC_TIME_ZONE=Asia/Shanghai
```

确认配置完整并启动：

```bash
docker compose config
docker compose up -d
```

任一必填密钥为空时，`docker compose config` 会直接报错，不会使用内置弱默认值。

首次启动流程：

1. `db` 启动 MariaDB，并暴露到宿主机 `3307`。
2. `migrate` 使用同一个应用镜像执行 `prisma migrate deploy` 自动建表。
3. `app` 在迁移成功后启动，并通过就绪检查确认数据库可用，访问地址为 http://localhost:3300 。

查看状态和日志：

```bash
docker compose ps
docker compose logs -f app
```

应用提供两类无需登录的健康检查：

```bash
# 仅确认 Next.js 进程能够响应，不访问数据库
curl --fail http://localhost:3300/api/health/live

# 确认应用与数据库均已就绪；数据库不可用时返回 HTTP 503
curl --fail http://localhost:3300/api/health/ready
```

Compose 使用就绪检查判断 `app` 健康状态。若存活检查成功、就绪检查失败，
通常表示数据库连接或迁移状态异常。

停止：

```bash
docker compose down
```

清空数据库数据：

```bash
docker compose down -v
```

如果使用外部数据库，请将 `DATABASE_URL` 指向外部实例，并按需只启动 `migrate`
和 `app` 服务。无论使用内置还是外部数据库，`JWT_SECRET` 与数据库密码都必须显式提供。

### 数据库备份与恢复

Compose 内置 MariaDB 可使用安全运维脚本做一致性逻辑备份。备份默认写入
`backups/`，包含 gzip 压缩 SQL、SHA-256 校验文件和 UTC 时间戳；生产环境建议通过
`BACKUP_DIR` 指向仓库外的加密备份卷：

```bash
BACKUP_DIR=/var/backups/run-insight scripts/db-backup.sh backup
BACKUP_DIR=/var/backups/run-insight scripts/db-backup.sh list
BACKUP_DIR=/var/backups/run-insight \
  scripts/db-backup.sh verify run-insight-db-20260727T020000Z.sql.gz
```

恢复必须明确指定单个受管备份。脚本会先校验 SHA-256 和 gzip，要求输入数据库名
（无人值守时使用 `--confirm run_insight`），并在覆盖前自动创建 pre-restore 备份。
执行前应进入维护窗口并执行 `docker compose stop app` 停止应用写入，但保持 `db`
服务运行：

```bash
BACKUP_DIR=/var/backups/run-insight \
  scripts/db-backup.sh restore \
  run-insight-db-20260727T020000Z.sql.gz \
  --confirm run_insight
```

定时任务可将备份与清理拆开，避免隐式删除：

```cron
15 2 * * * cd /opt/run-insight && BACKUP_DIR=/var/backups/run-insight scripts/db-backup.sh backup >> /var/log/run-insight-backup.log 2>&1
45 2 * * * cd /opt/run-insight && BACKUP_DIR=/var/backups/run-insight BACKUP_RETENTION_DAYS=30 scripts/db-backup.sh prune >> /var/log/run-insight-backup.log 2>&1
```

完整安全边界、恢复演练与故障回退见
[数据库备份与恢复 Runbook](docs/database-backup-runbook.md)。当数据库由云服务或外部
主机提供时，不使用该脚本；应采用供应商快照/PITR、专用只读账号、TLS 和隔离实例恢复。

### 临期与逾期催办

应用只提供受 `CRON_SECRET` 保护的幂等任务端点，不会在 Web 容器中启动常驻或高频
调度进程。请使用系统 cron、Kubernetes CronJob 或云调度服务每 15–60 分钟调用一次：

```bash
curl --fail --request POST \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  https://你的域名/api/cron/due-reminders
```

任务会按用户通知偏好创建站内临期/逾期提醒。相同用例、负责人、截止时间和提醒类型
具有唯一幂等键，因此调度器重试不会生成重复通知。请勿把 `CRON_SECRET` 写入仓库、
URL 查询参数或公开日志。

Compose 还包含低频 `background-worker` 服务，每 30 秒通过容器内部 HTTP 调用一次
`/api/cron/import-jobs/process`，每次最多原子领取一个耐久导入任务。任务状态和原始
导入载荷保存在数据库中，Worker 或应用重启后会继续处理；心跳过期的 `RUNNING`
任务可以重新领取。Worker 不会把导入载荷写入审计日志或控制台日志。

### 定时报表与快照

登录用户可在 `/reports/scheduled` 为有权访问的项目创建每日或每周报表，支持质量
门禁、责任人和趋势三种类型。计划使用 IANA 时区计算本地执行时间并正确处理 DST；
生成的快照不可修改，项目成员可打印或下载 JSON/CSV，不提供匿名分享。

Compose 的同一个 `background-worker` 每分钟调用
`/api/cron/scheduled-reports/process`。处理器会原子领取到期计划，并以计划和本地
周期作为唯一键；失败时不推进下次执行时间且释放领取锁，因此下一轮会安全重试。
成功后会创建站内通知，并为订阅者排入 `REPORT_GENERATED` Webhook。

### 项目出站 Webhook

项目管理员可在项目设置页创建 Webhook，订阅 `IMPORT_COMPLETED`、
`IMPORT_FAILED`、`QUALITY_GATE_FAILED` 和 `REPORT_GENERATED`。目标仅允许不含
凭据的 HTTPS URL；每次投递前都会解析 DNS，并拒绝 loopback、私有网段、链路本地、
运营商 NAT、组播及云元数据地址。投递禁用重定向，超时为 5 秒，请求体上限 256 KiB，
响应读取上限 64 KiB。

创建或轮换时返回一次 `whsec_` 签名密钥，数据库中只保存用
`WEBHOOK_ENCRYPTION_KEY` 加密后的密文。该环境变量必须是 Base64 编码的 32 字节
随机值：

```bash
openssl rand -base64 32
```

接收方使用原始请求体校验签名。待签名内容为
`<webhook-timestamp>.<raw-json-body>`，算法为 HMAC-SHA256，最终请求头格式为：

```text
webhook-id: <事件 UUID>
webhook-timestamp: <Unix 秒>
webhook-signature: sha256=<hex digest>
```

`background-worker` 每 15 秒调用一次受 `CRON_SECRET` 保护的
`/api/cron/webhooks/process`。投递记录保存在数据库中，失败按指数退避重试，默认最多
6 次；项目管理员可查看最近 100 条记录并手动重新入队。日志只记录受控错误码和投递
ID，不记录签名密钥或原始响应正文。

三个后台入口由一个 Worker 顺序调用，避免导入、报表和 Webhook 处理器在同一节点上
并发争抢 CPU；如使用 Kubernetes 或云调度器，也建议维持单并发策略。

### 监控与结构化日志

服务端日志采用单行 JSON，核心字段为 `timestamp`、`level`、`event` 和
`requestId`。代理会接受格式安全且不超过 128 字符的 `x-request-id`，否则生成新
UUID，并将最终值同时传给 API 和响应。排障时可用同一个 `requestId` 关联反向代理、
应用错误、审计写入失败、限流器、通知投递和健康检查日志。

日志上下文会递归脱敏密码、令牌、Cookie、Authorization、API Key、数据库连接串等
敏感字段。异常只输出 `name`、安全格式的 `code` 和由应用指定的受控消息；生产环境
不会输出堆栈。不要在新增日志的事件名或上下文中拼接请求体、CSV 内容、原始异常消息
或密钥。

健康检查端点为 `/api/health/live` 和 `/api/health/ready`，均返回非敏感的
`version`、`build` 信息并禁止缓存；readiness 数据库检查失败会记录
`health.readiness_failed`。部署时可通过 `APP_VERSION` 与 `BUILD_ID` 注入公开版本
标识，值仅允许字母、数字及 `._+-`，无效或缺失时返回 `unknown`。

## CI 质量门禁

`.github/workflows/docker-publish.yml` 会在拉取请求和 `main` 分支推送时依次执行：

1. `npm ci`
2. `prisma generate`
3. 对隔离 MariaDB 应用迁移并执行真实事务、关联和级联检查
4. 向隔离 MariaDB 写入 E2E 种子数据
5. ESLint
6. Jest 全量测试与覆盖率阈值检查
7. Next.js 生产构建
8. 安装 Chromium 并执行关键路径 E2E

只有以上检查全部通过后，`main` 分支或版本标签才会构建并发布 Docker 镜像。
CI 使用临时 MariaDB 服务、独立种子密码和占位 `JWT_SECRET`，不会连接生产数据库。

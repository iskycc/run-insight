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
JWT_SECRET=your-secret-here
```

### 2. 数据库初始化

```bash
# 运行迁移
npx prisma migrate dev

# 填充种子数据（含管理员账号 + 3 个项目示例数据）
npx prisma db seed
```

种子数据创建的管理员账号：`admin / admin123`

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
| GET | `/api/projects` | 项目列表 |
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

所有 API（除 `/api/auth/*` 和 `/api/stats/*`）均需认证，未认证返回 `401`。

## 数据模型

- **User** — 管理员账号
- **Project** — 项目（如"支付系统"）
- **TestStage** — 测试阶段（如 SIT-1、UAT-1），归属 Project
- **BatchScope** — 批次（如 Batch-20260701），归属 TestStage
- **CaseResult** — 用例结果，归属 BatchScope，包含结果概要、分析字段、资产标记

## 脚本

```bash
npm run dev        # 开发服务器
npm run build      # 生产构建
npm run start      # 启动生产服务器
npm run lint       # ESLint 检查
npm run test       # 运行测试
npm run test:watch # 监听模式运行测试
```

## 测试

测试覆盖 `src/lib`、`src/app/api`、`src/proxy.ts`，当前覆盖率 **100%**。

```bash
# 运行测试
npm test

# 带覆盖率报告
npx jest --coverage
```

## Docker 部署

项目提供 `docker-compose.yaml`，用于拉取已发布的 Docker Hub 镜像并启动 MariaDB。

默认应用镜像：

```text
iskycc/run-insight:latest
```

启动：

```bash
docker compose up -d
```

首次启动流程：

1. `db` 启动 MariaDB，并暴露到宿主机 `3307`。
2. `migrate` 使用同一个应用镜像执行 `prisma migrate deploy` 自动建表。
3. `app` 在迁移成功后启动，访问地址为 http://localhost:3000 。

查看状态和日志：

```bash
docker compose ps
docker compose logs -f app
```

停止：

```bash
docker compose down
```

清空数据库数据：

```bash
docker compose down -v
```

生产部署时请设置强随机 `JWT_SECRET`：

```bash
JWT_SECRET=replace-with-a-long-random-secret docker compose up -d
```

如果需要使用外部数据库，可以只启动应用并覆盖 `DATABASE_URL`，或调整 `docker-compose.yaml` 中的数据库连接串。

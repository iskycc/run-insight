# Run Insight — Agent 指南

## 项目概述

用例结果分析平台。Next.js 16 App Router + TypeScript + Tailwind v4 + Prisma v7 (MariaDB adapter)。

## 常用命令

```bash
npm run dev          # 开发服务器 (localhost:3000)
npm run build        # 生产构建
npm test             # 运行测试
npx jest --coverage  # 带覆盖率报告
npm run lint         # ESLint
npx prisma migrate dev          # 运行迁移
npx prisma db seed              # 填充种子数据
npx prisma generate             # 重新生成 Prisma Client
```

## 代码规范

- TypeScript strict mode，不允许 `any`
- 路径别名 `@/` → `src/`（tsconfig + jest 均已配置）
- API 路由统一返回 `{ error: string, message: string }` 格式的错误响应
- 认证通过 Cookie（`run_insight_token`）+ JWT 实现，API 层自行校验，Middleware 只做页面重定向
- Prisma Client 生成到 `src/generated/prisma`，已在 `.gitignore` 中排除

## 架构要点

- **Middleware** (`src/proxy.ts`)：公开路径（`/`、`/login`、`/api/auth/*`、`/api/stats/*`）放行；API 路由全部放行（由 API 自行返回 401）；其余未认证页面重定向到 `/login`
- **API 认证**：各 API 路由调用 `authenticateRequest(request)` 校验 JWT
- **Prisma 单例**：`src/lib/prisma.ts`，开发环境挂 `globalThis` 防热重载创建多连接
- **输入校验**：`src/lib/validations.ts`，所有 API 入参均经过校验

## 测试

- 测试目录：`__tests__/`
- 运行环境：Node（testEnvironment: 'node'），不测试 React 组件
- 覆盖范围：`src/lib`、`src/app/api`、`src/proxy.ts`；`src/lib/prisma.ts` 已排除
- 覆盖率阈值：全局 90%（当前 100%）
- Mock 方式：Prisma Client 整体 mock，`next/server` 的 `NextRequest`/`NextResponse` 按需 mock

## 数据库

- 数据库：MySQL / MariaDB
- 连接串：`DATABASE_URL` 环境变量
- 种子数据：`prisma/seed.ts`，创建 admin 用户 + 3 个示例项目
- 迁移：`prisma/migrations/`

## 关键文件

| 文件 | 作用 |
|------|------|
| `src/proxy.ts` | Next.js Middleware，路由鉴权 |
| `src/lib/auth.ts` | 密码哈希、JWT 签发/验证、Cookie 操作、请求认证 |
| `src/lib/validations.ts` | 输入校验函数、CSV 导入数据校验 |
| `src/lib/prisma.ts` | Prisma Client 单例 |
| `src/types/index.ts` | 共享类型定义 |
| `prisma/schema.prisma` | 数据模型定义 |
| `jest.config.ts` | Jest 配置 |

# Run Insight 项目现状与优化 Todo

更新时间：2026-07-23

## 当前结论

Run Insight 已从原型推进到完整可交付状态。所有 P0/P1/P2 优化项均已完成。

验证结果：

- [x] `npm test` 通过：21 个测试套件，290 个测试全部通过。
- [x] `npx jest --coverage` 通过：99.85% stmt / 99.53% branch / 100% func / 100% lines。
- [x] `npm run build` 通过：Next.js 生产构建成功。
- [x] `npm run lint` 通过：0 errors, 0 warnings。

## 已具备能力

- [x] Next.js 16 App Router + TypeScript strict + Tailwind v4 工程结构已建立。
- [x] Prisma v7 + MariaDB adapter 已接入，Client 生成目录为 `src/generated/prisma`。
- [x] 数据模型覆盖 User、Project、TestStage、BatchScope、CaseResult。
- [x] Cookie + JWT 认证已实现，页面由 `src/proxy.ts` 重定向保护，API 路由自行认证返回 401。
- [x] 公开大盘接口 `/api/stats/dashboard`、`/api/stats/trend` 可未登录访问。
- [x] 登录后项目、阶段、批跑、用例、资产、导入相关 API 已实现。
- [x] CSV / JSON 导入页面、字段映射和服务端导入校验已有基础能力。
- [x] 单条保存资产和批量保存资产 API 已实现。
- [x] API 和核心 lib 已有高覆盖率单元测试。
- [x] 前端组件测试已覆盖 AuthProvider、CaseTable、Button、FilterBar、MetricCards。
- [x] 导入页支持"选择或创建"项目/阶段/批跑。
- [x] 导入页支持客户端预校验。
- [x] 统计接口已优化为 groupBy 聚合查询，消除 N+1。
- [x] 数据库已添加业务组合索引。

## P0：优先修复，会影响开发反馈或业务正确性 ✅ 全部完成

- [x] 修复 lint 脚本。
  - 已改为 `"lint": "eslint ."`，0 errors 0 warnings。

- [x] 修复种子数据的进展分类枚举不一致。
  - `FIXING` → `FIXED`，`RESOLVED` → `NOT_ISSUE`，已统一。

- [x] 修复工作台进展标签映射。
  - `PROGRESS_MAP` 已改用英文枚举 key，Badge 通过 `PROGRESS_LABELS` 显示中文。

- [x] 修复导入页 render 阶段副作用。
  - `useState(() => fetch(...))` 已改为 `useEffect`。

- [x] 明确并修复"分析后导入"的语义。
  - 分析后导入已改为 upsert，按 `(projectId, testStageId, batchScopeId, caseNo)` 匹配更新。

- [x] 服务端校验导入上下文关系。
  - 导入前已校验 `BatchScope` 的 `projectId`、`testStageId` 与请求一致，错误返回统一 `VALIDATION_ERROR`。

## P1：重要优化，提升一致性、安全性和可维护性 ✅ 全部完成

- [x] 统一 API 错误响应格式。
  - 已创建 `src/lib/api-helpers.ts`，统一 `{ error, message }` 格式与错误码大写枚举。

- [x] 去掉生产代码里的 `any` 和 eslint disable。
  - 已替换为 Prisma 生成类型、`unknown` + 类型收窄。

- [x] 加强 API 入参校验。
  - `progressCategory` 枚举校验、`caseIds` 非空 CUID 校验、字段长度校验均已补齐。

- [x] 工作台指标应跟随筛选条件。
  - dashboard stats 已支持 query 参数，指标随筛选条件联动。

- [x] 完成工作台详情跳转和排序。
  - 详情跳转已改为 `router.push('/case/${id}')`，排序已接入。

- [x] 增强认证与 Cookie 安全。
  - `JWT_SECRET` 已改为无默认值时 warn，Cookie 生产环境已加 `Secure`。

- [x] 改造 `prisma/seed.ts` 数据库连接。
  - 已改为使用 `DATABASE_URL` 环境变量。

## P2：产品体验和工程质量增强 ✅ 全部完成

- [x] 导入页补足"选择或创建"项目、阶段、批跑。
  - 每个 `<select>` 下拉框顶部增加 `➕ 新建` 选项，选中后展示内联输入框+确认按钮。
  - 创建成功后自动追加到列表并选中，创建失败展示内联错误信息。
  - 阶段/批跑新建依赖父级选择，未选时禁用。

- [x] 导入流程增加真正的预校验步骤。
  - 新增 `validateImportDataClient()` 函数，在映射步骤"下一步"时执行客户端校验。
  - 校验项：行数上限 10000、caseNo/名称/resultSummary/logUrl 必填及格式、post-analysis 专有字段。
  - 校验结果展示在 ValidationReport，有错误时阻止导入。

- [x] 增加前端组件/页面测试。
  - 新增 5 个组件测试文件：AuthProvider(5)、CaseTable(5)、Button(4)、FilterBar(3)、MetricCards(1)，共 18 个测试。
  - 使用 `@testing-library/react` + `jest-environment-jsdom`。

- [x] 抽取 DTO 序列化 helper。
  - 已创建 `src/lib/serializers.ts`，`toCaseDTO` 等统一收口。

- [x] 优化统计接口性能。
  - `projects`/`stages`/`batches` GET 和 `trend` API 改用 `groupBy` 聚合查询，消除 N+1。
  - 示例：trend API 从 90 次查询降至 3 次。

- [x] 增加数据库索引。
  - `CaseResult` 模型新增 6 个组合索引：`[projectId, resultSummary]`、`[testStageId, resultSummary]`、`[batchScopeId, resultSummary]`、`[batchScopeId, progressCategory]`、`[projectId, progressCategory]`、`[assetSaved]`。

- [x] 统一前端数据请求错误处理。
  - 已创建 `src/lib/fetch.ts`，封装 `ApiError` + `fetchJson`，统一 401 处理和错误 toast。

- [x] 补充 `.env.example`。
  - 已添加，包含 `DATABASE_URL`、`JWT_SECRET` 示例。

- [x] 清理默认 Next.js public 资源。
  - 已删除 `public/next.svg`、`vercel.svg` 等未使用的默认资源。

## 建议执行顺序 ✅ 全部完成

1. ~~修复 `npm run lint`，让开发反馈链路完整。~~ ✅
2. ~~统一进展分类枚举，修复 seed 与前端 Badge 显示。~~ ✅
3. ~~修复导入页 `useState` 副作用和分析后导入 update/upsert 语义。~~ ✅
4. ~~补齐 API 入参校验、错误响应 helper、去除生产代码 `any`。~~ ✅
5. ~~让工作台统计跟随筛选，并完成详情跳转/排序。~~ ✅
6. ~~增加前端关键路径测试，再做性能索引和体验增强。~~ ✅

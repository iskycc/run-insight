import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL || "mysql://root:root123@127.0.0.1:3306/run_insight");
const adapter = new PrismaMariaDb({
  host: url.hostname || "127.0.0.1",
  port: Number(url.port) || 3306,
  user: url.username || "root",
  password: url.password,
  database: url.pathname.slice(1),
});
const prisma = new PrismaClient({ adapter });

// ── Case templates per project ──────────────────────────────────────

function caseNo(projectIdx: number, stageIdx: number, batchIdx: number, caseIdx: number) {
  return `P${projectIdx + 1}-S${stageIdx + 1}-B${batchIdx + 1}-${String(caseIdx + 1).padStart(3, "0")}`;
}

// ── Project / Stage / Batch definitions ─────────────────────────────
const PROJECTS = [
  { name: "支付系统", stages: ["SIT-1", "SIT-2"], batches: [["Batch-20260701", "Batch-20260715"], ["Batch-20260720", "Batch-20260801"]] },
  { name: "交易引擎", stages: ["SIT-1", "UAT-1"], batches: [["Batch-20260705", "Batch-20260710"], ["Batch-20260718", "Batch-20260725"]] },
  { name: "风控平台", stages: ["SIT-1", "SIT-2"], batches: [["Batch-20260708", "Batch-20260712"], ["Batch-20260722", "Batch-20260803"]] },
] as const;

// ── Case templates per project ──────────────────────────────────────
interface CaseTpl {
  name: string;
  resultSummary: string;
  progressCategory?: string;
  rootCause?: string;
  assignee?: string;
  mrOrTicket?: string;
  logUrl?: string;
  assetSaved?: boolean;
}

const CASE_TEMPLATES: CaseTpl[][] = [
  // ── 支付系统 (16 cases) ──
  [
    { name: "微信支付-正常下单", resultSummary: "PASS" },
    { name: "微信支付-超时退款", resultSummary: "FAIL", progressCategory: "LOCATED", rootCause: "退款回调未触发", assignee: "张三", mrOrTicket: "MR-1021" },
    { name: "支付宝-扫码支付", resultSummary: "PASS" },
    { name: "支付宝-重复扣款", resultSummary: "FAIL", progressCategory: "FIXED", rootCause: "幂等校验缺失", assignee: "李四", mrOrTicket: "MR-1022" },
    { name: "银行卡-快捷支付绑卡", resultSummary: "PASS" },
    { name: "银行卡-解绑后支付", resultSummary: "FAIL", progressCategory: "ANALYZING", assignee: "王五" },
    { name: "银联-条码支付", resultSummary: "PASS" },
    { name: "银联-大额交易风控拦截", resultSummary: "BLOCK", progressCategory: "BLOCKED", rootCause: "风控规则联调阻塞", assignee: "赵六" },
    { name: "余额支付-扣减逻辑", resultSummary: "PASS" },
    { name: "余额支付-余额不足提示", resultSummary: "PASS" },
    { name: "组合支付-余额+微信", resultSummary: "FAIL", progressCategory: "NOT_ISSUE", rootCause: "事务未合并提交", assignee: "孙七", mrOrTicket: "MR-1023" },
    { name: "组合支付-余额+支付宝", resultSummary: "PASS" },
    { name: "退款-全额退款", resultSummary: "PASS" },
    { name: "退款-部分退款", resultSummary: "FAIL", progressCategory: "LOCATED", rootCause: "金额精度丢失", assignee: "周八", mrOrTicket: "MR-1024" },
    { name: "对账-日终对账文件生成", resultSummary: "PASS" },
    { name: "对账-差错账处理", resultSummary: "FAIL", progressCategory: "ANALYZING", assignee: "吴九" },
  ],
  // ── 交易引擎 (18 cases) ──
  [
    { name: "股票买入-限价委托", resultSummary: "PASS" },
    { name: "股票买入-市价委托", resultSummary: "PASS" },
    { name: "股票卖出-限价委托", resultSummary: "FAIL", progressCategory: "FIXED", rootCause: "委托状态流转异常", assignee: "张三", mrOrTicket: "MR-2001" },
    { name: "股票卖出-市价委托", resultSummary: "PASS" },
    { name: "撤单-正常撤单", resultSummary: "PASS" },
    { name: "撤单-部分成交后撤单", resultSummary: "FAIL", progressCategory: "LOCATED", rootCause: "成交数量与委托数量不一致", assignee: "李四", mrOrTicket: "MR-2002" },
    { name: "基金申购-普通基金", resultSummary: "PASS" },
    { name: "基金申购-QDII基金", resultSummary: "BLOCK", progressCategory: "BLOCKED", rootCause: "境外通道联调未就绪", assignee: "王五" },
    { name: "基金赎回-T+1到账", resultSummary: "PASS" },
    { name: "基金赎回-巨额赎回", resultSummary: "FAIL", progressCategory: "ANALYZING", assignee: "赵六" },
    { name: "债券买入-国债", resultSummary: "PASS" },
    { name: "债券买入-企业债", resultSummary: "PASS" },
    { name: "期权开仓-认购期权", resultSummary: "FAIL", progressCategory: "FIXED", rootCause: "保证金计算错误", assignee: "孙七", mrOrTicket: "MR-2003" },
    { name: "期权开仓-认沽期权", resultSummary: "PASS" },
    { name: "期权平仓-提前行权", resultSummary: "FAIL", progressCategory: "LOCATED", rootCause: "行权日期判断逻辑有误", assignee: "周八", mrOrTicket: "MR-2004" },
    { name: "盘后定价-科创板", resultSummary: "PASS" },
    { name: "融资融券-融资买入", resultSummary: "FAIL", progressCategory: "ANALYZING", assignee: "吴九" },
    { name: "融资融券-融券卖出", resultSummary: "PASS" },
  ],
  // ── 风控平台 (14 cases) ──
  [
    { name: "规则引擎-黑名单命中", resultSummary: "PASS" },
    { name: "规则引擎-白名单放行", resultSummary: "PASS" },
    { name: "规则引擎-灰名单审核", resultSummary: "FAIL", progressCategory: "LOCATED", rootCause: "审核流回调超时", assignee: "张三", mrOrTicket: "MR-3001" },
    { name: "实时风控-高频交易拦截", resultSummary: "PASS" },
    { name: "实时风控-异常IP登录拦截", resultSummary: "FAIL", progressCategory: "FIXED", rootCause: "IP地理位置库未更新", assignee: "李四", mrOrTicket: "MR-3002" },
    { name: "实时风控-大额转账审核", resultSummary: "PASS" },
    { name: "模型评分-欺诈模型V2", resultSummary: "FAIL", progressCategory: "ANALYZING", assignee: "王五" },
    { name: "模型评分-信用评分模型", resultSummary: "PASS" },
    { name: "预警管理-预警规则配置", resultSummary: "PASS" },
    { name: "预警管理-预警通知推送", resultSummary: "BLOCK", progressCategory: "BLOCKED", rootCause: "短信通道升级中", assignee: "赵六" },
    { name: "案件管理-案件创建", resultSummary: "PASS" },
    { name: "案件管理-案件分配", resultSummary: "FAIL", progressCategory: "NOT_ISSUE", rootCause: "分配算法溢出", assignee: "孙七", mrOrTicket: "MR-3003" },
    { name: "报表-风控日报生成", resultSummary: "PASS" },
    { name: "报表-误判率统计", resultSummary: "FAIL", progressCategory: "LOCATED", rootCause: "统计口径不一致", assignee: "周八", mrOrTicket: "MR-3004" },
  ],
];

async function main() {
  console.log("🌱 Seeding enriched data ...\n");

  // ── 1. Admin user ────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", password: hashedPassword },
  });
  console.log(`✅ User: ${admin.username}`);

  // ── 2. Projects → Stages → Batches → Cases ──────────────────────
  // Use deleteMany in reverse dependency order to allow re-seeding
  await prisma.caseResult.deleteMany();
  await prisma.batchScope.deleteMany();
  await prisma.testStage.deleteMany();
  await prisma.project.deleteMany();
  console.log("🧹 Cleared existing data\n");

  let totalCases = 0;

  for (let pi = 0; pi < PROJECTS.length; pi++) {
    const projDef = PROJECTS[pi];
    const project = await prisma.project.create({ data: { name: projDef.name } });
    console.log(`📦 Project: ${project.name}`);

    for (let si = 0; si < projDef.stages.length; si++) {
      const stageName = projDef.stages[si];
      const stage = await prisma.testStage.create({
        data: { name: stageName, projectId: project.id },
      });
      console.log(`  ├── Stage: ${stage.name}`);

      for (let bi = 0; bi < projDef.batches[si].length; bi++) {
        const batchName = projDef.batches[si][bi];
        const batch = await prisma.batchScope.create({
          data: { name: batchName, projectId: project.id, testStageId: stage.id },
        });
        console.log(`  │   ├── Batch: ${batch.name}`);

        // Build case data for this batch
        const tplSet = CASE_TEMPLATES[pi];
        const caseData = tplSet.map((tpl, ci) => ({
          caseNo: caseNo(pi, si, bi, ci),
          name: tpl.name,
          resultSummary: tpl.resultSummary,
          projectId: project.id,
          testStageId: stage.id,
          batchScopeId: batch.id,
          ...(tpl.progressCategory ? { progressCategory: tpl.progressCategory } : {}),
          ...(tpl.rootCause ? { rootCause: tpl.rootCause } : {}),
          ...(tpl.assignee ? { assignee: tpl.assignee } : {}),
          ...(tpl.mrOrTicket ? { mrOrTicket: tpl.mrOrTicket } : {}),
          ...(tpl.logUrl ? { logUrl: tpl.logUrl } : {}),
          ...(tpl.assetSaved ? { assetSaved: tpl.assetSaved } : {}),
        }));

        const result = await prisma.caseResult.createMany({ data: caseData });
        totalCases += result.count;
        console.log(`  │   │   └── ${result.count} cases`);
      }
    }
  }

  console.log(`\n✅ Seeding complete: ${PROJECTS.length} projects, ${totalCases} total cases`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

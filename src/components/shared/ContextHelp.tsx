'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Lightbulb, Question, X } from '@phosphor-icons/react';

type HelpContent = {
  title: string;
  description: string;
  steps: string[];
};

const HELP_ROUTES: Array<{
  matches: (pathname: string) => boolean;
  content: HelpContent;
}> = [
  {
    matches: (pathname) => /^\/case\/[^/]+$/.test(pathname),
    content: {
      title: '用例详情',
      description: '在这里完成单条用例的定位、协作与状态维护。',
      steps: ['先核对结果与日志', '更新责任人、进展和根因', '通过评论记录处理过程'],
    },
  },
  {
    matches: (pathname) => /^\/import-history\/[^/]+$/.test(pathname),
    content: {
      title: '导入任务详情',
      description: '查看一次导入的执行结果和异常明细。',
      steps: ['确认处理与失败行数', '定位错误字段及原因', '修正源文件后重新导入'],
    },
  },
  {
    matches: (pathname) => /^\/reports\/snapshots\/[^/]+$/.test(pathname),
    content: {
      title: '报告快照',
      description: '快照保留生成时的数据状态，适合复盘和分享。',
      steps: ['核对快照生成时间', '查看固定指标与趋势', '按需导出或分享结果'],
    },
  },
  {
    matches: (pathname) => /^\/projects\/[^/]+\/members$/.test(pathname),
    content: {
      title: '项目成员',
      description: '管理项目参与者及其在当前项目中的权限。',
      steps: ['搜索并添加成员', '按职责调整角色', '及时移除不再参与的成员'],
    },
  },
  {
    matches: (pathname) => /^\/projects\/[^/]+\/root-causes$/.test(pathname),
    content: {
      title: '项目根因',
      description: '维护当前项目专用的根因分类。',
      steps: ['新增符合项目语境的分类', '保持命名清晰且互斥', '在用例分析时直接选用'],
    },
  },
  {
    matches: (pathname) => /^\/projects\/[^/]+\/settings$/.test(pathname),
    content: {
      title: '项目设置',
      description: '配置项目名称、说明及其他基础信息。',
      steps: ['检查当前配置', '修改后保存并确认提示', '谨慎执行影响范围较大的操作'],
    },
  },
  {
    matches: (pathname) => /^\/projects\/[^/]+$/.test(pathname),
    content: {
      title: '项目概览',
      description: '从项目维度查看阶段、批跑与质量概况。',
      steps: ['先选择测试阶段', '进入对应批跑查看用例', '使用成员和设置入口维护项目'],
    },
  },
  {
    matches: (pathname) => pathname === '/login',
    content: {
      title: '登录系统',
      description: '使用本地账号或已配置的 LDAP 账号进入系统。',
      steps: ['输入用户名和密码', 'LDAP 用户首次登录会自动创建', '登录失败时联系管理员检查账号或 LDAP'],
    },
  },
  {
    matches: (pathname) => pathname === '/setup',
    content: {
      title: '初始化系统',
      description: '首次运行时创建超级管理员，完成后即可进入后台。',
      steps: ['设置管理员用户名', '使用高强度密码', '妥善保存登录凭据'],
    },
  },
  {
    matches: (pathname) => pathname === '/',
    content: {
      title: '质量大盘',
      description: '快速了解当前数据范围内的整体质量状态。',
      steps: ['先使用筛选器缩小范围', '结合分布图与趋势图发现异常', '点击指标进入具体数据继续分析'],
    },
  },
  {
    matches: (pathname) => pathname === '/workspace',
    content: {
      title: '分析工作台',
      description: '集中筛选、查看和处理需要关注的用例。',
      steps: ['选择项目、阶段和批跑', '通过筛选器定位目标用例', '进入详情更新分析结果'],
    },
  },
  {
    matches: (pathname) => pathname === '/my-tasks',
    content: {
      title: '我的任务',
      description: '查看分配给你的待处理、临期和逾期事项。',
      steps: ['优先处理逾期与高优先级任务', '打开用例补充分析信息', '完成后及时更新进展状态'],
    },
  },
  {
    matches: (pathname) => pathname === '/projects',
    content: {
      title: '项目管理',
      description: '创建项目并进入项目维护测试范围。',
      steps: ['搜索或新建项目', '进入项目创建阶段与批跑', '按需配置成员和根因'],
    },
  },
  {
    matches: (pathname) => pathname === '/compare',
    content: {
      title: '批次对比',
      description: '比较两个批跑之间的结果变化。',
      steps: ['选择基准批次和对比批次', '关注新增失败与状态变化', '打开差异用例进一步定位'],
    },
  },
  {
    matches: (pathname) => pathname === '/assets',
    content: {
      title: '用例资产',
      description: '沉淀可复用的测试用例资产并维护发布状态。',
      steps: ['使用搜索和状态筛选定位资产', '创建或编辑资产内容', '评审通过后再发布'],
    },
  },
  {
    matches: (pathname) => pathname === '/import',
    content: {
      title: '数据导入',
      description: '按向导把 JSON 或 Excel 用例数据安全导入指定批跑。',
      steps: ['选择导入类型与文件格式并下载模板', '上传后核对字段映射', '先预览差异，再确认正式导入'],
    },
  },
  {
    matches: (pathname) => pathname === '/import-history',
    content: {
      title: '导入历史',
      description: '追踪过去的导入任务及其执行结果。',
      steps: ['按状态或时间定位任务', '打开详情检查失败原因', '必要时修正数据后重试'],
    },
  },
  {
    matches: (pathname) => pathname === '/admin/users',
    content: {
      title: '用户管理',
      description: '管理本地用户、LDAP 用户及其系统角色。',
      steps: ['搜索目标用户', '调整角色或账号状态', '超级管理员可在此修改自己的用户名'],
    },
  },
  {
    matches: (pathname) => pathname === '/admin/ldap',
    content: {
      title: 'LDAP 配置',
      description: '配置、测试并启用企业目录登录。',
      steps: ['填写服务器、绑定账号和用户查询规则', '先测试连接与用户认证', '确认成功后再启用 LDAP 登录'],
    },
  },
  {
    matches: (pathname) => pathname === '/admin/audit-logs',
    content: {
      title: '审计日志',
      description: '查询重要操作记录，辅助追踪变更来源。',
      steps: ['按操作者、动作或时间筛选', '展开记录核对变更内容', '结合目标对象定位异常操作'],
    },
  },
  {
    matches: (pathname) => pathname === '/admin/root-causes',
    content: {
      title: '全局根因',
      description: '维护所有项目都可使用的公共根因分类。',
      steps: ['优先复用已有分类', '新增时避免语义重复', '停用前确认历史数据影响'],
    },
  },
  {
    matches: (pathname) => pathname === '/organizations/settings',
    content: {
      title: '组织设置',
      description: '统一管理组织信息、成员与平台级配置。',
      steps: ['通过页内标签切换配置域', '修改成员前确认组织角色', '保存后检查成功反馈'],
    },
  },
  {
    matches: (pathname) => pathname === '/reports/assignee',
    content: {
      title: '责任人报告',
      description: '从责任人维度查看任务分布和处理进度。',
      steps: ['选择统计范围', '关注积压与逾期人员', '进入对应任务推动处理'],
    },
  },
  {
    matches: (pathname) => pathname === '/reports/scheduled',
    content: {
      title: '定时报告',
      description: '配置自动生成报告的周期和内容。',
      steps: ['创建报告并选择统计范围', '设置执行周期', '检查最近运行结果与快照'],
    },
  },
];

const FALLBACK_HELP: HelpContent = {
  title: '页面使用帮助',
  description: '从页面标题和主要操作开始，按当前数据范围逐步完成任务。',
  steps: ['先确认当前页面与数据范围', '使用筛选器缩小目标', '提交前检查输入与影响范围'],
};

export function getHelpContent(pathname: string): HelpContent {
  return HELP_ROUTES.find((route) => route.matches(pathname))?.content ?? FALLBACK_HELP;
}

export function ContextHelp() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const content = getHelpContent(pathname);
  const open = openPath === pathname;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPath(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpenPath(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="context-help-title"
          className="help-panel mb-3 w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-[22px] border border-white/80 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]"
        >
          <div className="flex items-start justify-between gap-4 bg-[linear-gradient(135deg,rgba(17,96,242,0.10),rgba(255,255,255,0.92))] px-5 py-4">
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-[0_8px_20px_rgba(17,96,242,0.22)]">
                <Lightbulb size={19} weight="fill" aria-hidden="true" />
              </span>
              <div>
                <h2 id="context-help-title" className="font-semibold text-text-primary">
                  {content.title}
                </h2>
                <p className="mt-1 text-xs leading-5 text-text-secondary">{content.description}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpenPath(null)}
              aria-label="关闭使用帮助"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition hover:bg-white hover:text-text-primary"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <ol className="space-y-3 px-5 py-4">
            {content.steps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-5 text-text-secondary">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/8 text-[11px] font-bold text-accent">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpenPath(open ? null : pathname)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="ml-auto flex h-11 items-center gap-2 rounded-full border border-white/80 bg-text-primary px-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(15,23,42,0.20)] transition hover:-translate-y-0.5 hover:bg-accent focus:outline-none focus:ring-4 focus:ring-accent/20"
      >
        <Question size={18} weight="bold" aria-hidden="true" />
        使用帮助
      </button>
    </div>
  );
}

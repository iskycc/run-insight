import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const sourceRoots = [
  "src/app",
  "src/components",
  "src/contexts",
  "public",
];
const standaloneFiles = ["next.config.ts", "next.config.mjs", "next.config.js"];
const sourceExtensions = new Set([
  ".css",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

const forbiddenPatterns = [
  {
    label: "远程字体提供方",
    pattern: /next\/font\/(?:google|adobe)/g,
  },
  {
    label: "远程 CSS @import",
    pattern: /@import\s+(?:url\(\s*)?["']?https?:\/\//gi,
  },
  {
    label: "远程 CSS url() 资源",
    pattern: /url\(\s*["']?https?:\/\//gi,
  },
  {
    label: "远程媒体、脚本或内嵌页面",
    pattern:
      /<(?:audio|embed|iframe|img|script|source|track|video)\b[^>]*\bsrc\s*=\s*["']https?:\/\//gi,
  },
  {
    label: "远程样式表或预加载资源",
    pattern: /<link\b[^>]*\bhref\s*=\s*["']https?:\/\//gi,
  },
  {
    label: "硬编码外部页面链接",
    pattern: /<(?:a|form)\b[^>]*\b(?:action|href)\s*=\s*["']https?:\/\//gi,
  },
  {
    label: "Next.js 远程图片配置",
    pattern: /\bremotePatterns\s*:/g,
  },
];

async function collectSourceFiles(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  let entryStat;
  try {
    entryStat = await stat(absolutePath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  if (entryStat.isFile()) {
    return sourceExtensions.has(path.extname(relativePath))
      ? [relativePath]
      : [];
  }

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) =>
        collectSourceFiles(path.join(relativePath, entry.name)),
      ),
  );
  return nested.flat();
}

const files = [
  ...(await Promise.all(sourceRoots.map(collectSourceFiles))).flat(),
  ...(await Promise.all(standaloneFiles.map(collectSourceFiles))).flat(),
].sort();

const violations = [];
for (const relativePath of files) {
  const content = await readFile(path.join(projectRoot, relativePath), "utf8");
  for (const { label, pattern } of forbiddenPatterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split("\n").length;
      violations.push(`${relativePath}:${line} ${label}: ${match[0]}`);
    }
  }
}

if (violations.length > 0) {
  console.error("发现会破坏离线页面访问的远程静态资源：");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `离线资源检查通过：${files.length} 个前端源文件未引用远程字体、样式、脚本、图片、媒体或硬编码外部页面。`,
  );
}

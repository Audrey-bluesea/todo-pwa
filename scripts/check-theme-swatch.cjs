/**
 * 构建门禁：外观面板色卡(themeMeta.ts 的 swatch) 必须与该主题的真实 CSS 色值一致。
 *
 * 背景：2026-11-12 排查发现「初雪」色卡 4 个值全是过时配色，与 [data-theme='winter']
 * 里的 CSS 变量无一相符，用户在面板看到的预览色跟实际主题根本不是一套。
 * 另外 7 套主题的 accent 色虽对齐 CSS，但过去只画在外观面板标题的 10px 小方块上，
 * 日常界面看不到 —— 现已统一由 FAB 柔光晕承接（见 index.css 的 .fab 规则）。
 *
 * 校验两项：
 *  ① 每个 swatch hex 都能在该主题的 :root / [data-theme] 块中找到同值 CSS 变量
 *  ② THEME_META 的 key 集合与 uiStore.ts 的 VALID_THEMES 完全一致
 * 违规 exit 1 阻断部署。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const css = read('src/index.css');
const meta = read('src/lib/themeMeta.ts');
const uiStore = read('src/store/uiStore.ts');

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',');
}

function parseColorSet(body) {
  const set = new Set();
  const re = /--c-[\w-]+:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body))) {
    const v = m[1].trim();
    const hex = v.match(/^#([0-9a-fA-F]{6})$/);
    if (hex) {
      set.add(hexToRgb('#' + hex[1]));
      continue;
    }
    const rgb = v.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/);
    if (rgb) set.add([+rgb[1], +rgb[2], +rgb[3]].join(','));
  }
  return set;
}

// 主题定义块：matcha 在 :root，其余在 [data-theme='xxx']
const blocks = {};
const rootM = css.match(/:root\s*\{([\s\S]*?)\n  \}/);
if (rootM) blocks.matcha = parseColorSet(rootM[1]);
const blockRe = /\[data-theme='(\w+)'\]\s*\{([\s\S]*?)\n  \}/g;
let bm;
while ((bm = blockRe.exec(css))) blocks[bm[1]] = parseColorSet(bm[2]);

// THEME_META 条目
const entries = [];
const entryRe = /key:\s*'(\w+)',[\s\S]*?swatch:\s*\[([^\]]+)\]/g;
let em;
while ((em = entryRe.exec(meta))) {
  const swatch = [...em[2].matchAll(/'(#[0-9a-fA-F]{6})'/g)].map((x) => x[1]);
  entries.push({ key: em[1], swatch });
}

const problems = [];
if (!entries.length) problems.push('未能从 lib/themeMeta.ts 解析到任何 THEME_META 条目');

for (const { key, swatch } of entries) {
  const allowed = blocks[key];
  if (!allowed) {
    problems.push(`主题 ${key}：index.css 里找不到对应的 [data-theme] 色值块`);
    continue;
  }
  if (!swatch.length) problems.push(`主题 ${key}：色卡为空`);
  for (const hex of swatch) {
    if (!allowed.has(hexToRgb(hex))) {
      problems.push(`主题 ${key}：色卡 ${hex} 不在该主题的真实 CSS 色值里（色卡与主题脱节）`);
    }
  }
}

const vm = uiStore.match(/const VALID_THEMES[^=]*=\s*\[([\s\S]*?)\];/);
if (!vm) {
  problems.push('未能从 store/uiStore.ts 解析 VALID_THEMES');
} else {
  const valid = [...vm[1].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
  const declared = entries.map((e) => e.key).sort();
  if (JSON.stringify(valid) !== JSON.stringify(declared)) {
    problems.push(`主题 key 不一致：VALID_THEMES=[${valid}] vs THEME_META=[${declared}]`);
  }
}

if (problems.length) {
  console.error('[check-theme] 色卡校验失败：');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
const total = entries.reduce((n, e) => n + e.swatch.length, 0);
console.log(`[check-theme] OK：${entries.length} 套主题 / ${total} 个色卡值全部对齐真实 CSS，key 与 VALID_THEMES 一致`);

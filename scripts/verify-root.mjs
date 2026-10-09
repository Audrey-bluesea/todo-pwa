/**
 * 验证：根容器由 fixed inset-0 改为文档流 relative 后，
 * 布局链路（高度 / TabBar / FAB / 顶部图层）是否全部保持正确。
 *
 * 真机尺寸：iPhone 18 Pro Max 440x956@3x（standalone 注入）
 */
import { webkit } from '/Users/leeshukyuen/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';

const URL = 'http://127.0.0.1:8133/';
const VW = 440, VH = 956, DSF = 3;

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ✗ ' + m); };

const browser = await webkit.launch();
const ctx = await browser.newContext({
  viewport: { width: VW, height: VH },
  deviceScaleFactor: DSF,
  userAgent: UA,
  isMobile: true,
  hasTouch: true,
});
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true });
});

const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });

// ---- 前置：确认服务的是目标 App（防串项目） ----
const title = await page.title();
console.log('\n===== 0. 环境自检 =====');
console.log('  title =', JSON.stringify(title));
if (/Cogito/i.test(title)) throw new Error('服务的是 Cogito，不是行时录 —— 停止验证');
if (!title.includes('行时录')) bad(`标题异常：${title}`);
else ok('服务的是「行时录」');

// ---- 1. 根容器定位方式 ----
console.log('\n===== 1. 根容器（本次改动的核心） =====');
const rootInfo = await page.evaluate(() => {
  const el = document.getElementById('app-root');
  const root = document.getElementById('root');
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    position: cs.position,
    inset: cs.inset,
    display: cs.display,
    rect: { top: r.top, bottom: r.bottom, height: r.height, width: r.width },
    rootH: root.getBoundingClientRect().height,
    rootOverflow: getComputedStyle(root).overflow,
    htmlClass: document.documentElement.className,
    vpGap: getComputedStyle(document.documentElement).getPropertyValue('--vp-gap'),
  };
});
console.log('  ', JSON.stringify(rootInfo));
rootInfo.position === 'relative'
  ? ok('根容器 position = relative（不再是 fixed ⇒ 不再被系统当固定导航栏模糊）')
  : bad(`根容器 position = ${rootInfo.position}，期望 relative`);
rootInfo.htmlClass.includes('ios-pwa')
  ? ok('html.ios-pwa 判定生效')
  : bad(`html class 未含 ios-pwa：${rootInfo.htmlClass}`);
Math.abs(rootInfo.rect.height - VH) <= 0.5
  ? ok(`根容器高度 = ${rootInfo.rect.height}（= 视口 ${VH}）`)
  : bad(`根容器高度 = ${rootInfo.rect.height}，期望 ${VH}`);
Math.abs(rootInfo.rect.top) <= 0.5
  ? ok('根容器顶边贴合 y=0')
  : bad(`根容器顶边 = ${rootInfo.rect.top}`);
Math.abs(rootInfo.rect.bottom - VH) <= 0.5
  ? ok(`根容器底边 = ${rootInfo.rect.bottom}（贴物理屏底，无上飘/溢出）`)
  : bad(`根容器底边 = ${rootInfo.rect.bottom}，期望 ${VH}`);
Math.abs(rootInfo.rootH - VH) <= 0.5
  ? ok(`#root 高度 = ${rootInfo.rootH}（未被裁切）`)
  : bad(`#root 高度 = ${rootInfo.rootH}，期望 ${VH}`);

// ---- 2. 底部布局链路 ----
console.log('\n===== 2. 底部（TabBar / FAB） =====');
const bottom = await page.evaluate(() => {
  const out = {};
  const bar = document.querySelector('nav[role="tablist"], .tabbar');
  if (bar) {
    const r = bar.getBoundingClientRect();
    const cs = getComputedStyle(bar);
    out.tabbar = { top: r.top, bottom: r.bottom, height: r.height, position: cs.position, pb: cs.paddingBottom };
  }
  const fab = document.querySelector('.fab');
  if (fab) {
    const r = fab.getBoundingClientRect();
    out.fab = { top: r.top, bottom: r.bottom, right: window.innerWidth - r.right, position: getComputedStyle(fab).position };
  }
  out.innerHeight = window.innerHeight;
  out.vvHeight = window.visualViewport?.height;
  return out;
});
console.log('  ', JSON.stringify(bottom));
if (bottom.tabbar) {
  Math.abs(bottom.tabbar.bottom - VH) <= 1
    ? ok(`TabBar 底边 = ${bottom.tabbar.bottom}（贴物理屏底 956）`)
    : bad(`TabBar 底边 = ${bottom.tabbar.bottom}，期望 ≈${VH}（上飘/露白）`);
  bottom.tabbar.position === 'static' || bottom.tabbar.position === 'relative'
    ? ok(`TabBar 为文档流元素（position: ${bottom.tabbar.position}），未踩 fixed 铁律`)
    : bad(`TabBar position = ${bottom.tabbar.position}`);
}
if (bottom.fab) {
  bottom.fab.position === 'absolute'
    ? ok('FAB 为 absolute（锚 #app-root）')
    : bad(`FAB position = ${bottom.fab.position}`);
  bottom.fab.bottom < VH && bottom.fab.bottom > VH - 200
    ? ok(`FAB 底边 = ${bottom.fab.bottom}（在屏内合理位置）`)
    : bad(`FAB 底边 = ${bottom.fab.bottom} 异常`);
}

// ---- 3. 顶部取样条 + 图层审计 ----
console.log('\n===== 3. 顶部取样条 / 图层 =====');
const top = await page.evaluate(() => {
  const el = document.querySelector('.top-tint');
  const bg = getComputedStyle(document.getElementById('app-root')).backgroundColor;
  const r = el?.getBoundingClientRect();
  const cs = el ? getComputedStyle(el) : null;
  return {
    exists: !!el,
    display: cs?.display,
    position: cs?.position,
    top: r?.top,
    height: r?.height,
    width: r?.width,
    bg: cs?.backgroundColor,
    pointerEvents: cs?.pointerEvents,
    zIndex: cs?.zIndex,
    appBg: bg,
  };
});
console.log('  ', JSON.stringify(top));
top.exists ? ok('.top-tint 元素存在于 DOM') : bad('.top-tint 缺失');
top.display !== 'none' ? ok(`.top-tint 可见（display: ${top.display}）`) : bad('.top-tint 被 display:none 隐藏');
top.position === 'fixed' && Math.abs(top.top) < 0.5 && top.height >= 3
  ? ok(`取样条满足系统取色条件（fixed / top=0 / 高 ${top.height}px ≥3 / 宽 ${top.width}）`)
  : bad(`取样条不满足取色条件: ${JSON.stringify(top)}`);
top.bg === top.appBg
  ? ok(`取样条颜色 = 页面背景色（${top.bg}）`)
  : bad(`取样条颜色 ${top.bg} ≠ 页面背景色 ${top.appBg}`);

// 顶部整宽异色浮层审计
const strays = await page.evaluate(() => {
  const el = document.getElementById('app-root');
  const A = getComputedStyle(el).backgroundColor;
  const alphaZero = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const p = m[1].split(/[,\s/]+/).filter(Boolean);
    return p.length >= 4 && parseFloat(p[3]) === 0;
  };
  const out = [];
  for (const node of document.querySelectorAll('body *')) {
    const s = getComputedStyle(node);
    const rc = node.getBoundingClientRect();
    if (rc.top > 120 || rc.width < window.innerWidth * 0.8 || rc.height < 1) continue;
    const bg = s.backgroundColor;
    if (alphaZero(bg) && s.backgroundImage === 'none') continue;
    if (node.classList.contains('top-tint')) continue;
    if (bg === A && s.backgroundImage === 'none') continue;
    out.push({ cls: node.className?.toString?.().slice(0, 70), tag: node.tagName, bg, gi: s.backgroundImage.slice(0, 40), top: Math.round(rc.top) });
  }
  return out;
});
strays.length === 0
  ? ok('顶部 0~120pt 无「整宽异色图层」')
  : bad(`顶部存在异色图层：${JSON.stringify(strays.slice(0, 3))}`);

// ---- 4. 首行墨迹位置 ----
const firstInk = await page.evaluate(() => {
  const root = document.getElementById('app-root');
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let best = null;
  let n;
  while ((n = walk.nextNode())) {
    const t = n.textContent.trim();
    if (!t) continue;
    const rg = document.createRange();
    rg.selectNodeContents(n);
    const r = rg.getBoundingClientRect();
    if (r.height === 0) continue;
    if (best === null || r.top < best.top) best = { top: r.top, text: t.slice(0, 14) };
  }
  return best;
});
firstInk
  ? ok(`首行墨迹 top = ${firstInk.top.toFixed(1)}pt（「${firstInk.text}」）`)
  : bad('未找到首行文字');

// ---- 5. 各页面巡检 ----
async function probe(name) {
  const r = await page.evaluate(() => {
    const el = document.getElementById('app-root');
    const rr = el.getBoundingClientRect();
    const bar = document.querySelector('nav[role="tablist"], .tabbar');
    return {
      h: rr.height, top: rr.top, bottom: rr.bottom,
      tabbarBottom: bar ? bar.getBoundingClientRect().bottom : null,
      scrollX: document.documentElement.scrollWidth > window.innerWidth,
      scrollY: document.documentElement.scrollHeight > window.innerHeight,
    };
  });
  const good =
    Math.abs(r.h - VH) <= 1 && Math.abs(r.bottom - VH) <= 1 && !r.scrollX && !r.scrollY;
  good ? ok(`${name}：高度 ${r.h} / 底边 ${r.bottom} / 无页面级溢出`) : bad(`${name}：${JSON.stringify(r)}`);
}

console.log('\n===== 4. 各页面布局巡检 =====');
await probe('待办页');

// 日历页
const calBtn = await page.$('[aria-label="日历"]');
if (calBtn) {
  await calBtn.click();
  await page.waitForTimeout(700);
  await probe('日历页');
  await page.screenshot({ path: '/tmp/root-verify/after-cal.png' });
} else {
  console.log('  (未找到日历入口，跳过)');
}

// 抽屉
await page.keyboard.press('Escape').catch(() => {});
const menu = await page.$('[aria-label="打开菜单"]');
if (menu) {
  await menu.click();
  await page.waitForTimeout(700);
  const d = await page.evaluate(() => {
    const el = document.getElementById('app-root');
    return { h: el.getBoundingClientRect().height, drawerOpen: !!document.querySelector('[role="dialog"], .drawer, [class*="drawer"]') };
  });
  Math.abs(d.h - VH) <= 1 ? ok(`抽屉打开：根容器仍 ${d.h}`) : bad(`抽屉打开：根容器 ${d.h}`);
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(220, 900).catch(() => {});
  await page.waitForTimeout(500);
}

// ---- 6. 主题回归 ----
console.log('\n===== 5. 主题回归（--bg-top 跟随） =====');
const themes = ['matcha', 'pixel', 'spring', 'summer', 'autumn', 'winter', 'blossom', 'unicorn'];
const themeRes = await page.evaluate((list) => {
  const out = [];
  const root = document.documentElement;
  const prev = root.getAttribute('data-theme');
  for (const t of list) {
    root.setAttribute('data-theme', t);
    const appbg = getComputedStyle(root).getPropertyValue('--c-appbg').trim();
    const bgTop = getComputedStyle(root).getPropertyValue('--bg-top').trim();
    out.push({ t, appbg, bgTop, same: bgTop === appbg });
  }
  root.setAttribute('data-theme', prev || 'matcha');
  return out;
}, themes);
const badThemes = themeRes.filter((r) => !r.same);
badThemes.length === 0
  ? ok(`8 个主题 --bg-top 全部跟随背景色`)
  : bad(`主题异常：${JSON.stringify(badThemes)}`);

// ---- 7. 控制台 ----
console.log('\n===== 6. 控制台 =====');
errors.length === 0 ? ok('0 控制台报错') : bad(`控制台报错 ${errors.length} 条：${errors.slice(0, 3).join(' | ')}`);

// 截图
await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'matcha');
});
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/root-verify/after-todo.png' });

console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);

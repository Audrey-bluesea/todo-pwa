/* 顶部「与背景融合 + 不糊字」验证 v3：iPhone 18 Pro Max 440x956@3x，standalone 模拟
   核心断言（对应 Cogito 那条已验证可用的写法）：
     ① header 完全透明、无 backdrop-filter（不铺任何色块）
     ② 顶端取样条是真实元素 .top-tint，12px / z-index 9999 / 颜色 = 页面背景
     ③ html / body 底色 = --bg-top = --c-appbg
     ④ 首行墨迹落点 ≈ 62(--sat) + 6(--tg) + 15 ≈ 83pt */
import { webkit } from '/Users/leeshukyuen/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8131/';
const OUT = '/tmp/top-verify3';
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const ok = (m) => console.log('  \u2713 ' + m);
const bad = (m) => { console.log('  \u2717 ' + m); problems.push(m); };
const rgbTriple = (t) => {
  const m = String(t).match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return m ? m.slice(1, 4).join(',') : null;
};

const probe = (page) =>
  page.evaluate(() => {
    const root = document.documentElement;
    const cs = getComputedStyle(root);
    const header = document.querySelector('main header') || document.querySelector('header');
    const hcs = header && getComputedStyle(header);
    const tint = document.querySelector('.top-tint');
    const tcs = tint && getComputedStyle(tint);

    /* 首行「可见墨迹」：取 header 内第一个 svg 图标的真实矩形（不是 44px 热区） */
    let ink = null;
    if (header) {
      const svg = header.querySelector('svg');
      if (svg) {
        const rc = svg.getBoundingClientRect();
        ink = { kind: 'svg', top: +rc.top.toFixed(1), bottom: +rc.bottom.toFixed(1) };
      } else {
        for (const el of header.querySelectorAll('button, h1')) {
          const rc = el.getBoundingClientRect();
          if (rc.width > 4 && rc.height > 4) {
            ink = { kind: el.tagName, top: +rc.top.toFixed(1), bottom: +rc.bottom.toFixed(1) };
            break;
          }
        }
      }
    }
    /* 顶部 0~120pt 内有没有任何「非背景色」的不透明绘制层 */
    const appbg = cs.getPropertyValue('--c-appbg').trim();
    const toTriple = (v) => (String(v).match(/\d+/g) || []).slice(0, 3).join(',');
    const A = toTriple(`rgb(${appbg})`);
    const strays = [];
    for (const node of document.querySelectorAll('body *')) {
      const s = getComputedStyle(node);
      const rc = node.getBoundingClientRect();
      if (rc.top > 120 || rc.height < 20) continue;
      /* 只关心「整宽浮层」：只有这类东西才会被系统当成顶部色块（正常 UI 控件不算） */
      if (rc.width < 340) continue;
      if (s.position !== 'fixed' && s.position !== 'absolute' && s.position !== 'sticky') continue;
      const bg = s.backgroundColor;
      const alpha = (String(bg).match(/rgba?\([^)]*?([\d.]+)\)$/) || [])[1];
      if (bg === 'transparent' || alpha === '0') continue;                 // 完全透明
      if (node.classList.contains('top-tint')) continue;                   // 取样条本身就是背景色
      if (toTriple(bg) === A && s.backgroundImage === 'none') continue;    // 与背景同色，不算
      strays.push({ el: node.tagName + '.' + (node.className || '').toString().trim().split(/\s+/)[0], bg, img: s.backgroundImage.slice(0, 30) });
    }
    return {
      iosClass: root.className.includes('ios-pwa'),
      theme: root.getAttribute('data-theme'),
      sat: cs.getPropertyValue('--sat').trim(),
      tg: cs.getPropertyValue('--tg').trim(),
      bgTop: cs.getPropertyValue('--bg-top').trim(),
      appbg,
      htmlBg: getComputedStyle(root).backgroundColor,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      headerPadTop: hcs ? hcs.paddingTop : null,
      headerBg: hcs ? hcs.backgroundColor : null,
      headerImg: hcs ? hcs.backgroundImage : null,
      headerBd: hcs ? (hcs.backdropFilter || hcs.webkitBackdropFilter || 'none') : null,
      tint: tint ? { display: tcs.display, pos: tcs.position, h: tcs.height, z: tcs.zIndex, bg: tcs.backgroundColor, pe: tcs.pointerEvents } : null,
      ink,
      strays,
    };
  });

const browser = await webkit.launch();
const ctx = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(BASE, { waitUntil: 'networkidle' });
const title = await page.title();
console.log('页面标题:', title);
if (!title.includes('行时录')) { console.error('\u274c 服务目标不是行时录（坑 4），中止'); process.exit(1); }
await page.waitForSelector('nav', { timeout: 15000 });
await page.waitForTimeout(900);

const check = (label, p) => {
  const A = rgbTriple(p.appbg);
  console.log(`\n===== ${label} =====`);
  console.log(`  --sat=${p.sat} --tg=${p.tg} headerPadTop=${p.headerPadTop} headerBg=${p.headerBg} 首行墨迹=${JSON.stringify(p.ink)}`);
  p.iosClass ? ok('iOS standalone 模式（html.ios-pwa）') : bad('未进入 ios-pwa，验证无效');
  p.headerBg === 'rgba(0, 0, 0, 0)' ? ok('header 完全透明（不再铺色块 —— 这是糊字的元凶）') : bad(`header 仍有底色 ${p.headerBg}`);
  (p.headerImg === 'none') ? ok('header 无背景图/渐变') : bad(`header 有背景图 ${p.headerImg}`);
  (String(p.headerBd) === 'none') ? ok('header 无 backdrop-filter') : bad(`header backdrop-filter=${p.headerBd}`);
  if (p.tint) {
    p.tint.display === 'block' && p.tint.pos === 'fixed' && p.tint.h === '12px'
      ? ok(`取样条 = 真实元素 .top-tint（fixed / 12px / display:block）`) : bad(`取样条异常 ${JSON.stringify(p.tint)}`);
    p.tint.z === '9999' ? ok('取样条 z-index = 9999（与 Cogito 一致，不再是 2147483647）') : bad(`取样条 z-index = ${p.tint.z}`);
    p.tint.pe === 'none' ? ok('取样条 pointer-events: none（不挡触摸）') : bad(`取样条 pointer-events=${p.tint.pe}`);
    rgbTriple(p.tint.bg) === A ? ok(`取样条颜色 = 页面背景色 ${p.tint.bg}`) : bad(`取样条颜色 ${p.tint.bg} ≠ ${p.appbg}`);
  } else bad('.top-tint 元素不存在');
  rgbTriple(p.htmlBg) === A ? ok(`html 底色 = ${p.htmlBg}`) : bad(`html 底色 ${p.htmlBg} ≠ ${p.appbg}`);
  rgbTriple(p.bodyBg) === A ? ok(`body 底色 = ${p.bodyBg}`) : bad(`body 底色 ${p.bodyBg} ≠ ${p.appbg}`);
  p.sat === '62px' && p.tg === '6px' && p.headerPadTop === '68px'
    ? ok('顶部让位 = 62 + 6 = 68px') : bad(`让位异常 ${p.sat}/${p.tg}/${p.headerPadTop}`);
  if (p.ink) {
    const t = p.ink.top;
    t >= 78 && t <= 90 ? ok(`首行墨迹落点 ${t}pt（与 Cogito 的 ~80pt 同一档）`) : bad(`首行墨迹 ${t}pt 不在 78~90 目标区间`);
  }
  p.strays.length === 0
    ? ok('顶部 0~120pt 内没有任何「非背景色」的额外图层')
    : bad(`顶部仍有异色图层: ${JSON.stringify(p.strays.slice(0, 3))}`);
};

check('A. 待办页', await probe(page));
await page.screenshot({ path: `${OUT}/01-todo-top.png`, clip: { x: 0, y: 0, width: 440, height: 150 } });
await page.screenshot({ path: `${OUT}/01-todo-full.png` });

console.log('\n===== B. 抽屉 =====');
await page.click('[aria-label="打开菜单"]');
await page.waitForTimeout(700);
const b = await probe(page);
/* 抽屉打开时整屏遮罩（rgba(62,122,78,.4)）本来就该存在，这里只验顶部元素本身透明 */
b.headerBg === 'rgba(0, 0, 0, 0)' ? ok('抽屉顶部元素透明（遮罩是抽屉自身的行为，不算顶部色块）') : bad(`抽屉顶部元素底色 ${b.headerBg}`);
b.tint && b.tint.h === '12px' ? ok('抽屉打开时取样条仍在最上层（12px）') : bad(`抽屉下取样条异常 ${JSON.stringify(b.tint)}`);
await page.screenshot({ path: `${OUT}/02-drawer-top.png`, clip: { x: 0, y: 0, width: 440, height: 220 } });

console.log('\n===== C. 回顾页 =====');
const recapBtn = page.getByRole('button', { name: /回顾/ }).first();
if (await recapBtn.count()) {
  await recapBtn.click();
  await page.waitForTimeout(900);
  check('C. 回顾页', await probe(page));
  await page.screenshot({ path: `${OUT}/03-recap-top.png`, clip: { x: 0, y: 0, width: 440, height: 150 } });
} else bad('未找到「回顾」入口');

console.log('\n===== D. 日历页 =====');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.getByRole('button', { name: '日历' }).first().click();
await page.waitForTimeout(800);
check('D. 日历页', await probe(page));
await page.screenshot({ path: `${OUT}/04-cal-top.png`, clip: { x: 0, y: 0, width: 440, height: 150 } });
await page.screenshot({ path: `${OUT}/04-cal-full.png` });

console.log('\n===== E. 8 主题：--bg-top / 取样条是否自动跟随 =====');
for (const t of ['pixel', 'summer', 'spring', 'winter', 'blossom', 'unicorn', 'autumn', 'matcha']) {
  await page.evaluate((x) => document.documentElement.setAttribute('data-theme', x), t);
  await page.waitForTimeout(220);
  const e = await probe(page);
  const A = rgbTriple(e.appbg);
  (rgbTriple(e.bgTop) === A && rgbTriple(e.htmlBg) === A && rgbTriple(e.tint.bg) === A)
    ? ok(`${t}：底色 ${A}（html / --bg-top / 取样条三者一致）`)
    : bad(`${t} 不一致：appbg=${e.appbg} bgTop=${e.bgTop} html=${e.htmlBg} tint=${e.tint.bg}`);
}

if (errors.length) bad(`运行时错误 ${errors.length} 条: ${errors.slice(0, 4).join(' || ')}`);
else ok('无控制台 / 页面报错');

await browser.close();
console.log('\n========== 汇总 ==========');
if (problems.length === 0) console.log('\u2713 全部通过');
else problems.forEach((p) => console.log('\u2717 ' + p));
console.log('截图：' + OUT);

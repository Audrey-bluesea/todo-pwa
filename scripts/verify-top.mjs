/* 顶部「白雾 / 空白」改动验证 v2：iPhone 18 Pro Max 440x956@3x，standalone 模拟 */
import { webkit } from '/Users/leeshukyuen/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8131/';
const OUT = '/tmp/top-verify';
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const ok = (m) => console.log('  \u2713 ' + m);
const bad = (m) => { console.log('  \u2717 ' + m); problems.push(m); };

/* 颜色归一化：把 "246 250 246" / "rgb(246, 250, 246)" 统一成 "246,250,246" */
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
    const glows = [...document.querySelectorAll('.tg-glow')].map((e) => ({
      padTop: getComputedStyle(e).paddingTop,
      bg: getComputedStyle(e).backgroundColor,
      img: getComputedStyle(e).backgroundImage,
    }));
    const before = getComputedStyle(document.body, '::before');
    let first = null;
    if (header) {
      for (const el of header.querySelectorAll('button, h1')) {
        const rc = el.getBoundingClientRect();
        if (rc.width > 4 && rc.height > 4) {
          first = {
            tag: el.tagName,
            text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 12),
            top: +rc.top.toFixed(1),
            bottom: +rc.bottom.toFixed(1),
          };
          break;
        }
      }
    }
    return {
      iosClass: root.className.includes('ios-pwa'),
      theme: root.getAttribute('data-theme'),
      sat: cs.getPropertyValue('--sat').trim(),
      tg: cs.getPropertyValue('--tg').trim(),
      bgTop: cs.getPropertyValue('--bg-top').trim(),
      appbg: cs.getPropertyValue('--c-appbg').trim(),
      htmlBg: getComputedStyle(root).backgroundColor,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      headerPadTop: hcs ? hcs.paddingTop : null,
      glows,
      beforeH: before.height,
      beforeBg: before.backgroundColor,
      beforePos: before.position,
      beforePE: before.pointerEvents,
      first,
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

/* 坑 4：先确认服务的是目标 App */
const title = await page.title();
console.log('页面标题:', title, '| 浏览器日期:', await page.evaluate(() => new Date().toString()));
if (!title.includes('行时录')) { console.error('\u274c 服务目标不是行时录，中止'); process.exit(1); }

await page.waitForSelector('nav', { timeout: 15000 });
await page.waitForTimeout(900);

console.log('\n===== A. 待办页：变量与结构 =====');
const a = await probe(page);
console.log(JSON.stringify({ ...a, glows: a.glows.map((g) => g.padTop) }, null, 2));
const A = rgbTriple(a.appbg);

a.iosClass ? ok('已进入 iOS standalone 模式（html.ios-pwa）') : bad('未进入 ios-pwa 模式，验证无效');
a.sat === '62px' ? ok('--sat = 62px') : bad(`--sat = ${a.sat}`);
a.tg === '6px' ? ok('--tg = 6px（原 26px）') : bad(`--tg = ${a.tg}`);
a.headerPadTop === '68px' ? ok('header padding-top = 68px（原 88px，-20px）') : bad(`header padding-top = ${a.headerPadTop}`);
rgbTriple(a.bgTop) === A ? ok(`--bg-top == --c-appbg == ${a.bgTop}（顶部=背景色）`) : bad(`--bg-top=${a.bgTop} 与 appbg=${a.appbg} 不一致`);
rgbTriple(a.htmlBg) === A ? ok(`html 背景 = ${a.htmlBg}（= 页面背景色）`) : bad(`html 背景 = ${a.htmlBg}`);
rgbTriple(a.bodyBg) === A ? ok(`body 背景 = ${a.bodyBg}（= 页面背景色）`) : bad(`body 背景 = ${a.bodyBg}`);
a.glows.every((g) => g.img === 'none') ? ok('.tg-glow 已无渐变（background-image: none）') : bad(`仍有渐变: ${JSON.stringify(a.glows.map((g) => g.img))}`);
a.glows.every((g) => rgbTriple(g.bg) === A) ? ok(`.tg-glow 实色 = ${a.glows[0].bg}`) : bad(`.tg-glow 实色 = ${JSON.stringify(a.glows.map((g) => g.bg))}`);
a.beforeH === '12px' && a.beforePos === 'fixed' ? ok(`取样条 body::before = fixed / ${a.beforeH} / ${a.beforeBg}`) : bad(`取样条异常: ${JSON.stringify({ h: a.beforeH, pos: a.beforePos })}`);
rgbTriple(a.beforeBg) === A ? ok('取样条颜色 = 页面背景色') : bad(`取样条颜色 = ${a.beforeBg}`);
a.beforePE === 'none' ? ok('取样条 pointer-events: none（不挡触摸）') : bad(`取样条 pointer-events = ${a.beforePE}`);

/* A/B：临时把 --tg 改回 26px，量「字上移了多少」 */
await page.evaluate(() => document.documentElement.style.setProperty('--tg', '26px'));
await page.waitForTimeout(250);
const aOld = await probe(page);
await page.evaluate(() => document.documentElement.style.removeProperty('--tg'));
await page.waitForTimeout(250);
const aNew = await probe(page);
const shift = (aOld.first.top - aNew.first.top).toFixed(1);
console.log(`\n  首行内容 top：旧(--tg=26) ${aOld.first.top}px  →  新(--tg=6) ${aNew.first.top}px  ⇒ 上移 ${shift}px`);
Math.abs(Number(shift) - 20) < 0.6 ? ok(`A/B 实测内容上移 ${shift}px（预期 20px）`) : bad(`A/B 上移 ${shift}px，与预期 20px 不符`);

await page.screenshot({ path: `${OUT}/01-todo-top.png`, clip: { x: 0, y: 0, width: 440, height: 150 } });
await page.screenshot({ path: `${OUT}/01-todo-full.png` });

console.log('\n===== B. 抽屉 =====');
await page.click('[aria-label="打开菜单"]');
await page.waitForTimeout(700);
const b = await probe(page);
b.glows.some((g) => g.padTop === '68px') ? ok(`抽屉顶部 .pt-safe = ${b.glows.map((g) => g.padTop).join(' / ')}`) : bad(`抽屉 .pt-safe 异常: ${JSON.stringify(b.glows.map((g) => g.padTop))}`);
await page.screenshot({ path: `${OUT}/02-drawer-top.png`, clip: { x: 0, y: 0, width: 440, height: 220 } });

console.log('\n===== C. 回顾页 =====');
const recapBtn = page.getByRole('button', { name: /回顾/ }).first();
if (await recapBtn.count()) {
  await recapBtn.click();
  await page.waitForTimeout(900);
  const c = await probe(page);
  c.glows.some((g) => g.padTop === '68px') ? ok(`回顾页 .pt-safe = ${c.glows.map((g) => g.padTop).join(' / ')}`) : bad(`回顾页 .pt-safe 异常: ${JSON.stringify(c.glows.map((g) => g.padTop))}`);
  await page.screenshot({ path: `${OUT}/03-recap-top.png`, clip: { x: 0, y: 0, width: 440, height: 150 } });
  await page.screenshot({ path: `${OUT}/03-recap-full.png` });
} else {
  bad('未找到「回顾」入口按钮');
}

console.log('\n===== D. 日历页 =====');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.getByRole('button', { name: '日历' }).first().click();
await page.waitForTimeout(800);
const d = await probe(page);
d.headerPadTop === '68px' ? ok(`日历页 header padding-top = 68px，首行 top = ${d.first.top}（${d.first.text}）`) : bad(`日历页 header padding-top = ${d.headerPadTop}`);
await page.screenshot({ path: `${OUT}/04-cal-top.png`, clip: { x: 0, y: 0, width: 440, height: 150 } });
await page.screenshot({ path: `${OUT}/04-cal-full.png` });

console.log('\n===== E. 换主题后 --bg-top 是否自动跟随 =====');
for (const t of ['pixel', 'summer', 'spring', 'winter', 'blossom', 'unicorn', 'autumn']) {
  await page.evaluate((x) => document.documentElement.setAttribute('data-theme', x), t);
  await page.waitForTimeout(220);
  const e = await probe(page);
  rgbTriple(e.bgTop) === rgbTriple(e.appbg)
    ? ok(`${t}：--bg-top 跟随 = ${e.bgTop}，html 背景 = ${e.htmlBg}`)
    : bad(`${t} 未跟随：bg-top=${e.bgTop} / appbg=${e.appbg}`);
}
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'matcha'));
await page.waitForTimeout(200);

if (errors.length) bad(`运行时错误 ${errors.length} 条: ${errors.slice(0, 4).join(' || ')}`);
else ok('无控制台 / 页面报错');

await browser.close();

console.log('\n========== 汇总 ==========');
if (problems.length === 0) console.log('\u2713 全部通过');
else problems.forEach((p) => console.log('\u2717 ' + p));
console.log('截图：' + OUT);

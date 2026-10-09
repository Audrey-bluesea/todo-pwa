import { webkit } from '/Users/leeshukyuen/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';
import fs from 'fs';

const URL = 'http://127.0.0.1:8133/?t=' + Date.now();
const OUT = '/tmp/tg34-verify';
fs.mkdirSync(OUT, { recursive: true });

const b = await webkit.launch();
const c = await b.newContext({
  viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Version/27.0 Mobile/15E148 Safari/604.1',
});
const p = await c.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

let okN = 0, badN = 0;
const ok = (s) => { okN++; console.log('  ✓ ' + s); };
const bad = (s) => { badN++; console.log('  ✗ ' + s); };

const snap = (tag) => p.evaluate((t) => {
  const de = document.documentElement;
  const hdr = document.querySelector('header.tg-glow');
  const tbar = document.querySelector('.tabbar');
  const root = document.getElementById('root');
  return {
    tag: t,
    ptSafePT: getComputedStyle(document.querySelector('.pt-safe')).paddingTop,
    hdrBottom: hdr ? Math.round(hdr.getBoundingClientRect().bottom) : null,
    tabBottom: tbar ? Math.round(tbar.getBoundingClientRect().bottom) : null,
    overflow: de.scrollHeight - de.clientHeight,
    rootPos: root ? getComputedStyle(root).position : null,
    vpH: window.innerHeight,
  };
}, tag);

async function go(which) {
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.documentElement.classList.add('ios-pwa'));
  await p.waitForTimeout(400);
  if (which === 'cal') {
    await p.click('[aria-label="日历"]');
    await p.waitForTimeout(800);
  }
}
async function setVariant(v) {
  await p.evaluate((vv) => {
    if (!vv) { localStorage.removeItem('xingshilu.topfix6'); document.documentElement.removeAttribute('data-topfix'); }
    else { localStorage.setItem('xingshilu.topfix6', vv); document.documentElement.dataset.topfix = vv; }
  }, v);
  await p.waitForTimeout(400);
}

console.log('===== A. 日历页 · 默认（--tg:34px）=====');
await go('cal');
await setVariant(null);
let a = await snap('cal-default');
await p.screenshot({ path: OUT + '/cal-default.png' });
console.log('  ' + JSON.stringify(a));
a.ptSafePT === '96px' ? ok('padding-top = 96px（62 + 34）') : bad(`padding-top = ${a.ptSafePT}`);
a.overflow === 0 ? ok('文档 0 溢出') : bad(`溢出 ${a.overflow}px`);
a.tabBottom === a.vpH ? ok(`TabBar 底边 ${a.tabBottom}（贴底）`) : bad(`TabBar 底边 ${a.tabBottom}`);

console.log('\n===== B. 日历页 · 变体 1（--tg:6px，A/B 对照）=====');
await setVariant('1');
let b1 = await snap('cal-old');
await p.screenshot({ path: OUT + '/cal-old.png' });
console.log('  ' + JSON.stringify(b1));
b1.ptSafePT === '68px' ? ok('变体 1 生效：padding-top = 68px（改造前的值）') : bad(`变体 1 padding-top = ${b1.ptSafePT}`);
b1.hdrBottom === a.hdrBottom - 28 ? ok(`顶栏高度随之下移 28pt（${b1.hdrBottom} → ${a.hdrBottom}）`) : bad(`顶栏高度 ${b1.hdrBottom} / ${a.hdrBottom}`);

console.log('\n===== C. 变体 30（更贴顶一档）=====');
await setVariant('30');
let v30 = await snap('cal-v30');
await p.screenshot({ path: OUT + '/cal-v30.png' });
console.log('  ' + JSON.stringify(v30));
v30.ptSafePT === '92px' ? ok('变体 30 生效：padding-top = 92px') : bad(`变体 30 padding-top = ${v30.ptSafePT}`);

console.log('\n===== D. 待办页 · 默认 =====');
await go('todo');
await setVariant(null);
let d = await snap('todo-default');
await p.screenshot({ path: OUT + '/todo-default.png' });
console.log('  ' + JSON.stringify(d));
d.overflow === 0 ? ok('待办页 0 溢出') : bad(`待办页溢出 ${d.overflow}`);
d.tabBottom === d.vpH ? ok(`待办页 TabBar 底边 ${d.tabBottom}`) : bad(`待办页 TabBar 底边 ${d.tabBottom}`);

console.log('\n===== E. 控制台 =====');
errs.length === 0 ? ok('0 控制台报错') : bad(`${errs.length} 条：${errs.slice(0, 3).join(' | ')}`);

console.log(`\n汇总：${okN} 通过 / ${badN} 失败`);
await b.close();

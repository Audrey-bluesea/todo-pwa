import { webkit } from '/Users/leeshukyuen/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';

const URL = 'http://127.0.0.1:8133/';
const OUT = '/tmp/v6c-verify';
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ✗ ' + m); };

const b = await webkit.launch();
const ctx = await b.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
});
await ctx.addInitScript(() => {
  Object.defineProperty(navigator, 'standalone', { get: () => true });
});
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push(String(e)));

await p.goto(URL + '?t=' + Date.now(), { waitUntil: 'networkidle' });
const title = await p.title();
console.log('标题:', title);
if (!title.includes('行时录')) throw new Error('服务的目标不是本 App：' + title);
await p.evaluate(() => document.documentElement.classList.add('ios-pwa'));
await p.waitForTimeout(1400);

/* 首行墨迹：header 内第一个可见文本节点的顶边（pt） */
const firstInk = () => p.evaluate(() => {
  const hdr = document.querySelector('header');
  if (!hdr) return null;
  const scope = hdr.getBoundingClientRect();
  let best = null;
  hdr.querySelectorAll('*').forEach((el) => {
    if (el.children.length) return;
    const t = (el.textContent || '').trim();
    if (!t) return;
    const r = el.getBoundingClientRect();
    if (r.height < 4 || r.width < 4) return;
    // 只看可见的、在 header 里的
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return;
    if (!best || r.top < best) best = r.top;
  });
  return best === null ? null : Math.round(best * 10) / 10;
});

const probe = async (name) => p.evaluate((nm) => {
  const de = document.documentElement;
  const g = (s) => document.querySelector(s);
  const cs = (el) => el ? getComputedStyle(el) : null;
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) }; };
  const root = g('#root'), appRoot = g('#app-root'), tint = g('.top-tint');
  const first = document.elementFromPoint(Math.round(innerWidth / 2), 4);
  const chain = [];
  let n = first;
  while (n && chain.length < 6) {
    const s = getComputedStyle(n);
    const bb = n.getBoundingClientRect();
    chain.push(`${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/)[0] : ''} pos=${s.position} ${Math.round(bb.width)}x${Math.round(bb.height)} bg=${s.backgroundColor}`);
    if (s.position === 'fixed' || s.position === 'sticky') break;
    n = n.parentElement;
  }
  const scroller = g('.scroll-y');
  return {
    name: nm,
    vp: { w: innerWidth, h: innerHeight },
    docOverflow: de.scrollHeight - de.clientHeight,
    root: { pos: cs(root)?.position, rect: r(root), bg: cs(root)?.backgroundColor, top: cs(root)?.top, bottom: cs(root)?.bottom, cssH: cs(root)?.height },
    appRoot: { pos: cs(appRoot)?.position, rect: r(appRoot) },
    tint: { pos: cs(tint)?.position, rect: r(tint), bg: cs(tint)?.backgroundColor, pe: cs(tint)?.pointerEvents, z: cs(tint)?.zIndex },
    chain,
    scroller: scroller ? { overflowY: getComputedStyle(scroller).overflowY, ios: getComputedStyle(scroller).webkitOverflowScrolling } : null,
    tabbar: r(document.querySelector('.tabbar, nav')),
    fabBottom: (() => { const f = document.querySelector('#app-root button.absolute, #app-root > button'); return f ? Math.round(f.getBoundingClientRect().bottom) : null; })(),
  };
}, name);

console.log('\n===== A. 默认（变体 8）· 待办页 =====');
const a = await probe('todo');
const ink0 = await firstInk();
console.log('  #root:', JSON.stringify(a.root));
console.log('  命中链:'); a.chain.forEach((x, i) => console.log(`    ${i}. ${x}`));
console.log('  首行墨迹 y =', ink0, 'pt');

a.root.pos === 'fixed' ? ok('#root position=fixed') : bad(`#root position=${a.root.pos}`);
a.root.top === '0px' && a.root.bottom === '0px' ? ok('#root inset 四边 0') : bad(`#root top/bottom=${a.root.top}/${a.root.bottom}`);
Math.abs(a.root.rect.w - a.vp.w) <= 1 && Math.abs(a.root.rect.h - a.vp.h) <= 1
  ? ok(`#root ${a.root.rect.w}x${a.root.rect.h} = 视口 ${a.vp.w}x${a.vp.h}`)
  : bad(`#root ${a.root.rect.w}x${a.root.rect.h} ≠ 视口 ${a.vp.w}x${a.vp.h}`);
a.root.bg.startsWith('rgb(') && !a.root.bg.includes('rgba') ? ok(`#root 背景不透明 ${a.root.bg}`) : bad(`#root 背景 ${a.root.bg}`);
a.appRoot.pos === 'relative' ? ok('#app-root relative（文档流）') : bad(`#app-root ${a.appRoot.pos}`);
Math.abs(a.appRoot.rect.h - a.vp.h) <= 1 ? ok(`#app-root 高 ${a.appRoot.rect.h}`) : bad(`#app-root 高 ${a.appRoot.rect.h}`);
a.tint.pos === 'fixed' && a.tint.rect.h === 12 && a.tint.pe === 'none'
  ? ok('.top-tint fixed / 12px / pointer-events:none（逐字对齐 Cogito）')
  : bad(`.top-tint ${JSON.stringify(a.tint)}`);
a.tint.bg === a.root.bg ? ok('.top-tint 颜色 = #root = 页面背景色') : bad(`.top-tint ${a.tint.bg} vs ${a.root.bg}`);
const lastA = a.chain[a.chain.length - 1];
/#root.*pos=fixed/.test(lastA) ? ok(`命中链尾就是 #root：${lastA}`) : bad(`命中链尾不是 #root：${a.chain.join(' -> ')}`);
a.docOverflow <= 0 ? ok(`文档无溢出（${a.docOverflow}）`) : bad(`文档溢出 ${a.docOverflow}px`);
a.tabbar && Math.abs(a.tabbar.bottom - a.vp.h) <= 1 ? ok(`TabBar 底边 ${a.tabbar.bottom}（贴底）`) : bad(`TabBar 底边 ${a.tabbar && a.tabbar.bottom}`);
a.scroller && a.scroller.overflowY === 'auto' ? ok(`.scroll-y 默认 overflow-y=${a.scroller.overflowY}（滚动容器）`) : bad(`.scroll-y ${JSON.stringify(a.scroller)}`);
// 注：-webkit-overflow-scrolling 是 iOS 私有属性，桌面 WebKit 读不到（undefined），
//     变体 10 只能在真机上验，本地不断言。

console.log('\n===== B. 日历页 =====');
const tabs = await p.$$('#app-root nav a, #app-root nav button');
if (tabs.length >= 2) { await tabs[1].click(); await p.waitForTimeout(800); }
const c = await probe('cal');
console.log('  命中链:'); c.chain.forEach((x, i) => console.log(`    ${i}. ${x}`));
c.root.pos === 'fixed' && Math.abs(c.root.rect.h - c.vp.h) <= 1 ? ok('#root 日历页 fixed 且等高视口') : bad('#root 日历页异常');
/#root.*pos=fixed/.test(c.chain[c.chain.length - 1]) ? ok('命中链尾 = #root') : bad('命中链尾不是 #root');
c.docOverflow <= 0 ? ok('日历页无溢出') : bad(`日历页溢出 ${c.docOverflow}`);
c.tabbar && Math.abs(c.tabbar.bottom - c.vp.h) <= 1 ? ok(`TabBar 底边 ${c.tabbar.bottom}`) : bad(`TabBar 底边 ${c.tabbar && c.tabbar.bottom}`);
await p.screenshot({ path: OUT + '/cal.png' });

/* ---- 变体：首行下移（3 / 4 / 5）---- */
console.log('\n===== C. 变体 3 / 4 / 5（二分模糊带下边界）=====');
const setV = async (v) => {
  await p.evaluate((vv) => {
    if (vv === '8') delete document.documentElement.dataset.topfix;
    else document.documentElement.dataset.topfix = vv;
  }, v);
  await p.waitForTimeout(350);
};
// ⚠️ 必须和「默认」在**同一个页面**里比：待办页 header 163pt、日历页 118pt，
//    跨页比较全是噪声。这里统一在日历页上量。
await setV('8');
const base = await firstInk();
console.log(`  日历页 · 默认(8): 首行墨迹 y = ${base}pt`);
for (const v of ['3', '4', '5']) {
  await setV(v);
  const y = await firstInk();
  const d = y !== null && base !== null ? Math.round((y - base) * 10) / 10 : null;
  console.log(`  变体 ${v}: 首行墨迹 y = ${y}pt  （相对默认 ${d >= 0 ? '+' : ''}${d}pt）`);
  d !== null && d > 0 ? ok(`变体 ${v} 生效，下移 ${d}pt`) : bad(`变体 ${v} 未产生位移（${d}）`);
}
await setV('8');

/* ---- 变体 10 / 11：滚动容器 ---- */
console.log('\n===== D. 变体 10 / 11（滚动容器 · 新机制）=====');
await setV('10');
const s10 = await p.evaluate(() => {
  const e = document.querySelector('.scroll-y');
  const d = document.createElement('div');
  return {
    val: e ? getComputedStyle(e).webkitOverflowScrolling : null,
    supported: 'webkitOverflowScrolling' in d.style,   // 该私有属性在本引擎是否存在
  };
});
console.log('  变体 10:', JSON.stringify(s10));
if (!s10.supported) {
  console.log('  (桌面 WebKit 不支持 -webkit-overflow-scrolling ⇒ 本变体只能在 iOS 真机上验，本地不断言)');
} else {
  s10.val === 'auto' ? ok('变体 10 生效（惯性滚动已关）') : bad(`变体 10 未生效：${s10.val}`);
}
await setV('11');
const s11 = await p.evaluate(() => { const e = document.querySelector('.scroll-y'); return e ? getComputedStyle(e).overflowY : null; });
console.log('  变体 11: overflow-y =', s11);
s11 === 'visible' ? ok('变体 11 生效（滚动容器身份已去掉）') : bad(`变体 11 未生效：${s11}`);
await setV('8');

/* ---- 变体 12：viewport-fit=auto（需整页 reload 才生效）---- */
console.log('\n===== E. 变体 12（viewport-fit=auto · 新机制，整页 reload）=====');
await p.evaluate(() => localStorage.setItem('xingshilu.topfix4', '12'));
await p.reload({ waitUntil: 'networkidle' });
await p.evaluate(() => document.documentElement.classList.add('ios-pwa'));
await p.waitForTimeout(1200);
const vpMeta = await p.evaluate(() => {
  const m = document.querySelector('meta[name="viewport"]');
  return { content: m ? m.getAttribute('content') : null, topfix: document.documentElement.dataset.topfix };
});
console.log('  ', JSON.stringify(vpMeta));
vpMeta.content && vpMeta.content.includes('viewport-fit=auto')
  ? ok('变体 12 生效：viewport-fit 已改为 auto（网页不再延伸到状态栏）')
  : bad(`变体 12 未生效：${vpMeta.content}`);
await p.screenshot({ path: OUT + '/v12.png' });
await p.evaluate(() => localStorage.setItem('xingshilu.topfix4', '8'));
await p.reload({ waitUntil: 'networkidle' });
await p.evaluate(() => document.documentElement.classList.add('ios-pwa'));
await p.waitForTimeout(1000);

/* ---- 变体 9：玫红诊断条 ---- */
console.log('\n===== F. 变体 9（玫红诊断条）=====');
await setV('9');
const t9 = await p.evaluate(() => {
  const el = document.querySelector('.top-tint');
  const s = getComputedStyle(el); const bb = el.getBoundingClientRect();
  return { h: Math.round(bb.height), w: Math.round(bb.width), bg: s.backgroundColor, z: s.zIndex, top: Math.round(bb.top) };
});
console.log('  ', JSON.stringify(t9));
t9.h === 100 && t9.bg === 'rgb(224, 69, 123)' && t9.top === 0 && t9.w === 440
  ? ok('变体 9 玫红条 440x100 钉在顶部')
  : bad('变体 9 异常');
await setV('8');

/* ---- 变体 1：回退 ---- */
console.log('\n===== G. 变体 1（回退）=====');
await setV('1');
const r1 = await p.evaluate(() => {
  const root = document.getElementById('root');
  const ar = document.getElementById('app-root');
  return { pos: getComputedStyle(root).position, appH: Math.round(ar.getBoundingClientRect().height), vp: innerHeight,
           tabbar: (() => { const t = document.querySelector('.tabbar, nav'); return t ? Math.round(t.getBoundingClientRect().bottom) : null; })() };
});
console.log('  ', JSON.stringify(r1));
r1.pos === 'static' && r1.appH === r1.vp && r1.tabbar === r1.vp
  ? ok('变体 1 回退可用且布局安全')
  : bad(`变体 1 异常 ${JSON.stringify(r1)}`);
await setV('8');

/* ---- 探针面板 ---- */
console.log('\n===== H. 探针面板 =====');
const probeBtn = await p.$('text=顶部探针');
probeBtn ? ok('探针入口存在') : bad('探针入口缺失');
if (probeBtn) {
  await probeBtn.click(); await p.waitForTimeout(500);
  const txt = await p.textContent('pre');
  txt && txt.includes('#root') ? ok('读数含 #root 段') : bad('读数缺 #root 段');
  /变体\s+8/.test(txt) ? ok('默认变体显示为 8') : bad('默认变体异常：' + String(txt).slice(0, 100));
  const btns = await p.$$eval('button', (bs) => bs.map((x) => x.textContent.trim()).filter((t) => /^\d+\s·/.test(t)));
  console.log('  可选变体:', btns.join(' | '));
  btns.length >= 10 ? ok(`变体齐备（${btns.length} 个）`) : bad(`变体数量不足：${btns.length}`);
  await p.screenshot({ path: OUT + '/probe.png' });
  await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find((y) => y.textContent === '关闭'); x && x.click(); });
}
await p.waitForTimeout(400);
await p.screenshot({ path: OUT + '/todo.png' });

console.log(`\n控制台错误 ${errs.length} 条`);
if (errs.length) { console.log(errs.slice(0, 5).join('\n')); fail++; } else ok('0 控制台报错');

console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
await b.close();
process.exit(fail ? 1 : 0);

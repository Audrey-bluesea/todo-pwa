import { webkit } from '/Users/leeshukyuen/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';

const URL = 'http://127.0.0.1:8133/';
const OUT = '/tmp/v6b-verify';
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
    chain.push(`${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/)[0] : ''} pos=${s.position} ${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)} bg=${s.backgroundColor}`);
    if (s.position === 'fixed' || s.position === 'sticky') break;
    n = n.parentElement;
  }
  return {
    name: nm,
    vp: { w: innerWidth, h: innerHeight },
    docOverflow: de.scrollHeight - de.clientHeight,
    root: { pos: cs(root)?.position, rect: r(root), bg: cs(root)?.backgroundColor, top: cs(root)?.top, bottom: cs(root)?.bottom, h: cs(root)?.height },
    appRoot: { pos: cs(appRoot)?.position, rect: r(appRoot), bg: cs(appRoot)?.backgroundColor },
    tint: { pos: cs(tint)?.position, rect: r(tint), bg: cs(tint)?.backgroundColor, pe: cs(tint)?.pointerEvents, z: cs(tint)?.zIndex },
    chain,
    tabbar: r(document.querySelector('nav[role="tablist"], .tabbar, nav')),
    fabBottom: (() => { const f = document.querySelector('#app-root button.absolute, #app-root > button'); return f ? Math.round(f.getBoundingClientRect().bottom) : null; })(),
  };
}, name);

console.log('\n===== A. 待办页 =====');
const a = await probe('todo');
console.log(JSON.stringify(a, null, 1));
a.root.pos === 'fixed' ? ok(`#root position=fixed`) : bad(`#root position=${a.root.pos}`);
a.root.top === '0px' && a.root.bottom === '0px' ? ok('#root inset 四边 0') : bad(`#root top/bottom=${a.root.top}/${a.root.bottom}`);
Math.abs(a.root.rect.w - a.vp.w) <= 1 && Math.abs(a.root.rect.h - a.vp.h) <= 1
  ? ok(`#root ${a.root.rect.w}x${a.root.rect.h} = 视口 ${a.vp.w}x${a.vp.h}`)
  : bad(`#root ${a.root.rect.w}x${a.root.rect.h} ≠ 视口 ${a.vp.w}x${a.vp.h}`);
a.root.bg.startsWith('rgb(') && !a.root.bg.includes('rgba') ? ok(`#root 背景不透明 ${a.root.bg}`) : bad(`#root 背景 ${a.root.bg}`);
a.appRoot.pos === 'relative' ? ok('#app-root position=relative（回归文档流）') : bad(`#app-root ${a.appRoot.pos}`);
Math.abs(a.appRoot.rect.h - a.vp.h) <= 1 ? ok(`#app-root 高 ${a.appRoot.rect.h}`) : bad(`#app-root 高 ${a.appRoot.rect.h}`);
a.tint.pos === 'fixed' && a.tint.rect.h === 12 && a.tint.pe === 'none' ? ok('.top-tint fixed / 12px / pointer-events none（与 Cogito 逐字一致）') : bad(`.top-tint ${JSON.stringify(a.tint)}`);
a.tint.bg === a.root.bg ? ok('.top-tint 颜色 = #root 颜色 = 页面背景色') : bad(`.top-tint ${a.tint.bg} vs #root ${a.root.bg}`);
const last = a.chain[a.chain.length - 1];
/pos=(fixed|sticky)/.test(last) ? ok(`命中链尾 = 固定容器：${last}`) : bad(`命中链尾无固定容器：${a.chain.join(' -> ')}`);
a.docOverflow <= 0 ? ok(`文档无溢出（${a.docOverflow}）`) : bad(`文档溢出 ${a.docOverflow}px`);
a.tabbar && Math.abs(a.tabbar.bottom - a.vp.h) <= 1 ? ok(`TabBar 底边 = ${a.tabbar.bottom}（贴视口底）`) : bad(`TabBar 底边 ${a.tabbar && a.tabbar.bottom} vs ${a.vp.h}`);

// 切日历页
const tabs = await p.$$('#app-root nav a, #app-root nav button');
if (tabs.length >= 2) { await tabs[1].click(); await p.waitForTimeout(800); }
console.log('\n===== B. 日历页 =====');
const c = await probe('cal');
console.log(JSON.stringify({ root: c.root, chain: c.chain, docOverflow: c.docOverflow, tabbar: c.tabbar }, null, 1));
c.root.pos === 'fixed' && Math.abs(c.root.rect.h - c.vp.h) <= 1 ? ok('#root 日历页 fixed 且等高视口') : bad('#root 日历页异常');
/pos=(fixed|sticky)/.test(c.chain[c.chain.length - 1]) ? ok(`命中链尾 = 固定容器：${c.chain[c.chain.length - 1]}`) : bad('命中链尾无固定容器');
c.docOverflow <= 0 ? ok('日历页无溢出') : bad(`日历页溢出 ${c.docOverflow}`);
c.tabbar && Math.abs(c.tabbar.bottom - c.vp.h) <= 1 ? ok(`TabBar 底边 ${c.tabbar.bottom}`) : bad(`TabBar 底边 ${c.tabbar && c.tabbar.bottom}`);

console.log('\n===== C. 变体 9（玫红诊断条）=====');
await p.evaluate(() => { document.documentElement.dataset.topfix = '9'; });
await p.waitForTimeout(300);
const t = await p.evaluate(() => {
  const el = document.querySelector('.top-tint');
  const s = getComputedStyle(el); const b = el.getBoundingClientRect();
  return { h: b.height, w: b.width, bg: s.backgroundColor, z: s.zIndex, top: b.top };
});
console.log(JSON.stringify(t));
t.h === 100 && t.bg === 'rgb(224, 69, 123)' && t.top === 0 ? ok('变体 9 玫红条 440x100 在顶部') : bad('变体 9 异常');
await p.evaluate(() => { delete document.documentElement.dataset.topfix; });

console.log('\n===== D. 变体 1（回退）=====');
await p.evaluate(() => { document.documentElement.dataset.topfix = '1'; });
await p.waitForTimeout(300);
const r1 = await p.evaluate(() => {
  const root = document.getElementById('root'); const s = getComputedStyle(root);
  const ar = document.getElementById('app-root');
  return { pos: s.position, bg: s.backgroundColor, rootH: Math.round(root.getBoundingClientRect().height), appH: Math.round(ar.getBoundingClientRect().height), vp: innerHeight };
});
console.log(JSON.stringify(r1));
r1.pos === 'static' && r1.appH === r1.vp ? ok('变体 1 回退可用') : bad('变体 1 异常');
await p.evaluate(() => { delete document.documentElement.dataset.topfix; });

console.log('\n===== E. 探针面板 =====');
const probeBtn = await p.$('text=顶部探针');
probeBtn ? ok('探针入口存在') : bad('探针入口缺失');
if (probeBtn) {
  await probeBtn.click(); await p.waitForTimeout(400);
  const txt = await p.textContent('pre');
  txt && txt.includes('#root') ? ok('读数列含 #root 段') : bad('读数缺 #root 段');
  /变体\s+8/.test(txt) ? ok('默认变体显示为 8') : bad('默认变体显示异常：' + (txt || '').slice(0, 120));
  await p.screenshot({ path: OUT + '/probe.png' });
} else {
  console.log('(跳过)');
}

await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent === '关闭'); b && b.click(); });
await p.waitForTimeout(300);
await p.screenshot({ path: OUT + '/after-todo.png' });

console.log(`\n控制台错误 ${errs.length} 条`);
if (errs.length) console.log(errs.slice(0, 5).join('\n')); else ok('0 控制台报错');

console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
await b.close();
process.exit(fail ? 1 : 0);

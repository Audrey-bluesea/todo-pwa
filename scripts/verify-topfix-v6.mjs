import { webkit } from '/Users/leeshukyuen/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';

const URL = 'http://127.0.0.1:8133/';
const OUT = '/tmp/v6-verify';
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ✗ ' + m); };

const browser = await webkit.launch();
const ctx = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));

await page.addInitScript(() => {
  Object.defineProperty(navigator, 'standalone', { get: () => true });
});

async function load(variant) {
  await page.addInitScript((v) => {
    try { localStorage.setItem('xingshilu.topfix2', v); } catch {}
  }, variant);
  await page.goto(URL + '?t=' + Date.now(), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.documentElement.classList.add('ios-pwa'));
  await page.waitForTimeout(600);
}

const probe = () => page.evaluate(() => {
  const root = document.getElementById('app-root');
  const rs = getComputedStyle(root);
  const rr = root.getBoundingClientRect();
  const tint = document.querySelector('.top-tint');
  const ts = tint ? getComputedStyle(tint) : null;
  const tr = tint ? tint.getBoundingClientRect() : null;

  // 复现 WebKit 判定：y=4，水平中点
  const chain = [];
  let n = document.elementFromPoint(Math.round(window.innerWidth / 2), 4);
  while (n && chain.length < 6) {
    const s = getComputedStyle(n);
    chain.push({
      tag: n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') +
           (typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/)[0] : ''),
      pos: s.position,
      w: Math.round(n.getBoundingClientRect().width),
      h: Math.round(n.getBoundingClientRect().height),
      bg: s.backgroundColor,
      pe: s.pointerEvents,
    });
    if (s.position === 'fixed' || s.position === 'sticky') break;
    n = n.parentElement;
  }

  const nav = document.querySelector('.tabbar');
  const tabBottom = nav ? Math.round(nav.getBoundingClientRect().bottom) : null;
  const fab = document.querySelector('.fab');
  const fabBottom = fab ? Math.round(fab.getBoundingClientRect().bottom) : null;

  return {
    vpW: window.innerWidth, vpH: window.innerHeight,
    root: { pos: rs.position, top: Math.round(rr.top), bottom: Math.round(rr.bottom),
            w: Math.round(rr.width), h: Math.round(rr.height), bg: rs.backgroundColor,
            insetTop: rs.top, insetBottom: rs.bottom, insetLeft: rs.left, insetRight: rs.right },
    tint: tr ? { pos: ts.position, h: Math.round(tr.height), w: Math.round(tr.width),
                 bg: ts.backgroundColor, pe: ts.pointerEvents, z: ts.zIndex } : null,
    chain,
    tabBottom, fabBottom,
    docScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    bodyScroll: document.body.scrollHeight - document.body.clientHeight,
  };
});

console.log('===== A. 变体 6：新默认（根容器 fixed inset-0 + 取样条让出命中）=====');
await load('6');
await page.screenshot({ path: OUT + '/v6-todo.png' });
let p = await probe();
console.log('  视口 ' + p.vpW + 'x' + p.vpH);
console.log('  #app-root ' + JSON.stringify(p.root));
console.log('  命中链：');
p.chain.forEach((c, i) => console.log('    ' + i + '. ' + c.tag + ' pos=' + c.pos + ' ' + c.w + 'x' + c.h + ' bg=' + c.bg + ' pe=' + c.pe));

p.root.pos === 'fixed' ? ok('根容器 position=fixed') : bad('根容器 position=' + p.root.pos);
(p.root.top === 0 && p.root.bottom === p.vpH && p.root.w === p.vpW && p.root.h === p.vpH)
  ? ok('根容器四条边全钉：top=0 高=' + p.vpH + ' 宽=' + p.vpW + '（= 视口 100%，稳过 ≤105% 判据）')
  : bad('根容器盒子不对 top=' + p.root.top + ' bottom=' + p.root.bottom + ' h=' + p.root.h + ' w=' + p.root.w);
/^rgb\(/.test(p.root.bg) && !p.root.bg.includes('rgba')
  ? ok('根容器背景不透明：' + p.root.bg)
  : bad('根容器背景非不透明：' + p.root.bg);
p.tint && p.tint.pe === 'none'
  ? ok('取样条已让出命中（pointer-events:none）')
  : bad('取样条仍在抢命中：' + JSON.stringify(p.tint));
const tail = p.chain[p.chain.length - 1];
tail.pos === 'fixed' || tail.pos === 'sticky'
  ? ok('命中链尾 = ' + tail.tag + '（' + tail.pos + '）⇒ 系统能取到背景色 ' + tail.bg)
  : bad('命中链尾不是 fixed/sticky：' + JSON.stringify(p.chain));
tail.tag.includes('app-root')
  ? ok('命中的正是根容器（不是取样条）')
  : bad('命中的不是根容器，是 ' + tail.tag);
p.fabBottom !== null && p.fabBottom < p.vpH ? ok('FAB 底边 = ' + p.fabBottom) : bad('FAB 底边 ' + p.fabBottom);
p.tabBottom === p.vpH ? ok('TabBar 底边 = ' + p.tabBottom + '（未上飘）') : bad('TabBar 底边 ' + p.tabBottom + ' ≠ ' + p.vpH);
(p.docScroll <= 0 && p.bodyScroll <= 0) ? ok('页面无溢出') : bad('页面溢出 doc=' + p.docScroll + ' body=' + p.bodyScroll);

console.log('\n===== B. 变体 2（取样条仍可命中）→ 应命中取样条而非根容器 =====');
await load('2');
let p2 = await probe();
const tail2 = p2.chain[p2.chain.length - 1];
console.log('  命中链尾：' + tail2.tag + ' pos=' + tail2.pos + ' ' + tail2.w + 'x' + tail2.h);
tail2.tag.includes('top-tint')
  ? ok('对照成立：取样条可命中时会截走命中（这就是前四版失效的机制）')
  : bad('对照不成立，链尾是 ' + tail2.tag);

console.log('\n===== C. 变体 1（回退：根容器 relative）→ 布局仍安全 =====');
await load('1');
let p1 = await probe();
console.log('  #app-root ' + JSON.stringify(p1.root));
p1.root.pos === 'relative' ? ok('回退后 position=relative') : bad('回退失败 pos=' + p1.root.pos);
p1.root.h === 956 ? ok('回退后高度 956') : bad('回退后高度 ' + p1.root.h);
p1.tabBottom === 956 ? ok('回退后 TabBar 底边 956') : bad('回退后 TabBar 底边 ' + p1.tabBottom);

console.log('\n===== D. 日历页（变体 6 下巡检）=====');
await load('6');
const calBtn = await page.$('text=日历');
if (calBtn) { await calBtn.click(); await page.waitForTimeout(700); }
await page.screenshot({ path: OUT + '/v6-cal.png' });
let pc = await probe();
pc.root.h === pc.vpH ? ok('日历页根容器高度 = 视口') : bad('日历页根容器高度 ' + pc.root.h);
pc.tabBottom === pc.vpH ? ok('日历页 TabBar 底边 ' + pc.tabBottom) : bad('日历页 TabBar 底边 ' + pc.tabBottom);
(pc.docScroll <= 0 && pc.bodyScroll <= 0) ? ok('日历页无溢出') : bad('日历页溢出');

console.log('\n===== E. 控制台 =====');
errs.length === 0 ? ok('0 报错') : bad('报错：' + errs.slice(0, 3).join(' | '));

console.log('\n===== 汇总：' + pass + ' 通过 / ' + fail + ' 失败 =====');
await browser.close();

/**
 * 验证：顶部「固定色块延伸」改动 + 现场探针
 * 真机尺寸 iPhone 18 Pro Max 440x956@3x（standalone 注入）
 */
import { webkit } from '/Users/leeshukyuen/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';
import fs from 'fs';

const URL = 'http://127.0.0.1:8133/';
const OUT = '/tmp/topfix-verify';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✓ ' + m); };
const bad = (m) => { fail++; console.log('  ✗ ' + m); };

const browser = await webkit.launch();
const ctx = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  Object.defineProperty(navigator, 'standalone', { get: () => true });
});
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(String(e)));

const boot = async () => {
  await page.goto(URL + '?t=' + Date.now(), { waitUntil: 'networkidle' });
  const t = await page.title();
  if (/cogito/i.test(t)) throw new Error('服务的是 Cogito！端口冲突');
  await page.evaluate(() => document.documentElement.classList.add('ios-pwa'));
  await page.waitForTimeout(700);
};

await boot();
console.log('页面标题 / 环境基线');

// ---------- A. 默认态：取样条必须满足 WebKit 的四条判据 ----------
console.log('\n===== A. 取样条 .top-tint 是否满足 WebKit 判据 =====');
const tint = await page.evaluate(() => {
  const el = document.querySelector('.top-tint');
  if (!el) return null;
  const s = getComputedStyle(el);
  const rc = el.getBoundingClientRect();
  const bgRoot = getComputedStyle(document.documentElement).backgroundColor;
  return {
    pos: s.position, h: rc.height, w: rc.width, bg: s.backgroundColor,
    pe: s.pointerEvents, z: s.zIndex, top: rc.top, disp: s.display,
    rootBg: bgRoot,
    vw: window.innerWidth, vh: window.innerHeight,
  };
});
if (!tint) { bad('.top-tint 不存在'); } else {
  console.log('   实测:', JSON.stringify(tint));
  tint.pos === 'fixed' ? ok('position:fixed（sticky 亦可）') : bad(`position=${tint.pos}`);
  tint.w >= tint.vw * 0.9 ? ok(`宽度 ${tint.w} ≥ 视口 90%`) : bad(`宽度不足 ${tint.w}`);
  tint.h > 10 ? ok(`高度 ${tint.h}px > 10px（系统会取元素自身背景色）`) : bad(`高度 ${tint.h} ≤ 10px`);
  tint.h <= tint.vh * 1.05 ? ok('高度 ≤ 视口 105%') : bad('高度超过视口 105%');
  tint.pe !== 'none' ? ok(`pointer-events=${tint.pe}（可作为 hit-test 节点）`) : bad('pointer-events:none ⇒ 会被 hit-test 跳过');
  tint.bg === tint.rootBg ? ok(`背景色 = 页面背景色 ${tint.bg}`) : bad(`背景 ${tint.bg} ≠ 页面 ${tint.rootBg}`);
  tint.top === 0 ? ok('贴视口顶边 top=0') : bad(`top=${tint.top}`);
}

// ---------- B. 关键：命中点 4px 处的元素链里有没有 fixed 祖先 ----------
console.log('\n===== B. hit-test 模拟：视口顶边下方 4px、水平中点 =====');
const hit = await page.evaluate(() => {
  const x = Math.round(window.innerWidth / 2);
  let el = document.elementFromPoint(x, 4);
  const chain = [];
  while (el && chain.length < 12) {
    const s = getComputedStyle(el);
    chain.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 40),
      pos: s.position,
      bg: s.backgroundColor,
      h: +el.getBoundingClientRect().height.toFixed(1),
      w: +el.getBoundingClientRect().width.toFixed(1),
    });
    el = el.parentElement;
  }
  return chain;
});
console.log('   命中点元素链（从命中的元素向上）:');
hit.forEach((n, i) => console.log(`     ${i}. <${n.tag}${n.id ? '#' + n.id : ''}> pos=${n.pos} h=${n.h} w=${n.w} bg=${n.bg}  ${n.cls}`));
const fixedNode = hit.find((n) => n.pos === 'fixed' || n.pos === 'sticky');
if (fixedNode) {
  const okW = fixedNode.w >= 440 * 0.9;
  const okH = fixedNode.h <= 956 * 1.05;
  (okW && okH)
    ? ok(`找到固定容器 <${fixedNode.tag}> h=${fixedNode.h} w=${fixedNode.w} ⇒ 满足 90%/105% 判据`)
    : bad(`找到固定容器但尺寸不合规：h=${fixedNode.h} w=${fixedNode.w}`);
} else {
  bad('元素链里没有 fixed/sticky 容器 ⇒ 系统找不到「固定色块延伸」，顶部会保持模糊');
}
console.log('   ⚠️ 注意：elementFromPoint 会跳过 pointer-events:none，与 WebKit 该处的 hit-test 行为一致；');
console.log('      所以这一条模拟是有效的间接证据，但最终仍需真机确认。');

// ---------- C. #app-root 背景是否不透明 ----------
console.log('\n===== C. #app-root 背景（旧版它是 fixed，需要有不透明底色）=====');
const root = await page.evaluate(() => {
  const el = document.getElementById('app-root');
  const s = getComputedStyle(el);
  const rc = el.getBoundingClientRect();
  return { pos: s.position, bg: s.backgroundColor, h: rc.height, w: rc.width, top: rc.top };
});
console.log('   实测:', JSON.stringify(root));
root.bg !== 'rgba(0, 0, 0, 0)' ? ok(`#app-root 背景不透明 ${root.bg}`) : bad('#app-root 背景透明 ⇒ 即便 fixed 也过不了判据');

// ---------- D. 布局零回归 ----------
console.log('\n===== D. 布局回归（底部 / 首行位置）=====');
const layout = await page.evaluate(() => {
  const bar = document.querySelector('nav.tabbar');
  const main = document.querySelector('main');
  return {
    barBottom: +(bar ? bar.getBoundingClientRect().bottom : -1).toFixed(1),
    mainTop: +(main ? main.getBoundingClientRect().top : -1).toFixed(1),
    docOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    rootH: +document.getElementById('app-root').getBoundingClientRect().height.toFixed(1),
  };
});
console.log('   实测:', JSON.stringify(layout));
layout.barBottom === 956 ? ok('TabBar 底边 956（未上飘）') : bad(`TabBar 底边 ${layout.barBottom}`);
layout.docOverflow === 0 ? ok('页面无溢出') : bad(`页面溢出 ${layout.docOverflow}px`);

// ---------- E. 探针组件 ----------
console.log('\n===== E. 现场探针 =====');
const probeBtn = await page.$('text=顶部探针');
if (!probeBtn) { bad('探针按钮不存在'); } else {
  ok('探针按钮存在');
  await probeBtn.click();
  await page.waitForTimeout(400);
  const panel = await page.$('text=顶部模糊 · 现场探针');
  panel ? ok('面板可打开') : bad('面板打不开');
  const readout = await page.evaluate(() => {
    const pre = document.querySelector('pre');
    return pre ? pre.textContent.slice(0, 400) : '';
  });
  readout.includes('innerHeight') ? ok('读数已渲染') : bad('读数为空');
  console.log('   --- 读数前几行 ---');
  readout.split('\n').slice(0, 8).forEach((l) => console.log('     ' + l));
  await page.screenshot({ path: OUT + '/probe-panel.png' });
}

// ---------- F. 变体 1 是否真的生效（设置后重载） ----------
console.log('\n===== F. 变体生效链路（选变体 1 → 重载 → 根容器应变 fixed）=====');
await page.evaluate(() => localStorage.setItem('xingshilu.topfix', '1'));
await boot();
const v1 = await page.evaluate(() => {
  const el = document.getElementById('app-root');
  return {
    attr: document.documentElement.dataset.topfix || '(无)',
    pos: getComputedStyle(el).position,
    h: +el.getBoundingClientRect().height.toFixed(1),
    bg: getComputedStyle(el).backgroundColor,
    barBottom: +document.querySelector('nav.tabbar').getBoundingClientRect().bottom.toFixed(1),
  };
});
console.log('   实测:', JSON.stringify(v1));
v1.attr === '1' ? ok('变体号已打到 <html data-topfix>') : bad(`data-topfix=${v1.attr}`);
v1.pos === 'fixed' ? ok('变体 1：#app-root 已变 fixed') : bad(`变体 1 未生效，position=${v1.pos}`);
v1.barBottom === 956 ? ok('变体 1 下 TabBar 仍在 956（高度 auto 未压缩）') : bad(`变体 1 下 TabBar 底边 ${v1.barBottom}`);
await page.screenshot({ path: OUT + '/variant1.png' });

// 复位
await page.evaluate(() => localStorage.setItem('xingshilu.topfix', '0'));
await boot();
await page.screenshot({ path: OUT + '/default.png' });
const restored = await page.evaluate(() => getComputedStyle(document.getElementById('app-root')).position);
restored === 'relative' ? ok('复位后根容器回到 relative') : bad(`复位失败 position=${restored}`);

// ---------- G. 控制台 ----------
console.log('\n===== G. 控制台 =====');
errs.length === 0 ? ok('0 报错') : bad(`${errs.length} 条报错：${errs.slice(0, 3).join(' | ')}`);

console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
await browser.close();
process.exit(fail ? 1 : 0);

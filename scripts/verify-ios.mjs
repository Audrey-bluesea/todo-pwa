/* iPhone 视口验证：WebKit 内核，390×844 与 393×852 双尺寸 */
import { webkit } from '/Users/leeshukyuen/.workbuddy/binaries/node/workspace/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5199/';
const OUT = path.resolve(process.cwd(), 'verify-shots');
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iPhone12-390x844', width: 390, height: 844 },
  { name: 'iPhone14Pro-393x852', width: 393, height: 852 },
];

const problems = [];
const log = (...a) => console.log(...a);

async function audit(page, label, device) {
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const nav = document.querySelector('nav');
    const navRect = nav ? nav.getBoundingClientRect() : null;
    // 找出所有超出视口右边界的元素
    const overflow = [];
    document.querySelectorAll('*').forEach((el) => {
      const rc = el.getBoundingClientRect();
      if (rc.width === 0 || rc.height === 0) return;
      if (rc.right > window.innerWidth + 1.5 || rc.left < -1.5) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && cs.visibility === 'hidden') return;
        overflow.push(
          `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 45)} L${rc.left.toFixed(0)} R${rc.right.toFixed(0)}`,
        );
      }
    });
    // 热区检查：所有 button / [role=button]
    const small = [];
    document.querySelectorAll('button,[role="button"],a').forEach((el) => {
      const rc = el.getBoundingClientRect();
      if (rc.width === 0 || rc.height === 0) return;
      if (rc.height < 28 || rc.width < 28) {
        small.push(
          `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 14)}" ${rc.width.toFixed(0)}x${rc.height.toFixed(0)}`,
        );
      }
    });
    return {
      docScrollW: de.scrollWidth,
      clientW: de.clientWidth,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      bodyScrollW: document.body.scrollWidth,
      navBottom: navRect ? navRect.bottom : null,
      navTop: navRect ? navRect.top : null,
      overflow: overflow.slice(0, 6),
      overflowCount: overflow.length,
      small: small.slice(0, 6),
      smallCount: small.length,
    };
  });

  const tag = `[${device.name}] ${label}`;
  const hScroll = r.docScrollW > r.clientW + 1 || r.bodyScrollW > r.clientW + 1;
  if (hScroll) problems.push(`${tag} 横向滚动 scrollW=${r.docScrollW} clientW=${r.clientW}`);
  if (r.overflowCount > 0) problems.push(`${tag} 溢出元素 ${r.overflowCount}: ${r.overflow.join(' | ')}`);
  if (r.navBottom !== null && r.navBottom > r.innerH + 1)
    problems.push(`${tag} 底栏超出视口 navBottom=${r.navBottom} innerH=${r.innerH}`);
  if (r.smallCount > 0) problems.push(`${tag} 小热区 ${r.smallCount}: ${r.small.join(' | ')}`);

  log(
    `${hScroll || r.overflowCount || r.smallCount ? '✗' : '✓'} ${tag} ` +
      `scrollW=${r.docScrollW}/${r.clientW} navBottom=${r.navBottom}/${r.innerH} ` +
      `overflow=${r.overflowCount} small=${r.smallCount}`,
  );

  await page.screenshot({ path: path.join(OUT, `${device.name}__${label}.png`) });
}

for (const device of DEVICES) {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('nav', { timeout: 10000 });
  await page.waitForTimeout(700);

  /* ---- 待办 Tab ---- */
  await audit(page, '01-todo-list', device);

  // 抽屉
  await page.click('[aria-label="打开菜单"]');
  await page.waitForTimeout(500);
  await audit(page, '02-drawer', device);
  await page.mouse.click(device.width - 16, Math.round(device.height / 2));
  await page.waitForTimeout(450);

  // 看板视图（通过下拉选择器切换）
  const viewDropdown = page.locator('[aria-label="切换视图"]').first();
  if (await viewDropdown.count()) {
    await viewDropdown.click();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: '看板' }).first().click();
    await page.waitForTimeout(500);
    await audit(page, '03-todo-board', device);
    // 切回列表
    await viewDropdown.click();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: '列表' }).first().click();
    await page.waitForTimeout(400);
  }

  // 编辑弹层
  await page.click('[aria-label="添加待办"]');
  await page.waitForTimeout(600);
  await audit(page, '04-editor-sheet', device);
  const cancel = page.getByRole('button', { name: '取消' });
  if (await cancel.count()) await cancel.first().click();
  await page.waitForTimeout(450);

  /* ---- 日历 Tab ---- */
  await page.getByRole('button', { name: '日历' }).first().click();
  await page.waitForTimeout(500);
  await audit(page, '05-cal-list', device);

  // 日视图（通过下拉选择器）
  const calDropdown = page.locator('[aria-label="切换视图"]').first();
  if (await calDropdown.count()) {
    await calDropdown.click();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: '日', exact: true }).first().click();
    await page.waitForTimeout(450);
    await audit(page, '06-cal-day', device);

    // 周视图
    await calDropdown.click();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: '周', exact: true }).first().click();
    await page.waitForTimeout(450);
    await audit(page, '07-cal-week-timeline', device);

    // 周视图 8 格卡片
    const cardsToggle = page.getByRole('button', { name: /卡片|时间轴/ });
    if (await cardsToggle.count()) {
      await cardsToggle.first().click();
      await page.waitForTimeout(450);
      await audit(page, '08-cal-week-cards', device);
    }

    // 月视图
    await calDropdown.click();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: '月', exact: true }).first().click();
    await page.waitForTimeout(450);
    await audit(page, '09-cal-month', device);
  }

  if (errors.length) problems.push(`[${device.name}] 运行时错误: ${errors.slice(0, 5).join(' || ')}`);

  await browser.close();
}

log('\n========== 汇总 ==========');
if (problems.length === 0) {
  log('✓ 全部通过：无横向滚动、无元素溢出、底栏未被遮挡、热区达标、无运行时错误');
} else {
  problems.forEach((p) => log('✗ ' + p));
  process.exitCode = 1;
}
log(`截图目录：${OUT}`);

/* ============================================================
 * iOS 独立 PWA 视口看门狗（Viewport Watchdog）
 * ------------------------------------------------------------
 * 症状（真机截图逐像素实测，iPhone 18 Pro Max / iOS 27，440×956@3x）：
 *   偶发「整块底部上飘 62pt」：TabBar / FAB / 计时气泡全部抬高 62pt，
 *   屏幕最下方留一条 62pt 空白；杀掉 App 重开就恢复。
 *     正常：TabBar 图标带 888.3..911.3pt
 *     异常：TabBar 图标带 826.7..849.7pt   （差 61.6pt）
 *   两张图的顶部主题色带都结束在 ~86.5pt（= --sat 62 + --tg 26）——
 *   顶部没动，说明是「可用高度少了 62pt」，而不是整页位移。
 *   62pt 恰好 = 状态栏高度。
 *
 * 成因（高度怀疑，待真机日志坐实）：
 *   iOS 26+ 为「键盘弹起时贴住键盘上沿」，让 position:fixed 元素跟随**可视视口**
 *   （visual viewport）而不是布局视口。App 根容器是 fixed inset-0，键盘收起或
 *   动画被打断时，它的高度可能停在中间值（894 = 956 − 62）不再恢复，
 *   于是整块底部上飘，而 window.innerHeight 仍是 956。
 *
 * 处理（三层，全部无副作用）：
 *   ① 高度锁：持续把 #app-root 的高度钉回 window.innerHeight。
 *      正常状态下 innerHeight 本来就等于 inset-0 算出来的高度，写上去等于没写，
 *      所以对正常布局零影响；一旦真被系统缩过，下一次 tick 立刻拉回来。
 *      键盘弹起期间（kb > 40）不介入，避免和系统抢。
 *   ② 兜底提示：若 ① 连续无效（说明是视口本身少了 62pt，页面根本画不到屏幕
 *      最底 —— 这种情况 CSS/JS 都救不了），在左下角留一枚极小胶囊，点一下
 *      重载页面（等价于用户手动「杀掉 App 重开」，但不用他自己动手）。
 *   ③ 日志：全程写 localStorage['xingshilu.vpdiag']（环形 40 条），
 *      含事件名 / innerHeight / screen.height / 根容器实测高 / 键盘高 / 采取的动作，
 *      下次复现可直接取真机读数定位。
 * ============================================================ */

/** 日志 key（环形缓冲） */
export const VP_LOG_KEY = 'xingshilu.vpdiag';
const LOG_MAX = 40;
/** 相对本会话最好状态少了这么多 px 就算异常 */
const BAD_LOST = 40;
/** 键盘高度阈值：超过则认为键盘弹起，本模块不介入 */
const KB_MAX = 40;
/** 连续异常多久后弹出兜底提示（毫秒） */
const BAD_HOLD_MS = 2000;

type Sample = {
  t: number;
  ev: string;
  /** window.innerHeight */
  inner: number;
  /** window.screen.height */
  screen: number;
  /** #app-root 实测渲染高 */
  rootH: number;
  /** visualViewport.height */
  vv: number;
  /** 推算键盘高度 */
  kb: number;
  /** 本次采取的动作 */
  act: string;
};

/** 是否「iOS + 主屏独立模式」。异常判定只在这个前提下生效：
    桌面浏览器 / Safari 标签页里 window.innerHeight 本来就小于 screen.height
    （有地址栏、窗口边框），不设门槛会到处误报。 */
let iosStandalone = false;
let maxInner = 0;
let lastSig = '';
let badSince = 0;
let badge: HTMLElement | null = null;
let timer: number | null = null;
let burstIds: number[] = [];
let started = false;

/* ---------------- 日志 ---------------- */

function readLog(): Sample[] {
  try {
    const raw = localStorage.getItem(VP_LOG_KEY);
    const arr = raw ? (JSON.parse(raw) as Sample[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function pushLog(s: Sample) {
  try {
    const arr = readLog();
    arr.push(s);
    while (arr.length > LOG_MAX) arr.shift();
    localStorage.setItem(VP_LOG_KEY, JSON.stringify(arr));
  } catch {
    /* 存储不可用就算了 */
  }
}

/* ---------------- 兜底提示 ---------------- */

function ensureBadge(): HTMLElement {
  if (badge && badge.isConnected) return badge;
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('data-vp-badge', '1');
  el.style.cssText = [
    'position:fixed',
    'left:8px',
    'bottom:6px',
    'z-index:99999',
    'max-width:80vw',
    'padding:4px 10px',
    'border:0',
    'border-radius:999px',
    'background:rgba(24,24,27,.68)',
    'color:#fff',
    'font-size:11px',
    'line-height:18px',
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
    'letter-spacing:.2px',
    'backdrop-filter:blur(6px)',
    '-webkit-backdrop-filter:blur(6px)',
  ].join(';');
  el.textContent = '显示异常 · 点此修复';
  el.addEventListener('click', () => {
    pushLog({
      t: Date.now(),
      ev: 'tap-badge',
      inner: Math.round(window.innerHeight),
      screen: Math.round(window.screen?.height || 0),
      rootH: Math.round(document.getElementById('app-root')?.getBoundingClientRect().height || 0),
      vv: Math.round(window.visualViewport?.height || 0),
      kb: 0,
      act: 'reload',
    });
    location.reload();
  });
  document.body.appendChild(el);
  badge = el;
  return el;
}

function hideBadge() {
  if (badge && badge.isConnected) badge.remove();
  badge = null;
}

/* ---------------- 主动推一把视口重算 ---------------- */

/** 切换 viewport meta 的 viewport-fit，逼 WebKit 重新计算布局视口与安全区。
    失败也无害（我们读的是别处的常量，不依赖 env）。 */
function nudgeViewport() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const orig = meta.getAttribute('content') || '';
  if (!orig) return;
  const alt = /viewport-fit\s*=\s*cover/.test(orig)
    ? orig.replace(/\s*,?\s*viewport-fit\s*=\s*cover/, '')
    : orig.replace(/\s*$/, ', viewport-fit=cover');
  if (alt === orig) return;
  meta.setAttribute('content', alt);
  void document.documentElement.offsetHeight;
  window.setTimeout(() => {
    if (meta.isConnected) meta.setAttribute('content', orig);
  }, 80);
}

/* ---------------- 核心 tick ---------------- */

function tick(ev: string) {
  const root = document.getElementById('app-root');
  if (!root) return;

  const inner = Math.round(window.innerHeight);
  const screenH = Math.round(window.screen?.height || 0);
  const vv = window.visualViewport;
  const vvH = vv ? Math.round(vv.height) : inner;
  const kb = vv ? Math.max(0, Math.round(inner - (vv.height + vv.offsetTop))) : 0;
  if (inner > maxInner) maxInner = inner;

  let act = 'none';

  /* ① 高度锁：把根容器高度钉回 window.innerHeight（键盘弹起时不抢） */
  if (kb <= KB_MAX) {
    const cur = parseFloat(root.style.height);
    if (!(cur > 0) || Math.abs(cur - inner) >= 1) {
      root.style.height = inner + 'px';
      act = 'lockH->' + inner;
    }
  }

  const rect = root.getBoundingClientRect();
  const rootH = Math.round(rect.height);
  const worst = Math.min(inner, rootH);
  /* 两种异常信号：
     · lost      —— 本会话内「视口/根容器」突然缩水（用会话内最好值做基准）
     · screenGap —— 相对物理屏整体缺一截（真机 screen.height 恒为 956，
                    可兜住「一启动就是坏状态」这种会话内基准也变小的情况） */
  const lost = maxInner - worst;
  const screenGap = screenH > 0 && screenH - Math.max(inner, rootH) >= BAD_LOST;
  const bad = iosStandalone && kb <= KB_MAX && (lost >= BAD_LOST || screenGap);

  /* ② 兜底：① 也救不回来 → 提示用户一键重载 */
  if (bad) {
    if (!badSince) {
      badSince = Date.now();
      // 先试一次温和的视口重算
      nudgeViewport();
      act = act === 'none' ? 'nudge' : act + '+nudge';
    } else if (Date.now() - badSince > BAD_HOLD_MS) {
      const el = ensureBadge();
      el.textContent = '显示异常 · 点此修复';
      act = act === 'none' ? 'badge' : act + '+badge';
    }
  } else if (badSince) {
    badSince = 0;
    act = act === 'none' ? 'recovered' : act + '+recovered';
    hideBadge();
  }

  /* ③ 只在状态变化时记日志，避免刷爆 localStorage */
  const sig = [ev, inner, screenH, rootH, vvH, kb, act, bad ? 1 : 0].join('|');
  if (sig !== lastSig) {
    lastSig = sig;
    pushLog({ t: Date.now(), ev, inner, screen: screenH, rootH, vv: vvH, kb, act });
  }
}

/* ---------------- 事件接线 ---------------- */

/** 事件后短时间内补跑几次：iOS 的视口值更新有延迟（键盘动画几十~几百毫秒） */
function burst(ev: string) {
  tick(ev);
  burstIds.forEach((id) => window.clearTimeout(id));
  burstIds = [120, 420, 900].map((d) => window.setTimeout(() => tick(ev + '+' + d), d));
}

export function initViewportGuard(opts?: { iosStandalone?: boolean }) {
  if (started) return;
  started = true;
  iosStandalone = opts?.iosStandalone === true;

  const onEvent = (ev: string) => () => burst(ev);

  window.addEventListener('resize', onEvent('resize'));
  window.addEventListener('orientationchange', onEvent('orientation'));
  window.addEventListener('pageshow', onEvent('pageshow'));
  window.addEventListener('focus', onEvent('focus'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) burst('visible');
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onEvent('vv-resize'));
    window.visualViewport.addEventListener('scroll', onEvent('vv-scroll'));
  }

  // 保底轮询：状态卡住时不会有任何事件，靠这个兜住
  timer = window.setInterval(() => tick('tick'), 1000);

  // 首帧与启动阶段多测几次
  burst('init');
  window.setTimeout(() => tick('init+600'), 600);
  window.setTimeout(() => tick('init+1500'), 1500);

  // 记录一次启动基线，便于对比
  void timer;
}

/** 供调试/测试读取日志 */
export function readViewportLog(): Sample[] {
  return readLog();
}

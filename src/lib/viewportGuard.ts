/* ============================================================
 * iOS 独立 PWA 视口看门狗 v2 —— 修「整块底部偶发上飘一个状态栏高度」
 * ============================================================
 * 【症状】真机实测（iPhone 18 Pro Max / iOS 27，440×956@3x）：
 *   TabBar / 底部胶囊 / 编辑页「保存修改」整体上飘约 62pt，屏幕最下一条
 *   62pt 只剩底色、没有任何内容；杀后台重开就恢复。
 *   逐像素实测：底部胶囊（bottom:6px）底边落在 887.3pt ⇒ 定位基准底边
 *   = 893.3 ≈ 894，而物理屏是 956 ⇒ 视口整体少了 62pt。
 *
 * 【根因（查证过，有权威文档背书，不是猜）】
 *   iOS standalone PWA 的 WebKit 已知缺陷：冷启动、或软键盘弹出过一次之后，
 *   WebKit 报出的「动态视口」会永久少算**正好一个 env(safe-area-inset-top)**
 *   （本机 = 62pt），而 screen / vh / lvh 是对的：
 *     screen.height          = 956  ✅
 *     100vh / 100lvh         = 956  ✅（standalone 没有地址栏，vh 就是满屏高）
 *     100dvh / 100svh        = 894  ❌ 少 62
 *     window.innerHeight     = 894  ❌ 少 62
 *     visualViewport.height  = 894  ❌ 少 62
 *   本 App 的壳是 fixed inset-0、TabBar 是 in-flow，全部由视口高度推导
 *   → 整条底部跟着少 62pt。屏幕最下那 62pt 由 html 背景铺满，所以看起来
 *     只是「空」，不像「坏了」，这也是它骗过前几轮定位的原因。
 *
 * 【为什么别的 PWA 没事，就这个经常犯】
 *   这个缺陷有自愈路径：iOS 会在以下时机重新计算并**永久记住**（对同一个
 *   已安装实例）正确视口 —— 用户滚动页面 / 前后台切换 / 旋转屏幕 /
 *   **内容溢出视口（哪怕 1px）** / 向下拖拽页面。
 *   本 App 是 fixed 壳 + 内部滚动 + 全局 overflow:hidden，页面**永远不可能
 *   溢出**，自愈路径被彻底堵死：错误值一旦产生就被永久锁住。
 *   别的 PWA 用正常文档流、能滚动，早就自愈并缓存了正确值。
 *
 * 【为什么「点此修复 = reload」没用】（用户实测反馈）
 *   视口状态挂在 WKWebView 实例上，reload 只换文档、不换实例 → 必然无效。
 *   只有触发自愈重算、或杀进程重开才行。
 *
 * 【修法（2026-09-25 重写 · 根治）】视觉正确性由 CSS 直接钉死，不依赖 JS 自愈：
 *   · #app-root 在 html.ios-pwa 下强制 height:100vh（100vh=956 是 WebKit 唯一
 *     没算错的值），in-flow 的 TabBar 永远贴真实屏幕底 —— 这是「TabBar 上飘」的
 *     直接根因修复。
 *   · FAB / 计时胶囊 / toast 由 position:fixed 改为 absolute，锚到 #app-root
 *     （=956），不再受 buggy 的 894 ICB 牵连。
 *   · 模态层（Portal 到 body，必须保留 fixed 才能随键盘收缩）改用
 *     bottom:calc(-1*var(--vp-gap)) 把自身往下延长到真实屏幕底，--vp-gap 由本
 *     模块实测写入 documentElement。
 *   本看门狗只剩「锦上添花」：用溢出信号尝试把 innerHeight 也扳正（让未来会话
 *   从一开始就健康），但**就算永远扳不回来，视觉也始终正确**，故不再弹任何胶囊。
 *   全程只在「iOS + 主屏独立模式」且键盘收起时动作，桌面/标签页里一行都不碰。
 * ============================================================ */

/** 日志 key（环形缓冲，便于下次真机复现时直接读读数） */
export const VP_LOG_KEY = 'xingshilu.vpdiag';
const LOG_MAX = 40;
/** 视口比物理屏少了这么多 px 就算异常（本机实际差 62） */
const BAR = 40;
/** 键盘高度阈值：超过则认为键盘弹起，本模块不介入 */
const KB_MAX = 40;
/** 第①波（逼自愈重算）观察窗口 */
const T1_MS = 700;
/** 第②波（100vh 强顶）观察窗口 */
const T2_MS = 1100;
/** 每会话最多折腾几轮，避免无意义地反复闪 */
const MAX_ROUNDS = 3;

const CLS_OVERFLOW = 'vp-overflow';
const CLS_FULLH = 'vp-fullheight';

type Phase = 'idle' | 'wave1' | 'wave2' | 'gaveup';

type Sample = {
  t: number;
  ev: string;
  /** window.innerHeight */
  inner: number;
  /** window.screen.height */
  screen: number;
  /** #app-root 实测渲染高 */
  rootH: number;
  /** visualViewport.height + offsetTop */
  vv: number;
  /** 推算键盘高度 */
  kb: number;
  /** 缺少的高度（screen - inner） */
  gap: number;
  /** 本次采取的动作 */
  act: string;
};

/** 是否「iOS + 主屏独立模式」。异常判定只在这个前提下生效：
    桌面浏览器 / Safari 标签页里 window.innerHeight 本来就小于 screen.height
    （有地址栏、窗口边框），不设门槛会到处误报。 */
let iosStandalone = false;
let maxInner = 0;
let lastSig = '';
let phase: Phase = 'idle';
let phaseAt = 0;
let rounds = 0;
let probe: HTMLElement | null = null;
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

/* ---------------- 造「内容溢出视口」的信号 ---------------- */

function ensureProbe(): HTMLElement {
  if (probe && probe.isConnected) return probe;
  const el = document.createElement('div');
  el.setAttribute('data-vp-probe', '1');
  el.style.cssText =
    'position:absolute;top:0;left:0;width:1px;height:0;opacity:0;pointer-events:none;';
  document.body.appendChild(el);
  probe = el;
  return el;
}

/** 第①波：逼 iOS 重算视口（自愈/docking）。
 *  文档确认的触发条件之一就是「内容溢出视口，哪怕 1px」，而本 App 平时是
 *  fixed 壳 + overflow:hidden，永远不溢出 —— 这里临时把这两个前提补上。 */
function startWave1() {
  const html = document.documentElement;
  html.classList.add(CLS_OVERFLOW);
  const el = ensureProbe();
  // 比当前视口高出 120px，确保「确实溢出」而不只是擦边 1px
  el.style.height = Math.round(window.innerHeight) + 120 + 'px';
  void el.offsetHeight;
  // 再模拟一次「用户把页面往下拖了一下」——同样是文档列出的触发条件
  try {
    window.scrollTo(0, 1);
    void html.offsetHeight;
    window.scrollTo(0, 0);
  } catch {
    /* 忽略 */
  }
  pushLog(sample('wave1', 'overflow+scroll'));
}

/** 第②波：升级成「显式 100vh 壳」。
 *  standalone 下 100vh = 真实满屏高（没有地址栏），dvh/svh/innerHeight 才是错的。
 *  壳撑到 100vh 会在当前（偏小的）视口里多出 62px 溢出，是很强的重算信号；
 *  同时只要重算成功，这个高度本身就是正确的。 */
function startWave2() {
  document.documentElement.classList.add(CLS_FULLH);
  pushLog(sample('wave2', 'fullheight'));
}

/** 清掉所有临时状态，回到「视口驱动」的安全布局（= 改动前的行为） */
function cleanup() {
  const html = document.documentElement;
  html.classList.remove(CLS_OVERFLOW);
  html.classList.remove(CLS_FULLH);
  if (probe && probe.isConnected) probe.remove();
  probe = null;
  try {
    window.scrollTo(0, 0);
  } catch {
    /* 忽略 */
  }
}

/* ---------------- 采样 / 核心 tick ---------------- */

function sample(ev: string, act: string): Sample {
  const inner = Math.round(window.innerHeight);
  const screenH = Math.round(window.screen?.height || 0);
  return {
    t: Date.now(),
    ev,
    inner,
    screen: screenH,
    rootH: Math.round(document.getElementById('app-root')?.getBoundingClientRect().height || 0),
    vv: Math.round((window.visualViewport?.height || 0) + (window.visualViewport?.offsetTop || 0)),
    kb: 0,
    gap: screenH - inner,
    act,
  };
}

function tick(ev: string) {
  const inner = Math.round(window.innerHeight);
  const screenH = Math.round(window.screen?.height || 0);
  const vv = window.visualViewport;
  const vvH = vv ? Math.round(vv.height + vv.offsetTop) : inner;
  const kb = Math.max(0, Math.round(inner - vvH));
  if (inner > maxInner) maxInner = inner;

  const gap = Math.max(screenH - inner, maxInner - inner);
  const broken = iosStandalone && kb <= KB_MAX && gap >= BAR;
  // 缺口（少算的 62pt）与「键盘是否弹起」解耦：键盘弹起时也必须把 --vp-gap 维持
  // 在真实值，否则键盘避让看门狗的抬升公式 calc(var(--kb-h) - var(--vp-gap)) 会退化成
  // 纯 kb，弹层底边掉到键盘上沿下方 62px（出现缝隙/盖不住）。自愈状态机仍用 broken
  // （kb<=KB_MAX）门控，键盘态下不折腾 innerHeight。
  const hasGap = iosStandalone && gap >= BAR;

  // 把缺口写进 CSS 变量：模态层用 bottom:calc(var(--kb-h) - var(--vp-gap)) 把自身
  // 顶到键盘上沿 / 延长到真实屏幕底（见 index.css）。仅 iOS 主屏模式才写；桌面/
  // 标签页永远 0，否则会误把模态层推出视口。视觉已由 CSS 钉死（#app-root 100vh +
  // 模态 --vp-gap），所以这个缺陷**不影响实际显示**，这里只为顺手把 innerHeight 也扳正。
  const targetGap = hasGap ? gap : 0;
  document.documentElement.style.setProperty('--vp-gap', targetGap + 'px');

  let act = 'none';

  if (!broken) {
    /* 健康：清干净，什么都不做（正常状态下这里每 tick 只做几次类检查） */
    if (phase !== 'idle') {
      cleanup();
      phase = 'idle';
      phaseAt = 0;
      rounds = 0;
      act = 'healthy';
    }
  } else {
    const now = Date.now();
    if (phase === 'idle') {
      if (rounds >= MAX_ROUNDS) {
        phase = 'gaveup';
        act = 'gaveup';
      } else {
        rounds += 1;
        phase = 'wave1';
        phaseAt = now;
        startWave1();
        act = `wave1#${rounds}`;
      }
    } else if (phase === 'wave1') {
      if (now - phaseAt > T1_MS) {
        phase = 'wave2';
        phaseAt = now;
        startWave2();
        act = `wave2#${rounds}`;
      }
    } else if (phase === 'wave2') {
      if (now - phaseAt > T2_MS) {
        cleanup();
        phase = 'gaveup';
        act = 'gaveup';
      }
    } else {
      // gaveup：视觉已由 CSS 钉死（#app-root 100vh / 模态 --vp-gap），缺陷不影响
      // 实际显示，保持静默即可，不再弹胶囊（旧版弹「点此修复」但 reload 对该缺陷
      // 无效，纯属误导，已移除）。
      act = 'wait';
    }
  }

  const rootH = Math.round(
    document.getElementById('app-root')?.getBoundingClientRect().height || 0,
  );
  const sig = [ev, inner, screenH, rootH, vvH, kb, gap, act, broken ? 1 : 0, phase].join('|');
  if (sig !== lastSig) {
    lastSig = sig;
    pushLog({ t: Date.now(), ev, inner, screen: screenH, rootH, vv: vvH, kb, gap, act });
  }
}

/* ---------------- 事件接线 ---------------- */

/** 事件后短时间内补跑几次：iOS 的视口值更新有延迟（键盘动画几十~几百毫秒）。
 *  「键盘收起」正是本缺陷最容易发生的时刻，所以这里补跑同时驱动状态机推进。 */
function burst(ev: string) {
  tick(ev);
  burstIds.forEach((id) => window.clearTimeout(id));
  burstIds = [120, 420, 900, 1600, 2400].map((d) =>
    window.setTimeout(() => tick(ev + '+' + d), d),
  );
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
  // 键盘收起（焦点离开输入框）是缺陷的高发时刻，单独补一次长延时检查
  document.addEventListener(
    'focusout',
    () => {
      window.setTimeout(() => burst('focusout'), 160);
    },
    true,
  );

  // 保底轮询：状态卡住时不会有任何事件，靠这个兜住
  timer = window.setInterval(() => tick('tick'), 1000);

  // 首帧与启动阶段多测几次
  burst('init');
  window.setTimeout(() => tick('init+600'), 600);
  window.setTimeout(() => tick('init+1500'), 1500);

  void timer;
}

/** 供调试/测试读取日志 */
export function readViewportLog(): Sample[] {
  return readLog();
}

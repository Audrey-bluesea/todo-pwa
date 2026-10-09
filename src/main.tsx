import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { refreshSubscriptionOnLoad } from './lib/push';
import { initViewportGuard } from './lib/viewportGuard';
import { initKeyboardGuard } from './lib/keyboardGuard';

/* ============================================================
 * iOS 独立 PWA「满屏无安全区」模式：自补安全区
 * ------------------------------------------------------------
 * 真机实测（iPhone 18 Pro Max / iOS 27，440x956@3x）：
 *   apple-mobile-web-app-status-bar-style = default 时，
 *   网页区域铺满整块物理屏（innerHeight == screen.height == 956），
 *   但 WebKit 把 env(safe-area-inset-top/bottom) 都报成 0（且会抖动，
 *   实测出现过 34 ↔ 96 的跳变）→ 内容顶到状态栏下、TabBar 压在 Home 指示条上。
 *
 * ⚠️ 判定只用两个**不会变**的事实：iOS 设备 + standalone 模式。
 *    · 不要用 UA 里的 iOS 版本号：iOS 18 起被冻结成 18_x（真机报 18_7），
 *      判「>= 27」永远不成立 —— 上一版顶部规避一直没生效就是这个原因。
 *    · 不要用 env() 探针：env 值本身会抖，用它判定会导致 .ios-pwa
 *      时加时不加，表现为「TabBar 位置不稳定，杀后台重进就好」。
 *   安全区数值由 CSS 写死常量（62 / 34，真机实测值），不再读 env。
 *
 * App 根容器是 fixed inset-0，尺寸由视口直接决定，与 #root 高度无关，
 * 因此这里**不要**再用 JS 锁 #root 高度（旧做法会引入额外抖动源）。
 * ============================================================ */
function isIosStandalone(): boolean {
  try {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return false;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  } catch {
    return false;
  }
}

function applyIosPwaFullscreenGuard() {
  if (isIosStandalone()) document.documentElement.classList.add('ios-pwa');
}
applyIosPwaFullscreenGuard();

/* 顶部模糊「现场探针」：把上次选中的变体号在**首帧渲染之前**打到 <html data-topfix>，
   让页面以目标变体布局。详见 components/TopFixProbe.tsx 与 index.css 里 data-topfix 的规则。
   ⚠️ key 每次变体重排都要换（现在是 topfix6），否则用户会卡在旧编号上。 */
let SKIP_VP_GUARD = false;
try {
  const v = localStorage.getItem('xingshilu.topfix6');
  // '0' 与 '34' 都表示「新默认」（不写 data-topfix，走 --tg: 34px 那套）
  if (v && v !== '0' && v !== '34') document.documentElement.dataset.topfix = v;
  /* 变体 13 = 诊断用：完全关掉视口看门狗的两波「制造溢出」动作。
     ⚠️ 编号必须用 13：data-topfix='3' 在 CSS 里是「首行下移到 100pt」，
     两者若共用一个编号，一次点选会同时动两个变量，结果无法解释。
     怀疑点：看门狗为了让 iOS 重算视口，会在每次启动时临时把页面撑出视口
     （html.vp-overflow + 一个比视口高 120px 的探针元素）⇒ 文档变成「可滚动」。
     如果系统那层顶部模糊正是因为「页面可滚动」才出现，这个动作就会让它在
     每次启动时稳定复现 —— 而别的 PWA 没有这套看门狗，所以它们不糊。 */
  if (v === '13') SKIP_VP_GUARD = true;

  /* 变体 12：把 viewport-fit 从 cover 改成 auto（默认）。
     这是一条**机制完全不同**的路：cover 会让网页内容延伸到状态栏/安全区底下，
     从而被卷进系统状态栏那层 Liquid Glass 的合成；改成 auto 后网页不再延伸到
     安全区，系统自己画状态栏，网页内容不参与玻璃合成。
     代价：顶部会被系统的安全区留白占掉（看起来就是"顶上一条"），底部同理 ——
     所以这只作为诊断项，若它能让字变清晰，就证明方向是「别让内容进玻璃合成」。 */
  if (v === '12') {
    const vp = document.querySelector('meta[name="viewport"]');
    if (vp) {
      vp.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=auto',
      );
    }
  }
} catch {
  /* 忽略隐私模式下的存储异常 */
}

/** 是否 iOS 主屏独立模式（视口看门狗只在此时才做异常判定，避免桌面误报） */
const IOS_STANDALONE = isIosStandalone();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/* 视口看门狗：修「整块底部偶发上飘 62pt」（详见 lib/viewportGuard.ts）
   ⚠️ 探针变体 3 会跳过它（诊断用，见上方说明） */
if (!SKIP_VP_GUARD) initViewportGuard({ iosStandalone: IOS_STANDALONE });

/* 键盘避让看门狗：弹键盘时把底部弹层顶到键盘上沿，并把输入框滚进可视区
   （详见 lib/keyboardGuard.ts）。全平台运行，无键盘时视觉零变化。 */
initKeyboardGuard();

/* 双指缩放兜底：即便浏览器忽略 user-scalable=no 也拦住手势缩放 */
document.addEventListener(
  'gesturestart',
  (e) => {
    e.preventDefault();
  },
  { passive: false },
);

let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);

/* Service Worker */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', document.baseURI).href;
    navigator.serviceWorker
      .register(swUrl)
      .then(async () => {
        // SW 注册成功后刷新推送订阅，修复 iOS 因 SW 更新导致旧订阅失效、推送收不到的问题
        try { await refreshSubscriptionOnLoad(); } catch { /* 忽略 */ }
      })
      .catch(() => {
        /* 忽略注册失败（例如非 HTTPS 环境） */
      });
  });
}

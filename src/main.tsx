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

/** 是否 iOS 主屏独立模式（视口看门狗只在此时才做异常判定，避免桌面误报） */
const IOS_STANDALONE = isIosStandalone();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

/* 视口看门狗：修「整块底部偶发上飘 62pt」（详见 lib/viewportGuard.ts） */
initViewportGuard({ iosStandalone: IOS_STANDALONE });

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

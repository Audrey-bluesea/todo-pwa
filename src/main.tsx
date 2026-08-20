import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { refreshSubscriptionOnLoad } from './lib/push';

/* ============================================================
 * iOS standalone PWA 满屏根高度锁定
 * ------------------------------------------------------------
 * 根因：CSS 的 `100dvh`/`100svh`/`100%` 在 iOS standalone 下解析不稳
 * （解析到「布局视口」而非真实可视区，或首次加载取值异常），导致 #root
 * 高度未撑满 viewport → App 根容器 h-full 失效 → 整个布局按内容流排，
 * TabBar 停在内容末尾（屏幕中间），main 的 flex-1 塌陷、内部滚动容器
 * 失去高度，所有视图都滑不动。
 * 最可靠解：用 JS 将 #root 高度锁死为 window.innerHeight（standalone 下
 * 即真实可视区高度），并在旋转 / 键盘 / 视口变化时实时更新。
 * inline style 优先级高于 CSS，覆盖 index.css 里的 dvh 规则。
 * ============================================================ */
function fitRootToViewport() {
  const root = document.getElementById('root');
  if (!root) return;
  root.style.height = window.innerHeight + 'px';
  root.style.width = window.innerWidth + 'px';
}
fitRootToViewport();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fitRootToViewport);
}
window.addEventListener('resize', fitRootToViewport);
window.addEventListener('orientationchange', () => setTimeout(fitRootToViewport, 250));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', fitRootToViewport);
  window.visualViewport.addEventListener('scroll', fitRootToViewport);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

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

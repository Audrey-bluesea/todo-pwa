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

/* ============================================================
 * iOS 27 顶部玻璃渗出带规避开关
 * ------------------------------------------------------------
 * 判定：主屏 PWA（display-mode: standalone / navigator.standalone）
 *       + iOS 主版本 >= 27（Liquid Glass 状态栏开始外渗的版本）。
 * 命中后给 <html> 加 glasstop，触发 index.css 里的两条规则：
 *   1) .pt-safe 顶部多让出 --tg(36px)，把文字推到 95pt 以下；
 *   2) .tg-glow 用主题色柔光渐变填满这条带，模糊落在纯色/渐变上看不出来。
 * 未命中（桌面、Safari 内浏览、iOS 26 及更早）布局与观感完全不变。
 * ============================================================ */
function applyGlassTopGuard() {
  try {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const m = /(?:iPhone|iPad|iPod).*?OS (\d+)_/.exec(navigator.userAgent);
    const major = m ? parseInt(m[1], 10) : 0;
    if (standalone && major >= 27) {
      document.documentElement.classList.add('glasstop');
    }
  } catch {
    /* 判定失败就不加，保持原样 */
  }
}
applyGlassTopGuard();

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

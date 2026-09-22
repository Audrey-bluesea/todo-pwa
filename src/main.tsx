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
 * iOS 独立 PWA「满屏无安全区」模式的自检与自补
 * ------------------------------------------------------------
 * 真机实测（iPhone 18 Pro Max / iOS 27，440x956@3x）：
 *   apple-mobile-web-app-status-bar-style = default 时，
 *   网页区域铺满整块物理屏（innerHeight == screen.height == 956），
 *   但 WebKit 把 env(safe-area-inset-top) 与 env(safe-area-inset-bottom) 都报成 0。
 *   → 内容顶到状态栏底下、TabBar 压在 Home 指示条上。
 *   （black-translucent 的 env 值是对的 62/34，但网页只有 894 高、
 *     屏幕最下 62pt 不属于网页，贴底元素只能悬在半空 —— 所以不能用它。）
 *
 * 判定方式：**特征探测，不用 UA 版本号**。
 *   iOS 18 起 Safari 的 UA 版本号被冻结成 18_x（真机实测报 18_7），
 *   用正则判「iOS >= 27」永远判不出来，这正是上一版顶部规避一直没生效的原因。
 * 做法：放一个探针 div 实测 env(safe-area-inset-top) 的计算值。
 *   0   ⇒ 命中「满屏无安全区」模式 → 给 <html> 加 .ios-pwa，
 *         CSS 里用 max() 自补 62 / 34，并开启顶部渗出带的柔光让位。
 *   >0  ⇒ 系统给了正常安全区（iOS 26 及更早、Safari 内浏览、桌面），什么都不做。
 * ============================================================ */
function readSafeAreaInsetTop(): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;left:-9999px;top:0;width:1px;height:0;padding-top:env(safe-area-inset-top,0px)';
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  probe.remove();
  return value;
}

function applyIosPwaFullscreenGuard() {
  try {
    if (!document.body) return;
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS) return;
    if (readSafeAreaInsetTop() === 0) {
      document.documentElement.classList.add('ios-pwa');
    }
  } catch {
    /* 判定失败就保持原样 */
  }
}
applyIosPwaFullscreenGuard();

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

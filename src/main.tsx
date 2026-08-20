import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { refreshSubscriptionOnLoad } from './lib/push';

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

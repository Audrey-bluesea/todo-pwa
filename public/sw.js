/* 抹茶待办 Service Worker —— Web Push 通知 + 应用壳缓存
 *
 * 缓存策略（秒开 + 始终最新）：
 *  - 静态资源（/assets/*、图标、图片、manifest、js/css/字体）：cache-first。
 *    这些文件名由 Vite 内容哈希生成（如 index-uTkSKLT-.js），内容变则文件名变，
 *    可安全激进缓存；新版部署后旧文件天然失效、被缓存配额清理。
 *  - 导航请求（HTML）：network-first，失败回退缓存，保证永远拿到最新页面、离线也能开。
 *  - 跨域请求（推送后端 API）：不拦截，直接走网络。
 */

const CACHE = 'matcha-shell-v1';

self.addEventListener('install', (event) => {
  // 立即激活，不等待
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      // 接管所有已有页面
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  return (
    p.startsWith('/assets/') ||
    p === '/manifest.json' ||
    p.startsWith('/icons/') ||
    /\.(png|jpe?g|gif|webp|svg|woff2?|json|css|js)$/i.test(p)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 跨域（如推送后端 tencentcf.com）不缓存、不拦截
  if (url.origin !== self.location.origin) return;

  // 导航：network-first，回退缓存（离线可用，且永远拿到最新 HTML）
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const indexHtml = await caches.match('/index.html');
          return indexHtml || new Response('离线', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        }
      })(),
    );
    return;
  }

  // 静态资源：cache-first（哈希命名，安全）
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) {
            const cache = await caches.open(CACHE);
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          return cached || new Response('', { status: 504 });
        }
      })(),
    );
  }
});

/* ---------------- Web Push 推送提醒 ---------------- */

self.addEventListener('push', (event) => {
  let payload = { title: '⏰ 行时录提醒', body: '你有任务提醒', tag: 'matcha-reminder', data: { url: './' } };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === 'object') payload = parsed;
    }
  } catch (e) {
    /* 解析失败用默认文案 */
  }

  // ★ 诊断回传：推送到达 SW 时向后端打点，用于确认 Apple 是否真的把推送送到了设备
  const diagPayload = JSON.stringify({ action: 'ping', ts: Date.now(), title: payload.title, body: payload.body });
  fetch('https://1469589089-6hylzbg0m0.ap-shanghai.tencentscf.com/push-manage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: diagPayload,
  }).catch(() => {});

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: './icons/icon-512.png',
      badge: './icons/icon-192.png',
      tag: payload.tag,
      data: payload.data || { url: './' },
      // vibrate: [120, 60, 120],  // 移除：iOS 不支持 vibrate，可能导致 showNotification 静默失败
      requireInteraction: true,
    }).then(() => {
      // ★ 诊断回传：通知成功展示后也打一次点
      fetch('https://1469589089-6hylzbg0m0.ap-shanghai.tencentscf.com/push-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ping', ts: Date.now(), phase: 'shown', title: payload.title }),
      }).catch(() => {});
    }).catch((err) => {
      // ★ 诊断回传：showNotification 失败时打点（这才是关键！）
      fetch('https://1469589089-6hylzbg0m0.ap-shanghai.tencentscf.com/push-manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ping', ts: Date.now(), phase: 'error', error: String(err.message || err), title: payload.title }),
      }).catch(() => {});
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        for (const c of list) {
          if ('focus' in c) {
            c.focus();
            if (targetUrl) c.navigate(targetUrl);
            return undefined;
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        return undefined;
      }),
  );
});

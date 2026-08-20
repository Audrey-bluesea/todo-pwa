/**
 * 任务提醒推送（Web Push）
 * ----------------------------------------------------------------
 * 设计原则（红线）：
 *  1. 后端未配置（VITE_PUSH_API_BASE 为空）时，所有函数静默跳过，绝不抛错、绝不影响主流程。
 *  2. 推送订阅 / 排程失败一律 catch 吞掉，UI 照常可用。
 *  3. iOS 上的 Web Push 走 Apple 自己的 APNs 推送服务（国内可达），
 *     后端只负责「到点把推送发出去」。
 *
 * 订阅对象（endpoint + keys）随排程请求内联发给后端，不依赖服务端长期存储。
 */

// ★ 复用已验证的 VAPID 公钥（与 push-backend/.vapid-keys.json 一致，公开值）
const VAPID_PUBLIC_KEY =
  'BNcGKM-svrU4WY9Gqddq1oTgveniYNoWRqe9njPG8g7fq03t5hUj7KJ0Wpbiflclchees68MZ3YoCOWGr3NSQQk';

export interface ReminderInput {
  id: string;
  title: string;
  dueDate: Date;
  reminder: { enabled: boolean; leadMin: number };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function getApiBase(): string {
  const base = (import.meta.env.VITE_PUSH_API_BASE || '').trim();
  return base.replace(/\/+$/, '');
}

/**
 * 确保已授权通知并取得推送订阅对象。
 * - 未配置后端 / 不支持 Push / 用户拒绝 → 返回 null（静默）。
 * - 已订阅则复用，未订阅则新建。
 */
export async function ensureSubscription(): Promise<PushSubscription | null> {
  const base = getApiBase();
  if (!base) return null;
  if (!('serviceWorker' in navigator) || typeof PushManager === 'undefined') return null;

  try {
    let permission: NotificationPermission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') return null;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // iOS 的 Web Push 订阅绑定 APNs 设备令牌；系统更新 / 重装或重加 PWA 后旧令牌会失效，
    // 表现为「推送回 201 但设备收不到」。每次排程前先取消旧订阅再重新订阅，
    // 确保发给后端的永远是当前设备有效的订阅。
    if (sub) {
      try { await sub.unsubscribe(); } catch { /* 忽略取消失败，继续重建 */ }
      sub = null;
    }
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    return sub;
  } catch (e) {
    console.warn('[push] 订阅失败（不影响主流程）', e);
    return null;
  }
}

/**
 * 应用启动时刷新推送订阅（仅当通知已授权）。
 * iOS 的 Web Push 订阅绑定 Service Worker：一旦 SW 更新（重部署前端）旧订阅即失效，
 * 表现为「推送回 201 但设备收不到」。每次启动都先取消旧订阅再重建，
 * 保证后端拿到的总是当前 SW / 当前设备有效的订阅。
 */
export async function refreshSubscriptionOnLoad(): Promise<void> {
  try {
    if (Notification.permission !== 'granted') return;
    const base = getApiBase();
    if (!base) return;
    if (!('serviceWorker' in navigator) || typeof PushManager === 'undefined') return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      try { await sub.unsubscribe(); } catch { /* 忽略 */ }
      sub = null;
    }
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    await fetch(`${base}/push-manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', subscription: sub.toJSON() }),
    });
  } catch (e) {
    console.warn('[push] 启动时刷新订阅失败（不影响主流程）', e);
  }
}

/**
 * 排程一条提醒：把订阅 + 触发时间发给后端。
 * 后端以 tag(=todo.id) 为唯一键 upsert，重复调用即更新。
 */
export async function scheduleReminder(todo: ReminderInput): Promise<void> {
  const base = getApiBase();
  if (!base) return;
  if (!todo.reminder?.enabled || !todo.dueDate) return;

  const sub = await ensureSubscription();
  if (!sub) return;

  const fireAt = todo.dueDate.getTime() - todo.reminder.leadMin * 60_000;
  // 通知版式：iOS 会自动把「应用名」作为通知第一行显示。
  // 因此 title 必须留空——一旦写入 title，iOS 会额外渲染出 "from 行时录" 一行，
  // 造成「行时录提醒 / from 行时录 / 任务名」三行且首尾重复。
  // title 留空 + body 写任务标题 ⇒ 恰好两行：「行时录」/「任务标题」。
  const payload = {
    action: 'schedule',
    tag: todo.id,
    title: '',
    body: todo.title,
    fireAt,
    subscription: sub.toJSON(),
  };

  try {
    await fetch(`${base}/push-manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('[push] 排程请求失败（不影响主流程）', e);
  }
}

/** 取消一条提醒（删除/关闭提醒时调用）。 */
export async function cancelReminder(tag: string): Promise<void> {
  const base = getApiBase();
  if (!base) return;
  try {
    await fetch(`${base}/push-manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', tag }),
    });
  } catch (e) {
    console.warn('[push] 取消请求失败（不影响主流程）', e);
  }
}

/**
 * Web Push 发送模块 —— 改用业界验证的 `web-push` 库。
 *
 * 之前自写 RFC8291/aes128gcm 加密，在 Apple 网关（web.push.apple.com）上表现为
 * 「返回 201 但设备收不到（静默丢弃）」。交叉验证证明：用 web-push 库发同样的
 * VAPID 密钥 + 同一订阅，设备能正常收到并弹出通知。
 *
 * 因此这里直接复用 web-push，去掉所有手搓加密逻辑，彻底消除该 bug。
 * 对外接口保持不变：sendWebPush(vapidPrivateJwk, vapidPublicKey, sub, title, body, tag)
 */
const webpush = require('web-push');

const VAPID_SUBJECT = 'mailto:reminder@matcha.app';
let configured = false;

function ensureConfig(publicKeyB64, privateScalarB64) {
  if (configured) return;
  webpush.setVapidDetails(VAPID_SUBJECT, publicKeyB64, privateScalarB64);
  configured = true;
}

/**
 * @param {object} vapidPrivateJwk VAPID 私钥 JWK（含 .d）
 * @param {string} vapidPublicKey  VAPID 公钥（base64url，65 字节非压缩）
 * @param {{endpoint:string, keys:{p256dh:string, auth:string}}} sub 浏览器订阅对象
 */
async function sendWebPush(vapidPrivateJwk, vapidPublicKey, sub, title, body, tag) {
  // web-push 的私钥参数接收 base64url 编码的原始 32 字节私钥标量，JWK 的 .d 正是它。
  ensureConfig(vapidPublicKey, vapidPrivateJwk.d);

  // title 空字符串是合法且有意的：iOS 通知会自动以「应用名」作为第一行，
  // 若再写 title 就会多出 "from 应用名" 一行。故这里不做 `||` 回退。
  const payload = JSON.stringify({
    title: typeof title === 'string' ? title : '',
    body: body || '',
    tag,
    data: { url: './', taskId: tag },
  });

  try {
    const resp = await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: 'normal' });
    // web-push 在 2xx 时 resolve，返回 { statusCode, body, headers }
    return { status: resp.statusCode || 201, statusText: '', body: '' };
  } catch (e) {
    // web-push 在非 2xx（含 404/410 订阅失效、429 限流）时 reject，带 e.statusCode
    const status = e.statusCode || 0;
    const err = new Error(e.body || e.message || 'web-push send failed');
    err.status = status;
    throw err;
  }
}

module.exports = { sendWebPush };

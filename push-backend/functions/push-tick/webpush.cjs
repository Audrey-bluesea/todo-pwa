/**
 * Web Push 加密发送模块（RFC 8291 密钥协商 + RFC 8188 aes128gcm 内容编码）
 * 纯 Node 实现，无第三方依赖，使用 Web Crypto（Node 18+ 内置）。
 * 逻辑与已验证的 Deno 版本一致。
 */
const { webcrypto } = require('node:crypto');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const crypto = globalThis.crypto;

function utf8(s) {
  return new TextEncoder().encode(s);
}

function concatBytes(...arrs) {
  const total = arrs.reduce((a, b) => a + b.length, 0);
  const r = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) {
    r.set(a, o);
    o += a.length;
  }
  return r;
}

function base64UrlDecode(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function btoaUrlSafe(buf) {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function hmacSha256(key, msg) {
  const keyObj = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', keyObj, msg);
  return new Uint8Array(sig);
}

// HKDF-Expand
async function hkdfExpand(prk, info, len) {
  const blocks = Math.ceil(len / 32);
  const out = new Uint8Array(blocks * 32);
  let prev = new Uint8Array(0);
  for (let i = 1; i <= blocks; i++) {
    const t = await hmacSha256(prk, concatBytes(prev, info, new Uint8Array([i])));
    out.set(t, (i - 1) * 32);
    prev = t;
  }
  return out.slice(0, len);
}

// VAPID JWT（ES256），用 JWK 直接导入私钥
async function createVapidJwt(jwk, audience) {
  const now = Math.floor(Date.now() / 1000);
  const header = btoaUrlSafe(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = btoaUrlSafe(
    utf8(JSON.stringify({ aud: new URL(audience).origin, exp: now + 3600, sub: 'mailto:reminder@matcha.app' })),
  );
  const signingInput = utf8(`${header}.${payload}`);
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: jwk.d, x: jwk.x, y: jwk.y },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, signingInput),
  );
  return `${header}.${payload}.${btoaUrlSafe(signature)}`;
}

// 生成 aes128gcm body
async function pushEncrypt(serverPriv, serverPubRaw, userPubRaw, authSecret, payload) {
  const userPub = await crypto.subtle.importKey(
    'raw',
    userPubRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const sharedBits = await crypto.subtle.deriveBits({ name: 'ECDH', public: userPub }, serverPriv, 256);
  const sharedSecret = new Uint8Array(sharedBits);

  const prk = await hmacSha256(authSecret, sharedSecret);

  const info = concatBytes(
    utf8('P-256'),
    new Uint8Array([0x00]),
    new Uint8Array([userPubRaw.length]),
    userPubRaw,
    new Uint8Array([serverPubRaw.length]),
    serverPubRaw,
  );

  const ikm = await hkdfExpand(prk, info, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const cek = await hkdfExpand(
    ikm,
    concatBytes(utf8('Content-Encoding: aes128gcm'), new Uint8Array([0x00]), salt),
    16,
  );
  const nonce = await hkdfExpand(
    ikm,
    concatBytes(utf8('Content-Encoding: nonce'), new Uint8Array([0x00]), salt),
    12,
  );

  const plaintext = concatBytes(payload, new Uint8Array([0x00, 0x02]));
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: new Uint8Array(0) }, cekKey, plaintext),
  );

  const rs = ciphertext.length;
  const rsBuf = new Uint8Array([(rs >>> 24) & 0xff, (rs >>> 16) & 0xff, (rs >>> 8) & 0xff, rs & 0xff]);
  return concatBytes(salt, rsBuf, new Uint8Array([0x00]), ciphertext);
}

/**
 * 向一个订阅发送 Web Push。
 * @param {object} vapidPrivateJwk VAPID 私钥 JWK
 * @param {string} vapidPublicKey VAPID 公钥（base64url）
 * @param {{endpoint:string, keys:{p256dh:string, auth:string}}} sub 浏览器订阅对象
 */
async function sendWebPush(vapidPrivateJwk, vapidPublicKey, sub, title, body, tag) {
  const payload = JSON.stringify({
    title: '⏰ 行时录提醒',
    body,
    tag,
    data: { url: './', taskId: tag },
  });
  const userPubRaw = base64UrlDecode(sub.keys.p256dh);
  const authSecret = base64UrlDecode(sub.keys.auth);

  const ecdh = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ecdh.publicKey));
  const encrypted = await pushEncrypt(ecdh.privateKey, serverPubRaw, userPubRaw, authSecret, utf8(payload));

  const jwt = await createVapidJwt(vapidPrivateJwk, sub.endpoint);
  const headers = {
    TTL: '3600',
    'Content-Encoding': 'aes128gcm',
    Urgency: 'normal',
    Authorization: `vapid t=${jwt}`,
    'Crypto-Key': `dh=${btoaUrlSafe(serverPubRaw)},p256ecdsa=${vapidPublicKey}`,
  };

  const resp = await fetch(sub.endpoint, { method: 'POST', headers, body: encrypted });
  const rb = await resp.text().catch(() => '');
  return { status: resp.status, statusText: resp.statusText, body: rb };
}

module.exports = { sendWebPush };

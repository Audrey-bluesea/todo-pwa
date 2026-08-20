/**
 * push-manage —— 单函数方案（无数据库）
 * 同时承担：
 *   1) HTTP 触发：前端注册订阅 / 排程提醒 / 取消提醒
 *   2) 定时触发（每分钟）：扫描到期提醒并发送 Web Push
 * 提醒清单持久化在「函数自身的环境变量 PUSH_REGISTRY」中（零账单 / 零外部依赖）。
 * 关键可靠性设计：
 *   - 每次读取都通过 GetFunction 取「最新」环境变量，避免温实例 process.env 过期导致的脏读；
 *   - 写回通过 UpdateFunctionConfiguration（自带多次退避重试）；
 *   - 发送成功后写入 lastSent 冷却时间戳，避免 Updating 窗口内重复推送。
 */
const crypto = require('node:crypto');
const { sendWebPush } = require('./webpush.cjs');

const TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID;
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const MY_ENV_ID = process.env.MY_ENV_ID;
const MY_FUNC_NAME = process.env.MY_FUNC_NAME;
const RESEND_COOLDOWN_MS = 10 * 60 * 1000; // 同一提醒 10 分钟内不重复发送

// ---- 最小化腾讯云 API v3 调用（TC3-HMAC-SHA256 签名）----
function sha256hex(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function hmac(secret, msg) { return crypto.createHmac('sha256', secret).update(msg, 'utf8').digest(); }
function hmacHex(secret, msg) { return crypto.createHmac('sha256', secret).update(msg, 'utf8').digest('hex'); }

async function scfCall(action, payload) {
  const host = 'scf.tencentcloudapi.com';
  const service = 'scf';
  const region = 'ap-shanghai';
  const version = '2018-04-16';
  const contentType = 'application/json; charset=utf-8';
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payloadStr = JSON.stringify(payload);

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256hex(payloadStr)}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256hex(canonicalRequest)}`;
  const secretDate = hmac(`TC3${TENCENT_SECRET_KEY}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = hmacHex(secretSigning, stringToSign);
  const authorization = `TC3-HMAC-SHA256 Credential=${TENCENT_SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const resp = await fetch(`https://${host}`, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      Host: host,
      'X-TC-Action': action,
      'X-TC-Region': region,
      'X-TC-Version': version,
      'X-TC-Timestamp': String(timestamp),
      Authorization: authorization,
    },
    body: payloadStr,
  });
  const json = await resp.json();
  if (json.Response && json.Response.Error) {
    const e = new Error(json.Response.Error.Message);
    e.code = json.Response.Error.Code;
    throw e;
  }
  return json.Response;
}

// ---- 环境变量读取（每次都实时取最新，杜绝温实例内存缓存导致的脏读）----
async function loadEnv() {
  let current = {};
  try {
    const r = await scfCall('GetFunction', { FunctionName: MY_FUNC_NAME, Namespace: MY_ENV_ID });
    (r.Environment && r.Environment.Variables || []).forEach((v) => { current[v.Key] = v.Value; });
  } catch (e) {
    current = { ...process.env };
    console.log('[loadEnv] GetFunction 失败，回退 process.env:', e.code || e.message);
  }
  const registry = (() => { try { const a = JSON.parse(current.PUSH_REGISTRY || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } })();
  const sub = (() => { try { return JSON.parse(current.PUSH_SUB || 'null'); } catch { return null; } })();
  return { registry, sub, raw: current };
}
async function getRegistry() { return (await loadEnv()).registry; }
async function getSub() { return (await loadEnv()).sub; }

/**
 * 把 updates 合并进函数全部环境变量并写回自身。
 * UpdateFunctionConfiguration 会令函数短暂进入 Updating，需多次退避重试才能落盘。
 */
async function saveEnv(updates) {
  if (process.env.DRY_RUN === '1') {
    console.log('[saveEnv DRY_RUN] would save:', JSON.stringify(updates).slice(0, 200));
    Object.assign(process.env, updates);
    return;
  }
  const MAX = 10;
  for (let attempt = 0; attempt < MAX; attempt++) {
    let current = {};
    try {
      const r = await scfCall('GetFunction', { FunctionName: MY_FUNC_NAME, Namespace: MY_ENV_ID });
      (r.Environment && r.Environment.Variables || []).forEach((v) => { current[v.Key] = v.Value; });
    } catch (e) {
      current = { ...process.env };
    }
    const merged = { ...current, ...updates };
    const Variables = Object.entries(merged)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([Key, Value]) => ({ Key, Value: String(Value) }));
    try {
      await scfCall('UpdateFunctionConfiguration', {
        FunctionName: MY_FUNC_NAME,
        Namespace: MY_ENV_ID,
        Environment: { Variables },
      });
      return;
    } catch (e) {
      const isUpdating = /Updating/i.test(e.message || '');
      console.error(`[saveEnv] attempt ${attempt + 1}/${MAX} 失败:`, e.code, e.message);
      if (attempt === MAX - 1) throw e;
      await new Promise((r) => setTimeout(r, isUpdating ? 5000 : 2000));
    }
  }
}

// ---- HTTP 响应 ----
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function res(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...cors }, body: JSON.stringify(obj) };
}

// ---- 实时读取 VAPID 密钥（避免温实例 process.env 快照与最新配置不一致）----
async function getVapidKeys() {
  let current = {};
  try {
    const r = await scfCall('GetFunction', { FunctionName: MY_FUNC_NAME, Namespace: MY_ENV_ID });
    (r.Environment && r.Environment.Variables || []).forEach((v) => { current[v.Key] = v.Value; });
  } catch (e) {
    current = { ...process.env };
  }
  return { jwk: current.VAPID_PRIVATE_JWK, pub: current.VAPID_PUBLIC_KEY };
}

// ---- 核心：发送一条提醒 ----
async function fireReminder(entry, sub) {
  const { jwk, pub } = await getVapidKeys();
  if (!jwk || !pub) throw new Error('VAPID 密钥缺失');
  // ---- 通知版式归一化（定时器与 send-now 的唯一出口，改这里即可全覆盖）----
  // iOS 会自动把「应用名」渲染成通知第一行。若我们再写 title，iOS 会额外多出
  // 一行 "from 行时录"，最终变成三行且首尾重复：
  //     行时录提醒 / from 行时录 / ⏰ 吃药
  // 所以强制 title 为空、body 只放任务标题，得到期望的恰好两行：
  //     行时录 / 吃药
  // 同时兼容历史 registry 数据（旧前端存的 body 形如 "⏰ 吃药"），去掉前缀闹钟 emoji。
  const rawBody = typeof entry.body === 'string' ? entry.body : '';
  const body = rawBody.replace(/^[\s⏰]+/, '').trim() || '任务提醒';
  return sendWebPush(JSON.parse(jwk), pub, sub, '', body, entry.tag);
}

// ---- 定时扫描（每分钟）----
async function runTimer() {
  const now = Date.now();
  // 心跳：仅用于确认 TCB 定时器是否真的在调用本函数（验证用，可保留无害）
  try { await saveEnv({ PUSH_HEARTBEAT: String(now) }); } catch (e) { /* ignore */ }
  const sub = await getSub();
  const registry = await getRegistry();
  const due = registry.filter(
    (r) => r.status !== 'sent'
      && r.fireAt <= now
      && now - (r.lastSent || 0) > RESEND_COOLDOWN_MS,
  );
  console.log(`[timer] now=${now} total=${registry.length} due=${due.length} hasSub=${!!sub}`);
  if (!sub) {
    return { scanned: true, sent: 0, skipped: due.length, reason: 'no-subscription' };
  }
  const results = [];
  let lastSendInfo = null;
  for (const entry of due) {
    try {
      const r = await fireReminder(entry, sub);
      results.push({ tag: entry.tag, status: r.status, ok: r.status >= 200 && r.status < 300 });
      entry.status = 'sent';
      entry.lastSent = now;
      lastSendInfo = { tag: entry.tag, status: r.status, ts: now };
      console.log(`[timer] sent tag=${entry.tag} -> HTTP ${r.status}`);
    } catch (e) {
      entry.failCount = (entry.failCount || 0) + 1;
      entry.lastSent = now; // 冷却，避免 Updating 窗口内疯狂重发
      if (entry.failCount >= 5) entry.status = 'failed';
      lastSendInfo = { tag: entry.tag, error: String(e.message), ts: now };
      console.error(`[timer] send failed tag=${entry.tag} (fail#${entry.failCount}):`, e.message);
      results.push({ tag: entry.tag, ok: false, error: String(e.message) });
    }
  }
  if (lastSendInfo) {
    try { await saveEnv({ PUSH_LAST_SEND: JSON.stringify(lastSendInfo) }); } catch (e) { /* ignore */ }
  }
  const pruned = registry.filter(
    (r) => r.status !== 'sent' && r.fireAt > now - 7 * 24 * 3600 * 1000,
  );
  if (pruned.length !== registry.length) {
    try { await saveEnv({ PUSH_REGISTRY: JSON.stringify(pruned) }); }
    catch (e) { console.error('[timer] 写回 REGISTRY 失败:', e.message); }
  }
  return { scanned: true, sent: results.length, results };
}

// ---- HTTP 处理 ----
async function handleHttp(event) {
  if (event.httpMethod === 'OPTIONS') return res(204, {});
  if (event.httpMethod !== 'POST') return res(405, { ok: false, error: 'method-not-allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return res(400, { ok: false, error: 'bad-json' }); }
  const { action, tag } = body;

  try {
    if (action === 'register') {
      const sub = body.subscription;
      if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
        return res(400, { ok: false, error: 'bad-subscription' });
      }
      await saveEnv({ PUSH_SUB: JSON.stringify(sub) });
      return res(200, { ok: true });
    }

    if (action === 'schedule') {
      const { subscription, fireAt, title, body: pushBody } = body;
      if (!fireAt || !tag) return res(400, { ok: false, error: 'bad-payload' });
      if (subscription && subscription.endpoint) {
        await saveEnv({ PUSH_SUB: JSON.stringify(subscription) });
      }
      const registry = await getRegistry();
      const idx = registry.findIndex((r) => r.tag === tag);
      // 注意：title 允许为空字符串（iOS 通知版式依赖空 title 才不会多出 "from 应用名" 一行），
      // 所以这里只在字段缺失（undefined/null）时才回退，不能用 `||`。
      const entry = { tag, fireAt: Number(fireAt), title: typeof title === 'string' ? title : '待办提醒', body: pushBody || '', status: 'pending' };
      if (idx >= 0) registry[idx] = entry; else registry.push(entry);
      const json = JSON.stringify(registry);
      if (json.length > 3500) {
        return res(413, { ok: false, error: 'registry-full', hint: '提醒数量过多，请先清理已完成的提醒' });
      }
      await saveEnv({ PUSH_REGISTRY: json });
      return res(200, { ok: true, nextFireAt: entry.fireAt, hasSubscription: !!(await getSub()) });
    }

    if (action === 'cancel') {
      if (!tag) return res(400, { ok: false, error: 'bad-payload' });
      const registry = (await getRegistry()).filter((r) => r.tag !== tag);
      await saveEnv({ PUSH_REGISTRY: JSON.stringify(registry) });
      return res(200, { ok: true });
    }

    if (action === 'status') {
      const env = await loadEnv();
      const registry = env.registry;
      let lastSend = null;
      try { lastSend = env.raw.PUSH_LAST_SEND ? JSON.parse(env.raw.PUSH_LAST_SEND) : null; } catch { /* ignore */ }
      let pings = [];
      try { pings = JSON.parse(env.raw.PUSH_PINGS || '[]'); } catch { /* ignore */ }
      return res(200, { ok: true, hasSubscription: !!env.sub, count: registry.length, registry, now: Date.now(), lastSend, pings, rawEnv: env.raw });
    }

    if (action === 'tick') {
      const r = await runTimer();
      return res(200, { ok: true, ...r });
    }

    if (action === 'send-now') {
      const sub = await getSub();
      if (!sub) return res(400, { ok: false, error: 'no-subscription' });
      const registry = await getRegistry();
      const targets = tag ? registry.filter((r) => r.tag === tag) : registry.filter((r) => r.status === 'pending');
      const results = [];
      for (const entry of targets) {
        try { const r = await fireReminder(entry, sub); results.push({ tag: entry.tag, status: r.status }); entry.status = 'sent'; entry.lastSent = Date.now(); }
        catch (e) { results.push({ tag: entry.tag, error: String(e.message) }); }
      }
      const pruned = registry.filter((r) => r.status !== 'sent');
      if (pruned.length !== registry.length) await saveEnv({ PUSH_REGISTRY: JSON.stringify(pruned) });
      return res(200, { ok: true, results });
    }

    if (action === 'ping') {
      // SW 诊断回传：记录推送是否到达设备 / showNotification 是否成功
      const ping = { ts: body.ts, phase: body.phase || 'received', title: body.title || '', error: body.error || '' };
      try {
        const env = await loadEnv();
        const pings = (() => { try { return JSON.parse(env.raw.PUSH_PINGS || '[]'); } catch { return []; } })();
        pings.push(ping);
        if (pings.length > 20) pings.splice(0, pings.length - 20); // 只保留最近 20 条
        await saveEnv({ PUSH_PINGS: JSON.stringify(pings) });
      } catch { /* ignore */ }
      return res(200, { ok: true });
    }

    return res(400, { ok: false, error: 'unknown-action' });
  } catch (e) {
    console.error('[http] error', e);
    return res(500, { ok: false, error: String(e.message || e) });
  }
}

exports.main = async (event) => {
  // 定时触发器无 httpMethod；HTTP 触发带 httpMethod
  if (event && event.httpMethod) return handleHttp(event);
  return runTimer();
};

module.exports.scfCall = scfCall;

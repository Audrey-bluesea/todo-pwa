/**
 * push-tick —— 定时触发器（每分钟一次）
 * 扫描 reminders 集合中 status='pending' 且 fireAt<=now 的提醒，逐条发送 Web Push。
 * 发送成功标记 sent；订阅过期(410)标记 expired；其它错误留待下轮重试。
 */
const tcb = require('@cloudbase/node-sdk');
// 经 SCF API 直接建的函数不会注入 TCB 环境变量，必须显式指定环境 ID
const TCB_ENV = process.env.TCB_ENV || 'todo-d1g2t6903e3fcfef5';
const app = tcb.init({ env: TCB_ENV });
const db = app.database();
const { sendWebPush } = require('./webpush.cjs');

const VAPID_PRIVATE_JWK = JSON.parse(process.env.VAPID_PRIVATE_JWK || '{}');
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';

exports.main = async () => {
  const now = Date.now();
  const $ = db.command;

  let due;
  try {
    due = await db
      .collection('reminders')
      .where({ status: 'pending', fireAt: $.lte(now) })
      .limit(50)
      .get();
  } catch (e) {
    console.error('[push-tick] query error', e);
    return { ok: false, error: String(e) };
  }

  const list = due.data || [];
  let sent = 0;
  let expired = 0;
  let failed = 0;

  for (const r of list) {
    try {
      const result = await sendWebPush(
        VAPID_PRIVATE_JWK,
        VAPID_PUBLIC_KEY,
        r.subscription,
        r.title || '待办提醒',
        r.body || '',
        r.tag,
      );
      if (result.status === 201 || result.status === 200) {
        await db.collection('reminders').doc(r.tag).update({ status: 'sent' });
        sent++;
      } else if (result.status === 410) {
        await db.collection('reminders').doc(r.tag).update({ status: 'expired' });
        expired++;
      } else {
        console.warn('[push-tick] 非预期状态', result.status, result.statusText);
        failed++;
      }
    } catch (e) {
      console.error('[push-tick] send error', e);
      failed++;
    }
  }

  return { ok: true, total: list.length, sent, expired, failed };
};

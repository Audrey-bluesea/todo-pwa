/**
 * 用腾讯云 SCF API 直接部署 CloudBase 函数（无数据库单函数方案）
 * 只部署一个 push-manage：HTTP 接口 + 每分钟定时扫描，提醒清单存自身环境变量。
 * 用法: TENCENT_SECRET_ID=xxx TENCENT_SECRET_KEY=yyy node deploy-via-api.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const tencentcloud = require('tencentcloud-sdk-nodejs');

const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const ENV_ID = 'todo-d1g2t6903e3fcfef5';
const REGION = 'ap-shanghai';
const FUNC = 'push-manage';

const scf = tencentcloud.scf.v20180416.Client;
const client = new scf({
  credential: { secretId: SECRET_ID, secretKey: SECRET_KEY },
  region: REGION,
  profile: { httpProfile: { endpoint: 'scf.tencentcloudapi.com' } },
});

const cam = tencentcloud.cam.v20190116.Client;
const camClient = new cam({
  credential: { secretId: SECRET_ID, secretKey: SECRET_KEY },
  region: REGION,
  profile: { httpProfile: { endpoint: 'cam.tencentcloudapi.com' } },
});

async function ensureTcbRole() {
  const ROLE_NAME = 'TCB_QcsRole';
  const trustPolicy = JSON.stringify({
    version: '2.0',
    statement: [{ action: 'name/sts:AssumeRole', effect: 'allow', principal: { service: 'scf.qcloud.com' } }],
  });
  try {
    await camClient.CreateRole({ RoleName: ROLE_NAME, PolicyDocument: trustPolicy, Description: 'TCB 云函数执行角色' });
    console.log(`✅ 创建角色 ${ROLE_NAME}`);
  } catch (e) {
    if (/already exists|已存在|ResourceInUse|RoleNameInUse/i.test(e.message || '') || (e.code || '').includes('RoleNameInUse') || e.code === 'ResourceInUse') {
      console.log(`⚠️  角色 ${ROLE_NAME} 已存在，跳过`);
    } else throw e;
  }
  try {
    await camClient.AttachRolePolicy({ AttachRoleName: ROLE_NAME, PolicyName: 'QcloudTCBFullAccess' });
    console.log(`✅ 角色 ${ROLE_NAME} 已绑定 QcloudTCBFullAccess`);
  } catch (e) {
    if (/already|ResourceInUse|InvalidParameter/i.test(e.message || '')) console.log(`⚠️  策略已绑定，跳过`);
    else console.log('⚠️  绑定策略返回:', e.code, e.message);
  }
}

const vapid = JSON.parse(fs.readFileSync(path.join(__dirname, '.vapid-keys.json'), 'utf8'));
const ENV_VARS = [
  { Key: 'VAPID_PUBLIC_KEY', Value: vapid.VAPID_PUBLIC_KEY },
  { Key: 'VAPID_PRIVATE_JWK', Value: JSON.stringify(vapid.VAPID_PRIVATE_JWK) },
  { Key: 'VAPID_SUB', Value: vapid.VAPID_SUB || 'mailto:reminder@matcha.app' },
  { Key: 'PUSH_REGISTRY', Value: '[]' },
  { Key: 'PUSH_SUB', Value: '' },
  { Key: 'MY_ENV_ID', Value: ENV_ID },
  { Key: 'MY_FUNC_NAME', Value: FUNC },
  { Key: 'TENCENT_SECRET_ID', Value: SECRET_ID },
  { Key: 'TENCENT_SECRET_KEY', Value: SECRET_KEY },
];

function buildZip() {
  const dir = path.join(__dirname, 'functions', FUNC);
  const zipPath = path.join(__dirname, `${FUNC}.zip`);
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  // 打包运行所需文件 + web-push 依赖（node_modules）
  execSync(`cd "${dir}" && zip -r -q "${zipPath}" index.js webpush.cjs node_modules`, { stdio: 'ignore' });
  console.log(`✅ 打包 ${FUNC}.zip`);
  return fs.readFileSync(zipPath).toString('base64');
}

async function deployFunction(zipB64) {
  const base = {
    FunctionName: FUNC,
    Code: { ZipFile: zipB64 },
    Handler: 'index.main',
    Runtime: 'Nodejs20.19',
    Namespace: ENV_ID,
    MemorySize: 128,
    Timeout: 60,
    Role: 'TCB_QcsRole',
    Stamp: 'MINI_QCBASE',
    Environment: { Variables: ENV_VARS },
    Description: '任务提醒后端(单函数/无数据库): HTTP 排程 + 每分钟定时推送',
  };
  try {
    await client.CreateFunction(base);
    console.log(`✅ 创建函数 ${FUNC} 成功`);
  } catch (e) {
    if (e.code === 'ResourceInUse' || /already exists|已存在/i.test(e.message || '')) {
      console.log(`⚠️  ${FUNC} 已存在，更新代码与环境变量`);
      // 已上线后重新部署：保留用户已有的提醒数据（PUSH_REGISTRY / PUSH_SUB），只更新代码与系统变量
      const override = {};
      try {
        const cur = await client.GetFunction({ FunctionName: FUNC, Namespace: ENV_ID });
        const vars = (cur.Environment && cur.Environment.Variables) || [];
        const map = {};
        vars.forEach((v) => { map[v.Key] = v.Value; });
        if (map.PUSH_REGISTRY) override.PUSH_REGISTRY = map.PUSH_REGISTRY;
        if (map.PUSH_SUB) override.PUSH_SUB = map.PUSH_SUB;
      } catch (err) {
        console.log('⚠️  读取现有环境变量失败，将用空默认值（提醒数据会被清空，请谨慎）', err.code || err.message);
      }
      const updateVars = ENV_VARS.map((v) => (override[v.Key] !== undefined ? { ...v, Value: override[v.Key] } : v));
      // 定时器每分钟会写回环境变量导致函数短暂 Updating，UpdateFunctionCode 需多次退避重试才能落盘
      let codeOk = false;
      for (let i = 0; i < 15 && !codeOk; i++) {
        try {
          await client.UpdateFunctionCode({ FunctionName: FUNC, EnvId: ENV_ID, ZipFile: zipB64, Handler: 'index.main' });
          codeOk = true;
        } catch (err) {
          if (/Updating/i.test(err.message || '')) {
            console.log(`   (UpdateFunctionCode 遇 Updating，第${i + 1}次重试 6s 后)...`);
            await new Promise((r) => setTimeout(r, 6000));
          } else throw err;
        }
      }
      // 等函数退出 Updating 状态再更新环境变量
      await new Promise((r) => setTimeout(r, 8000));
      let ok = false;
      for (let i = 0; i < 5 && !ok; i++) {
        try {
          await client.UpdateFunctionConfiguration({ FunctionName: FUNC, Namespace: ENV_ID, Environment: { Variables: updateVars } });
          ok = true;
        } catch (err) {
          if (/Updating/i.test(err.message || '')) {
            console.log(`   (函数仍在更新，第${i + 1}次重试 5s 后)...`);
            await new Promise((r) => setTimeout(r, 5000));
          } else throw err;
        }
      }
      console.log(`✅ ${FUNC} 代码与环境变量已更新（已保留现有提醒数据）`);
    } else throw e;
  }
}

async function listTriggers() {
  try {
    const r = await client.ListTriggers({ FunctionName: FUNC, Namespace: ENV_ID, Limit: 100, Offset: 0 });
    return r.Triggers || [];
  } catch (e) {
    console.log('⚠️  ListTriggers 失败:', e.code, e.message);
    return [];
  }
}

async function ensureHttpTrigger() {
  const triggers = await listTriggers();
  if (triggers.some((t) => t.Type === 'http' || t.Type === 'apigw' || (t.TriggerDesc || '').includes('AuthType'))) {
    console.log('⚠️  HTTP 触发已存在，跳过');
    return;
  }
  try {
    await client.CreateTrigger({
      FunctionName: FUNC,
      Namespace: ENV_ID,
      TriggerName: `${FUNC}-http`,
      Type: 'http',
      TriggerDesc: JSON.stringify({ AuthType: 'NONE', NetConfig: { EnableIntranet: false, EnableExtranet: true } }),
    });
    console.log('✅ HTTP 触发创建成功(公开)');
  } catch (e) {
    if (/already exists|已存在|ResourceInUse/i.test(e.message || '')) console.log('⚠️  HTTP 触发已存在，跳过');
    else throw e;
  }
}

async function ensureTimerTrigger() {
  const triggers = await listTriggers();
  if (triggers.some((t) => t.Type === 'timer')) {
    console.log('⚠️  定时触发器已存在，跳过');
    return;
  }
  try {
    await client.CreateTrigger({
      FunctionName: FUNC,
      Namespace: ENV_ID,
      TriggerName: `${FUNC}-tick`,
      Type: 'timer',
      TriggerDesc: '0 0/1 * * * * *',
      Enable: 'OPEN',
    });
    console.log('✅ 定时触发器创建成功 (每分钟)');
  } catch (e) {
    if (/already exists|已存在|ResourceInUse/i.test(e.message || '')) console.log('⚠️  定时触发器已存在，跳过');
    else throw e;
  }
}

async function cleanupOld() {
  try {
    await client.DeleteFunction({ FunctionName: 'push-tick', Namespace: ENV_ID });
    console.log('✅ 旧函数 push-tick 已删除（含其定时触发器）');
  } catch (e) {
    if (/ResourceNotFound|not found|已存在|不存在/i.test(e.message || '') || e.code === 'ResourceNotFound') {
      console.log('⚠️  push-tick 不存在，跳过');
    } else {
      console.log('⚠️  删除 push-tick 返回:', e.code, e.message);
    }
  }
}

(async () => {
  console.log('=== 部署 CloudBase 提醒后端（单函数 / 无数据库）===\n');
  await ensureTcbRole();
  const zip = buildZip();
  await deployFunction(zip);
  await ensureHttpTrigger();
  await ensureTimerTrigger();
  await cleanupOld();
  console.log('\n=== 部署完成 ===');
  console.log('下一步：用 deploy-check.cjs 验证 HTTP 触发地址与写回逻辑。');
})().catch((e) => {
  console.error('❌ 部署失败:', e.code, e.message);
  process.exit(1);
});

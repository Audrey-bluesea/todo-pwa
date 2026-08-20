/**
 * 重新打包两个函数并 UpdateFunctionCode（不重建函数，只更新代码）
 * 用法: TENCENT_SECRET_ID=xxx TENCENT_SECRET_KEY=xxx node update-code.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const tencentcloud = require('tencentcloud-sdk-nodejs');

const SECRET_ID = process.env.TENCENT_SECRET_ID;
const SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const ENV_ID = 'todo-d1g2t6903e3fcfef5';
const REGION = 'ap-shanghai';

const scf = tencentcloud.scf.v20180416.Client;
const client = new scf({
  credential: { secretId: SECRET_ID, secretKey: SECRET_KEY },
  region: REGION,
  profile: { httpProfile: { endpoint: 'scf.tencentcloudapi.com' } },
});

const vapid = JSON.parse(fs.readFileSync(path.join(__dirname, '.vapid-keys.json'), 'utf8'));
const ENV_VARS = [
  { Key: 'VAPID_PUBLIC_KEY', Value: vapid.VAPID_PUBLIC_KEY },
  { Key: 'VAPID_PRIVATE_JWK', Value: JSON.stringify(vapid.VAPID_PRIVATE_JWK) },
  { Key: 'VAPID_SUB', Value: vapid.VAPID_SUB || 'mailto:reminder@matcha.app' },
];

function buildZip(funcName) {
  const dir = path.join(__dirname, 'functions', funcName);
  const zipPath = path.join(__dirname, `${funcName}.zip`);
  // 排除旧 zip，确保包含最新 index.js + node_modules
  execSync(`cd "${dir}" && rm -f "${zipPath}" && zip -r -X "${zipPath}" . -x '*.zip'`, { stdio: 'inherit' });
  return fs.readFileSync(zipPath).toString('base64');
}

async function updateCode(funcName, zipB64) {
  await client.UpdateFunctionCode({
    FunctionName: funcName,
    ZipFile: zipB64,
    Handler: 'index.main',
    EnvId: ENV_ID,
  });
  console.log(`✅ ${funcName} 代码已更新`);
}

(async () => {
  for (const name of ['push-manage', 'push-tick']) {
    console.log(`\n--- 打包 ${name} ---`);
    const zip = buildZip(name);
    console.log(`已打包 ${(zip.length * 3 / 4 / 1024).toFixed(0)} KB (base64)`);
    await updateCode(name, zip);
  }
  console.log('\n=== 全部函数代码更新完成 ===');
})().catch((e) => {
  console.error('❌ 更新失败:', e.code, e.message);
  process.exit(1);
});

# 任务提醒推送后端（腾讯云开发 CloudBase）

国内可用 · 免费额度足够个人使用 · 与前端 PWA 同源（均为腾讯系）。

Web Push 在 iOS 上走 **Apple 自己的 APNs 推送服务**（国内可达），本后端只负责
「到点把推送加密发出去」，因此只需要一个国内可达的云函数即可。

---

## 架构

```
iPhone PWA ──建/改任务(带提醒)──▶ POST {BASE}/push-manage  (action=schedule)
                                        │ 写入云数据库 reminders 集合
                                        │
                          push-tick 定时触发器(每分钟) 扫描 fireAt<=now 且 pending
                                        │
                                        ▼
                          用 VAPID 私钥加密 → 发往 Apple/浏览器 APNs
                                        │
                                        ▼
                                iOS 锁屏弹出通知 ✅
```

- `push-manage`：HTTP 触发，接收排程/取消（前端调用）
- `push-tick`：定时触发器（每分钟），扫描到期提醒并发送
- 数据存于云数据库 `reminders` 集合（以 tag=任务id 为 _id 做 upsert）

---

## 一键部署步骤

### 第 1 步：开通云开发（免费）
1. 打开 https://console.cloud.tencent.com/tcb → 用微信/QQ 登录（需实名认证，免费）。
2. 新建一个环境，记下 **环境 ID（envId）**，本项目的 envId 为 `todo-d1g2t6903e3cfef5`。
   地域选**上海/广州**等国内节点。
3. 进入该环境 → **数据库** → 新建集合 `reminders`（权限设为「所有用户可读写」或默认均可，仅后端访问）。

### 第 2 步：配置 VAPID 密钥（复用已有，勿重新生成）
密钥已保存在本目录 `.vapid-keys.json`（与前端公钥一致，旧订阅不会失效）。
对两个云函数都配置以下**环境变量**（函数 → 配置 → 环境变量）：

| 变量名 | 值 |
|--------|-----|
| `VAPID_PUBLIC_KEY` | `.vapid-keys.json` 里的 `VAPID_PUBLIC_KEY` |
| `VAPID_PRIVATE_JWK` | `.vapid-keys.json` 里的 `VAPID_PRIVATE_JWK`（整段 JSON） |

> 切勿在别处重新生成 VAPID，否则手机上已有的订阅全部失效。

### 第 3 步：部署函数（用 CloudBase CLI）
```bash
# 安装 CLI（只需一次）
npm install -g @cloudbase/cli

# 登录（浏览器扫码）
tcb login

# cloudbaserc.json 里的 envId 已填好（todo-d1g2t6903e3cfef5），直接部署：
tcb fn deploy push-manage --envId todo-d1g2t6903e3cfef5
tcb fn deploy push-tick   --envId todo-d1g2t6903e3cfef5
```

### 第 4 步：开启定时触发器
`push-tick` 的每分钟触发器在 `cloudbaserc.json` 里已声明。若未自动创建：
- 进入 `push-tick` 函数 → **触发管理** → 新建定时触发器，
  Cron：`0 */1 * * * *`（每 1 分钟），触发方式选「定时触发」。

### 第 5 步：开启 HTTP 触发（仅 push-manage）
- 进入 `push-manage` 函数 → **触发管理** → 新建「HTTP 触发」，路径建议填 `push-manage`。
- ⚠️ **关键：把「鉴权方式 / 是否开启鉴权」设为「不鉴权 / 公开」**，否则 PWA 直接调用会被拒绝（401）。
- 记下该函数的**访问域名**，形如：
  `https://todo-d1g2t6903e3cfef5.ap-shanghai.app.tcloudbase.com`
  （实际域名以控制台显示为准，地域可能不同）。
  这就是前端需要的 `VITE_PUSH_API_BASE`。

### 第 6 步：回填前端
编辑项目根目录 `.env`：
```
VITE_PUSH_API_BASE=https://<envId>.ap-shanghai.app.tcloudbase.com
```
然后重新 `npm run build` 并部署前端（见主项目说明）。

---

## 本地自测（无需账号）
```bash
# 验证 web-push 加密模块在 Node 下可正常加载并生成 VAPID JWT：
node -e "require('./functions/push-tick/webpush.cjs'); console.log('webpush module OK')"
```

## 排错
- **收不到推送**：确认 ①PWA 已「添加到主屏幕」并打开过 ②iOS 已授权通知 ③`VITE_PUSH_API_BASE` 已填且域名国内可达 ④`reminders` 集合已建 ⑤`push-tick` 触发器在跑。
- **410 过期**：用户重装/取消授权后旧订阅失效，下次建任务会自动重新订阅。
- **CORS 报错**：`push-manage` 已返回 `Access-Control-Allow-Origin: *`，若仍报错检查是否走了代理。

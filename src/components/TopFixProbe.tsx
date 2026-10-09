import { useState } from 'react';

/* ============================================================================
 * 顶部模糊「现场探针」（临时诊断组件，问题定位后整文件删除）
 * ----------------------------------------------------------------------------
 * 背景：iOS 26/27 主屏 PWA 上，状态栏会给网页顶部盖一层 Liquid Glass 滚动边缘
 * 模糊（约 75~120pt 高）。这层是系统渲染，桌面 WebKit 复现不了，只能到真机上试。
 *
 * 机制（来自 WebKit 行为）：系统只在能找到「fixed colour extension」时才隐藏该模糊。
 * 判定 = 在视口顶边下方 4px、水平中点做 hit-test，向上找第一个 fixed/sticky 祖先，
 * 要求 ≥90% 视口宽、≤105% 视口高，然后取它的 background-color。
 * 另外：找到的容器保留到下一次页面加载 ⇒ 必须整页 reload 才能看到改动的效果。
 *
 * 用法：点左下角小胶囊 → 逐个点变体（会自动 reload）→ 看顶部文字是否清晰。
 * ==========================================================================*/

// ⚠️ 每次变体编号含义变动都要换 key，否则用户会卡在旧编号上、看到的却不是他以为的方案
// （第 6 版补了一批新变体，并把 data-topfix='3' 从「关看门狗」改成「下移 100pt」）
const VARIANT_KEY = 'xingshilu.topfix4';
const DEFAULT_ID = '8'; // 不写 data-topfix 时生效的就是 8 号方案
const BUILD = 'topfix-2026-10-09 · 第 6 版（默认=#root 固定全屏；新增 10/11/12 三条新机制）';

const VARIANTS: { id: string; name: string; why: string }[] = [
  {
    id: '8',
    name: '8 · 默认：#root 固定全屏',
    why: '固定容器放在 index.html 的静态元素 #root 上 —— 系统判定发生在首帧布局，React 渲染的 #app-root 那时还不存在',
  },
  {
    id: '9',
    name: '9 · 先测这个：顶部涂玫红块',
    why: '一眼定性。玫红边缘清晰 ⇒ 系统不糊「固定元素」；玫红发虚 ⇒ 整片顶部都被系统模糊',
  },
  {
    id: '12',
    name: '12 · 新机制：不延伸到状态栏',
    why: 'viewport-fit 由 cover 改 auto —— 网页不再伸到状态栏底下，也就不参与那层玻璃合成。全新方向，前六版都没试过',
  },
  {
    id: '11',
    name: '11 · 新机制：去掉可滚动容器',
    why: '这套效果叫 scroll-edge，名字里就有 scroll。把内容区的滚动容器身份整个去掉，看模糊是不是滚动引起的',
  },
  {
    id: '10',
    name: '10 · 新机制：只关惯性滚动',
    why: '只把 -webkit-overflow-scrolling 从 touch 改 auto，比 11 温和',
  },
  {
    id: '13',
    name: '13 · 关掉「视口看门狗」',
    why: '看门狗每次启动会临时把页面撑出视口（逼 iOS 重算）⇒ 文档变可滚动。别的 PWA 没有这套东西',
  },
  {
    id: '4',
    name: '4 · 首行下移到 ≈115pt',
    why: '二分模糊带下边界。这个读数决定「位置兜底方案」最少要下移多少',
  },
  {
    id: '3',
    name: '3 · 首行下移到 ≈100pt',
    why: '二分模糊带下边界',
  },
  {
    id: '5',
    name: '5 · 首行下移到 ≈145pt',
    why: '已确认清晰，作为「带外」基准',
  },
  {
    id: '2',
    name: '2 · 对照：取样条可被命中',
    why: '验证「y=4 的命中是否被取样条截走」',
  },
  {
    id: '7',
    name: '7 · 顶栏改 sticky top:0',
    why: '原文列出的另一条有效修法',
  },
  {
    id: '1',
    name: '1 · 回退：#root 改回文档流',
    why: '顶部仍糊，但布局 100% 安全。若 8 导致底部异常，先切回这条',
  },
];

function readEnvProbe(prop: string): string {
  try {
    const d = document.createElement('div');
    d.style.cssText = `position:fixed;top:0;left:0;width:0;height:0;padding-top:env(${prop});`;
    document.body.appendChild(d);
    const v = getComputedStyle(d).paddingTop;
    d.remove();
    return v || '(空)';
  } catch {
    return '(读不到)';
  }
}

/** 复现 WebKit 那次判定：视口顶边下方 4px、水平中点做 hit-test，
 *  然后向上走，直到遇到第一个 fixed / sticky 祖先 —— 那就是系统取背景色的盒子。 */
function hitChain(): string {
  try {
    const x = Math.round(window.innerWidth / 2);
    const first = document.elementFromPoint(x, 4);
    if (!first) return '  (4px 处命中不到任何元素)';
    const lines: string[] = [];
    let n: Element | null = first;
    while (n && lines.length < 6) {
      const s = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      const cls = typeof n.className === 'string' && n.className ? '.' + n.className.trim().split(/\s+/)[0] : '';
      lines.push(
        `  ${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${cls}  pos=${s.position}  ` +
          `${Math.round(r.width)}x${Math.round(r.height)}  bg=${s.backgroundColor}  pe=${s.pointerEvents}`,
      );
      if (s.position === 'fixed' || s.position === 'sticky') break;
      n = n.parentElement;
    }
    const last = lines[lines.length - 1];
    const ok = /pos=(fixed|sticky)/.test(last);
    lines.push(
      ok
        ? '  ✅ 链尾是 fixed/sticky ⇒ 系统应取它的背景色'
        : '  ❌ 整条链没有 fixed/sticky ⇒ 系统找不到固定色块延伸，顶部保持模糊',
    );
    return lines.join('\n');
  } catch (e) {
    return '  (读取失败 ' + String(e) + ')';
  }
}

function collect() {
  const de = document.documentElement;
  const vv = window.visualViewport;
  const tint = document.querySelector('.top-tint') as HTMLElement | null;
  const tintCS = tint ? getComputedStyle(tint) : null;
  const root = document.getElementById('root');
  const rootCS = root ? getComputedStyle(root) : null;
  const appRoot = document.getElementById('app-root');
  const appRootCS = appRoot ? getComputedStyle(appRoot) : null;
  const cssVar = (n: string) => getComputedStyle(de).getPropertyValue(n).trim();
  const rect = (el: HTMLElement | null) =>
    el ? `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}` : '—';

  return [
    `构建      ${BUILD}`,
    `变体      ${de.dataset.topfix || '8（默认）'}`,
    `UA        ${navigator.userAgent}`,
    `standalone ${String((navigator as unknown as { standalone?: boolean }).standalone)}` +
      `  display-mode:${window.matchMedia?.('(display-mode: standalone)').matches ? 'standalone' : '否'}` +
      `  .ios-pwa:${de.classList.contains('ios-pwa') ? '有' : '无'}`,
    `--- 视口 ---`,
    `innerHeight ${window.innerHeight}   clientHeight ${de.clientHeight}`,
    `screen      ${window.screen.width}x${window.screen.height}  dpr ${window.devicePixelRatio}`,
    `scrollHeight ${de.scrollHeight}  body.scrollHeight ${document.body.scrollHeight}` +
      `  溢出 ${de.scrollHeight - de.clientHeight}px`,
    `visualViewport ${vv ? `${vv.width.toFixed(1)}x${vv.height.toFixed(1)} offsetY ${vv.offsetTop.toFixed(1)} scale ${vv.scale}` : '(无)'}`,
    `--- 安全区探针 ---`,
    `env(top)  ${readEnvProbe('safe-area-inset-top')}   env(bottom) ${readEnvProbe('safe-area-inset-bottom')}`,
    `--sat ${cssVar('--sat')}   --tg ${cssVar('--tg')}   --bg-top ${cssVar('--bg-top')}`,
    `--- 取样条 .top-tint ---`,
    tint
      ? `position ${tintCS?.position}  height ${tintCS?.height}  ${rect(tint)}` +
        `  bg ${tintCS?.backgroundColor}  pointer-events ${tintCS?.pointerEvents}  z ${tintCS?.zIndex}`
      : '❌ 不存在',
    `--- #root（现在的固定色块容器）---`,
    root
      ? `position ${rootCS?.position}  inset ${rootCS?.top}/${rootCS?.right}/${rootCS?.bottom}/${rootCS?.left}` +
        `  ${rect(root)}  bg ${rootCS?.backgroundColor}`
      : '❌ 不存在',
    `--- #app-root ---`,
    appRoot
      ? `position ${appRootCS?.position}  ${rect(appRoot)}  bg ${appRootCS?.backgroundColor}`
      : '❌ 不存在',
    `--- 命中链（复现系统判定：y=4，水平中点）---`,
    hitChain(),
  ].join('\n');
}

export default function TopFixProbe() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const current = (() => {
    try {
      return localStorage.getItem(VARIANT_KEY) || DEFAULT_ID;
    } catch {
      return '0';
    }
  })();

  const pick = (id: string) => {
    try {
      localStorage.setItem(VARIANT_KEY, id);
    } catch {
      /* 忽略 */
    }
    // 必须整页 reload：系统找到的固定容器会保留到下一次页面加载
    location.reload();
  };

  if (!open) {
    return (
      <button
        onClick={() => {
          setText(collect());
          setOpen(true);
        }}
        className="absolute left-2 z-[70] rounded-full border border-neutral-300 bg-white/90 px-2 py-1 text-[10px] font-medium text-neutral-500 shadow-sm"
        style={{ bottom: 'calc(var(--sab, 34px) + 92px)' }}
      >
        🔬 顶部探针
      </button>
    );
  }

  return (
    <div className="absolute inset-0 z-[70] flex flex-col bg-white/97 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="text-[14px] font-bold text-neutral-800">顶部模糊 · 现场探针</div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-full bg-neutral-100 px-3 py-1 text-[12px] font-medium text-neutral-600"
        >
          关闭
        </button>
      </div>

      <div className="scroll-y no-scrollbar flex-1 overflow-y-auto px-4 pb-6">
        <p className="mt-3 text-[12px] leading-relaxed text-neutral-500">
          点一个变体 → App 会自动整页重载 → 看顶部那行字是否变清晰。
          <br />
          当前生效：<span className="font-semibold text-primary-700">{current}</span>
          <br />
          <span className="text-[11px] text-neutral-400">
            最可靠的办法：选好之后**从应用切换器上滑杀掉 App，再从主屏图标重开** ——
            系统只在页面首次布局时判定一次，并把结果保留到下一次页面加载。
          </span>
        </p>

        <div className="mt-3 flex flex-col gap-2">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              onClick={() => pick(v.id)}
              className={`rounded-xl border px-3 py-2.5 text-left ${
                current === v.id
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-neutral-200 bg-white'
              }`}
            >
              <div className="text-[13px] font-semibold text-neutral-800">{v.name}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">{v.why}</div>
            </button>
          ))}
        </div>

        <div className="mt-4 text-[12px] font-semibold text-neutral-600">
          现场读数（可长按选中复制）
        </div>
        <pre className="mt-1.5 select-text overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-neutral-50 p-3 text-[10.5px] leading-relaxed text-neutral-700">
          {text}
        </pre>
        <button
          onClick={() => setText(collect())}
          className="mt-2 rounded-full bg-neutral-100 px-3 py-1.5 text-[12px] font-medium text-neutral-600"
        >
          重新读取
        </button>
      </div>
    </div>
  );
}

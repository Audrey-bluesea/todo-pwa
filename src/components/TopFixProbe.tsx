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
// （第 7 版：默认改成 --tg:34px，旧编号 3/4/5/7/10/11 的含义已全部作废）
const VARIANT_KEY = 'xingshilu.topfix6';
const DEFAULT_ID = '34'; // 不写 data-topfix 时生效的就是 34 号方案
const BUILD = 'topfix-2026-10-10 · 第 7 版（默认 --tg:34px，首行 ≈110pt，真机已确认清晰）';

const VARIANTS: { id: string; name: string; why: string }[] = [
  {
    id: '34',
    name: '34 · 默认：首行 ≈110pt（已实测清晰）',
    why: '系统那条模糊带的下沿实测落在 102~106pt。--tg:34px 让首行落在 ≈110pt，锐度与干净渲染完全一致',
  },
  {
    id: '30',
    name: '30 · 更贴顶：首行 ≈106pt',
    why: '正好压在带的下沿上。若这档也清晰 ⇒ 可把默认值调小，少留一点空白',
  },
  {
    id: '1',
    name: '1 · 回退：首行 ≈83pt（改造前的旧位置）',
    why: 'A/B 对照用。真机已知会糊 —— 用来确认「这确实是位置问题，不是别的」',
  },
  {
    id: '68',
    name: '68 · 首行 ≈145pt（带外基准）',
    why: '已确认清晰。与 30 一起可把带的下沿二分到 ±5pt',
  },
  {
    id: '9',
    name: '9 · 诊断：顶部涂纯色块',
    why: '截图后可反解系统覆盖物的透明度剖面（0~35pt≈0.48 → 95pt 归零），复核带的下沿',
  },
  {
    id: '13',
    name: '13 · 机制：关掉「视口看门狗」',
    why: '看门狗启动时会临时把页面撑出视口 ⇒ 文档变可滚动。若「可滚动」正是那条带的触发条件，关掉它顶部就该清晰',
  },
  {
    id: '12',
    name: '12 · 机制：viewport-fit 改 auto',
    why: '网页不再伸到状态栏底下，就不参与那层玻璃合成（顶部会多一条系统留白，仅诊断用）',
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

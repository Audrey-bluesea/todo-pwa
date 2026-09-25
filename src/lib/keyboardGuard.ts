/* ============================================================
 * 键盘避让看门狗（2026-09-25）
 * ============================================================
 * 【问题】iOS 主屏 PWA 里，弹键盘只压缩 visualViewport，不重排 position:fixed
 *   的弹层；本 App 页面又不可滚动（overflow:hidden），浏览器原生的「把输入框滚进
 *   可视区」通道彻底失效 → 弹层里的输入框被键盘盖住、且不会自动上移（用户真机
 *   「编辑计时记录」弹层踩到，IMG_2935）。
 *
 * 【根因】本 App 没有任何「键盘避让」逻辑：viewportGuard 检测到键盘弹起时（kb>40）
 *   主动不介入（它只管「视口少算状态栏 62pt」那一档）；iOS 不重排 fixed 弹层 +
 *   页面不可滚动，原生自愈通道失效。
 *
 * 【修法】
 *   ① 用 visualViewport 算出键盘高度
 *        kb = innerHeight - (vv.height + vv.offsetTop)
 *      （与 Cogito 项目同款、同机型已验证）。写入 CSS 变量 --kb-h。
 *   ② kb>40 时给 <html> 加 .kb-open 类，收起时 --kb-h 归 0 / 摘类。
 *   ③ 8 处底部弹层的遮罩 bottom 改为  calc(var(--kb-h) - var(--vp-gap))，
 *      键盘弹起时整张弹层被顶到键盘上沿（详见各 Sheet 组件）。
 *   ④ 键盘弹起后，把当前聚焦的输入框 scrollIntoView 到可视区（防长面板场景）。
 *   全平台运行：安卓/桌面无键盘时 kb 恒为 0，--kb-h=0、类摘除，视觉零变化。
 *   配合 viewportGuard：键盘态下 --vp-gap 仍保持 62（少算档），故抬升公式在
 *   键盘态退化为 kb-62，弹层底边正好落在键盘上沿（零间隙、不重叠）。
 * ============================================================ */

/** 超过这个高度才认为「键盘弹起」（绕开 iOS 各种 20~30px 的抖动/工具栏） */
const KB_THRESHOLD = 40;

let rafId: number | null = null;

function computeKb(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const inner = window.innerHeight;
  const kb = inner - (vv.height + vv.offsetTop);
  return Math.max(0, Math.round(kb));
}

function apply() {
  rafId = null;
  const kb = computeKb();
  const html = document.documentElement;
  if (kb > KB_THRESHOLD) {
    html.style.setProperty('--kb-h', kb + 'px');
    html.classList.add('kb-open');
  } else {
    html.style.setProperty('--kb-h', '0px');
    html.classList.remove('kb-open');
  }
}

function schedule() {
  if (rafId != null) return;
  rafId = requestAnimationFrame(apply);
}

function ensureVisible(el: Element | null) {
  if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
    (el as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }
}

export function initKeyboardGuard() {
  const vv = window.visualViewport;
  if (!vv) return; // 极少数无 visualViewport 的环境无法探测，0 即安全

  const onVV = () => schedule();
  vv.addEventListener('resize', onVV);
  vv.addEventListener('scroll', onVV);

  // 聚焦输入框：等键盘动画（iOS 是「长出来」的，太早量不到真实高度）几拍后再量、再滚动
  const onFocusIn = () => {
    schedule();
    window.setTimeout(schedule, 250);
    window.setTimeout(() => {
      schedule();
      ensureVisible(document.activeElement);
    }, 550);
  };
  window.addEventListener('focusin', onFocusIn, true);
  // 失焦（键盘收起）后补一次，确保归位
  document.addEventListener(
    'focusout',
    () => window.setTimeout(schedule, 200),
    true,
  );

  // 首帧
  apply();
}

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
 *   ⑤ 切后台 / 离开页面前主动 blur 掉聚焦的输入框 —— 规避 iOS 的「选字栏空白」
 *      系统 bug（2026-09-27，IMG_2970）。缘由详见 dropFocusForSuspend 的注释。
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

/** 是否是「会唤起键盘的文本输入控件」（用 tagName 判定，跨 realm 安全、也便于单测） */
function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  const tag = (el as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  return (el as HTMLElement).isContentEditable === true;
}

/* ------------------------------------------------------------
 * 切后台 / 离开页面前，主动把键盘收掉
 * ------------------------------------------------------------
 * 【为什么必须做】iOS 键盘扩展会为「当前聚焦的输入框」持有一份**输入会话**，候选/选字栏
 *   就是这份会话产出的。带着键盘切到别的 App 时，系统挂起网页进程并顺手拆掉这份会话；
 *   回到前台，iOS 只把**键盘视图**重新摆出来、没把候选栏重新指回输入框 ⇒ 选字栏「在位
 *   却永远空白」，且因为会话已死，之后怎么点都不会重开，只能杀掉 App 重建进程。
 *   这是 iOS 26.0 起已知的系统级 bug（Apple 未修；网页侧改 CSS/JS 无法根治，只能规避）。
 *   真机取证见项目 memory 2026-09-27：空白区颜色与键盘按键缝隙色只差 1~2/255 ⇒ 属键盘材质。
 *
 * 【规避原理】在挂起**之前** blur，就不存在「半死的会话」被带过挂起期；用户回前台点一下
 *   输入框 ＝ 全新会话 ＝ 选字栏正常。代价：从后台回来时键盘不再自动弹起（要再点一下），
 *   换来的是它一定能用。用户 2026-09-27 确认按此方案实施。
 * ------------------------------------------------------------ */
function dropFocusForSuspend() {
  if (!isTextEntry(document.activeElement)) return;
  (document.activeElement as HTMLElement).blur();
  // blur 后立刻重算 + 补一拍：防止个别情况下 vv.resize 不来、--kb-h 卡在旧键盘高度上
  schedule();
  window.setTimeout(schedule, 250);
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

  // 切后台 / 页面被丢弃前把键盘收掉（规避 iOS「选字栏空白」系统 bug，见上方注释）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) dropFocusForSuspend();
  });
  window.addEventListener('pagehide', () => dropFocusForSuspend());

  // 首帧
  apply();
}

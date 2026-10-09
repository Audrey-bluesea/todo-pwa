import { useEffect } from 'react';
import { useDataStore } from './store/dataStore';
import { useUIStore } from './store/uiStore';
import { useTimerStore } from './store/timerStore';
import { ensureSubscription } from './lib/push';
import TabBar from './components/TabBar';
import Drawer from './components/Drawer';
import TodoEditorSheet from './components/TodoEditorSheet';
import TimerBubble from './components/TimerBubble';
import TimerStartSheet from './components/TimerStartSheet';
import TimerEntryEditSheet from './components/TimerEntryEditSheet';
import RecapView from './components/RecapView';
import TodoTab from './views/TodoTab';
import CalendarTab from './views/CalendarTab';

export default function App() {
  const init = useDataStore((s) => s.init);
  const ready = useDataStore((s) => s.ready);
  const tab = useUIStore((s) => s.tab);
  const toast = useUIStore((s) => s.toast);
  const toastAction = useUIStore((s) => s.toastAction);
  const theme = useUIStore((s) => s.theme);

  useEffect(() => {
    init();
    useTimerStore.getState().init();
  }, [init]);

  // 推送预热：用户已授权过通知时，提前建立订阅（不主动弹窗请求权限，避免打扰）。
  // 后端未配置时 ensureSubscription 内部静默返回，不影响启动。
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      void ensureSubscription();
    }
  }, []);

  // 主题：初始加载 + 切换时同步到 <html data-theme>，并同步浏览器地址栏/状态栏配色
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    const appbg = getComputedStyle(root).getPropertyValue('--c-appbg').trim();
    if (appbg) {
      const hex =
        '#' +
        appbg
          .split(/\s+/)
          .map((n) => Number(n).toString(16).padStart(2, '0'))
          .join('');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', hex);
    }
  }, [theme]);

  return (
    // ⚠️ 根容器必须是**普通文档流定位（relative）**，绝不能再改回 fixed（2026-10-09 第三次修订）。
    //
    // 【为什么不能用 fixed】iOS 26/27 的顶部 Liquid Glass（状态栏）会把「固定定位元素」
    // 当作系统导航栏/工具栏处理，对**该合成层整体**做模糊与降采样。根容器一旦是
    // fixed inset-0，整个 App 都在这个层里 ⇒ 全屏字体发虚，顶部最明显（背景对比度低）。
    // 症状极具迷惑性：改顶部颜色、加取色条、调 padding 全部「没有任何变化」——
    // 因为糊的不是那条色带，是这一层本身。
    // 对照取证：另一个同类 PWA（Cogito）的 #app 用的就是 position: relative，
    // 同为 iOS 27 主屏 PWA、同 viewport-fit=cover、同 status-bar-style=default，
    // 首行墨迹高度与我们几乎一致，但它完全不糊。
    //
    // 【为什么现在敢用文档流】高度不再依赖「视口报值」：
    //   html.ios-pwa #root / #app-root 均被 CSS 钉成 100vh（standalone 下 = 真实满屏 956，
    //   是全项目唯一没被 iOS 算错的长度），故本容器高度 = 100vh，稳定。
    //   这也顺带把 viewportGuard 注释里说的「fixed 壳堵死视口自愈路径」重新打开。
    // TabBar 仍是内部 in-flow 的 flex 子项（非 fixed bottom），不踩 iOS 布局铁律。
    // id="app-root" 供 viewportGuard 使用（诊断采样 + --vp-gap 计算），保持不变。
    <div id="app-root" className="relative flex h-full flex-col overflow-hidden bg-appbg">
      <main className="flex min-h-0 flex-1 overflow-hidden">
        {!ready ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-primary-100 text-[26px]">
              🍵
            </div>
            <div className="text-[13px] text-neutral-400">正在冲泡…</div>
          </div>
        ) : tab === 'todos' ? (
          <TodoTab />
        ) : (
          <CalendarTab />
        )}
      </main>

      <TabBar />
      <Drawer />
      <RecapView />
      <TodoEditorSheet />
      <TimerBubble />
      <TimerStartSheet />
      <TimerEntryEditSheet />

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 z-[60] flex justify-center" style={{ bottom: 'calc(var(--sab) + 100px)' }}>
          <div className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-[13px] font-medium text-neutral-800 shadow-card anim-pop">
            <span>{toast}</span>
            {toastAction && (
              <button
                onClick={() => {
                  toastAction.onAction();
                  useUIStore.setState({ toast: null, toastAction: null });
                }}
                className="pointer-events-auto -my-1 rounded-full bg-primary-600 px-3 py-1 text-[12.5px] font-semibold text-white press"
              >
                {toastAction.label}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

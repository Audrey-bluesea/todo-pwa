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

  // 临时调试 HUD：定位真机布局问题用，确认修复后移除。
  // 显示在左上角，忽略即可；若布局仍异常，请把这行小字截图发我。
  useEffect(() => {
    const hud = document.createElement('div');
    hud.id = 'dbg-hud';
    hud.style.cssText =
      'position:fixed;top:2px;left:2px;z-index:99999;background:rgba(0,0,0,.78);color:#7CFFB2;font:10px/1.35 ui-monospace,monospace;padding:5px 7px;border-radius:8px;pointer-events:none;white-space:pre;max-width:62vw';
    document.body.appendChild(hud);
    const num = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().height) : '?');
    const top = (el: Element | null) => (el ? Math.round(el.getBoundingClientRect().top) : '?');
    const update = () => {
      const root = document.getElementById('root');
      const app = root?.firstElementChild as HTMLElement | null;
      const main = app?.querySelector('main') as HTMLElement | null;
      const tabbar = document.querySelector('.tabbar') as HTMLElement | null;
      const vvh = window.visualViewport ? Math.round(window.visualViewport.height) : 'n/a';
      hud.textContent = [
        'innerH=' + window.innerHeight,
        'vvh=' + vvh,
        'appH=' + num(app),
        'mainH=' + num(main),
        'tabTop=' + top(tabbar),
        'tabH=' + num(tabbar),
        'rootInline=' + (root?.style.height || '(none)'),
      ].join('\n');
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      hud.remove();
    };
  }, []);

  return (
    // 根容器直接 fixed inset-0 钉死在视口上，不再依赖 dvh / 100% 链路（这些在 iOS
    // standalone 下解析不稳，导致 #root 撑不满、TabBar 跑到中间、main 高度塌陷滑不动）。
    // TabBar 仍是内部 in-flow 的 flex 子项（非 fixed bottom），不踩 iOS 布局铁律。
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-appbg">
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
      <TodoEditorSheet />
      <TimerBubble />
      <TimerStartSheet />
      <TimerEntryEditSheet />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)' }}>
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

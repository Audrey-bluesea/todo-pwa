import { useRef } from 'react';
import { useUIStore } from '../store/uiStore';
import { IconCalendar, IconChecklist, IconPlus } from './Icons';

/** 长按判定阈值（毫秒） */
const LONG_PRESS_MS = 400;
/** 长按容差：手指移动超过该像素即取消长按 */
const MOVE_TOLERANCE = 8;
/** 已提示过「长按可计时」的标记（只提示一次，避免打扰） */
const FAB_HINT_KEY = 'xingshilu.fabTimerHinted';

const FAB_EMOJI: Partial<Record<string, string>> = {
  matcha: '🍵',
  pixel: '🎡',
  spring: '🌸',
  summer: '🎐',
  autumn: '🍁',
  winter: '❄️',
  blossom: '🍀',
};

export default function TabBar() {
  const tab = useUIStore((s) => s.tab);
  const setTab = useUIStore((s) => s.setTab);
  const openEditor = useUIStore((s) => s.openEditor);
  const filter = useUIStore((s) => s.filter);
  const selectedDate = useUIStore((s) => s.selectedDate);
  const theme = useUIStore((s) => s.theme);
  const drawerOpen = useUIStore((s) => s.drawerOpen);
  const todoView = useUIStore((s) => s.todoView);
  const boardSectionId = useUIStore((s) => s.boardSectionId);
  const setTimerSheetOpen = useUIStore((s) => s.setTimerSheetOpen);
  const showToast = useUIStore((s) => s.showToast);

  const fabEmoji = FAB_EMOJI[theme];

  /* ---------- FAB 长按 → 计时 ----------
     轻点行为完全不变（新建任务）；长按 0.4s 打开计时面板。
     因此计时入口从「仅待办页头部」变成全局（日历页也能直接计时）。 */
  const lp = useRef<{ timer: number | null; startX: number; startY: number } | null>(null);
  /** 长按是否已触发（独立于 lp，避免被「移动取消」清掉状态导致松手时漏吞 click） */
  const fired = useRef(false);
  /** 手指移动是否已取消本次交互（取消后松手既不新建也不计时） */
  const cancelled = useRef(false);
  const suppressClick = useRef(false);

  const clearLp = () => {
    if (lp.current?.timer) window.clearTimeout(lp.current.timer);
    lp.current = null;
  };

  const onFabPointerDown = (e: React.PointerEvent) => {
    // 每次新按下都重置，避免上一次的残留状态影响本次
    suppressClick.current = false;
    fired.current = false;
    cancelled.current = false;
    lp.current = { timer: null, startX: e.clientX, startY: e.clientY };
    const t = window.setTimeout(() => {
      fired.current = true;
      lp.current = null; // 已触发：后续 pointermove 不再介入
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);
      setTimerSheetOpen(true);
    }, LONG_PRESS_MS);
    if (lp.current) lp.current.timer = t;
  };

  const onFabPointerMove = (e: React.PointerEvent) => {
    if (!lp.current) return; // 未按下，或长按已触发
    const dx = e.clientX - lp.current.startX;
    const dy = e.clientY - lp.current.startY;
    if (Math.abs(dx) > MOVE_TOLERANCE || Math.abs(dy) > MOVE_TOLERANCE) {
      cancelled.current = true;
      clearLp();
    }
  };

  const onFabPointerUp = () => {
    // 长按已开计时面板、或已因移动取消 —— 两种情况下都要吞掉随后的 click，
    // 否则会「计时面板 + 新建编辑器」同时弹出。
    if (fired.current || cancelled.current) suppressClick.current = true;
    clearLp();
  };

  const handleFabClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    // 首次轻点提示一次长按用法（已提示过则不再打扰）
    try {
      if (!localStorage.getItem(FAB_HINT_KEY)) {
        localStorage.setItem(FAB_HINT_KEY, '1');
        showToast('提示：长按 + 可直接开始计时', { duration: 2600 });
      }
    } catch {
      /* 忽略存储失败 */
    }
    openEditor({
      categoryId: filter.kind === 'category' ? filter.categoryId : undefined,
      sectionId: inBoardSection ? boardSectionId! : undefined,
      date: tab === 'calendar' ? selectedDate : undefined,
    });
  };

  // 看板-按分组模式下，FAB 预填当前清单 + 当前分组
  const inBoardSection =
    tab === 'todos' && todoView === 'board' && boardSectionId !== null && filter.kind === 'category';

  // 抽屉打开时，TabBar 与 FAB 整体隐藏，避免底部 TabBar/FAB 压住抽屉内容
  // （抽屉 z-40 < FAB z-50，且 in-flow 的 TabBar 与 fixed 抽屉层级交叉，真机表现不稳定）。
  // 直接隐藏是最确定、零层级依赖的解法。
  if (drawerOpen) return null;

  const items = [
    { key: 'todos' as const, label: '待办', Icon: IconChecklist },
    { key: 'calendar' as const, label: '日历', Icon: IconCalendar },
  ];

  // FAB：与 v16 一致，在 TabBar 上方一点
  const fabStyle: React.CSSProperties = {
    position: 'fixed',
    right: 16,
    bottom: 58,
    zIndex: 50,
  };

  return (
    <>
      {/* FAB */}
      <button
        aria-label="添加待办"
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
        onPointerCancel={onFabPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        onClick={handleFabClick}
        className="fab flex h-14 w-14 select-none items-center justify-center press"
        style={{ ...fabStyle, WebkitTouchCallout: 'none', touchAction: 'manipulation' }}
      >
        {fabEmoji ? (
          <span className="text-[44px] leading-none">{fabEmoji}</span>
        ) : (
          <IconPlus size={26} />
        )}
      </button>

      {/* TabBar —— in-flow flex（真机 standalone 可滑动）+ relative z-[30]。
          fixed bottom 在 iOS standalone 下会导致整页滑不动，故必须用 in-flow。
          z-[30] 低于所有浮层打开态(40~60)，打开浮层时浮层会盖住 TabBar（正确）；
          日常所有浮层关闭态均不渲染或 pointer-events-none，故 TabBar 可正常点击。 */}
      {/* TabBar —— in-flow flex（真机 standalone 可滑动）+ relative z-[30]。
          总高 48px 与旧版视觉高度一致；按钮顶部留空、底部贴边，避免图标贴顶。 */}
      <nav
        className="tabbar relative z-[30] flex h-12 shrink-0 flex-col border-t border-primary-100 bg-appbg pointer-events-auto"
        style={{ boxShadow: '0 -2px 12px rgba(107, 170, 122, 0.08)' }}
      >
        <div className="flex h-full w-full items-start justify-around">
          {items.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex items-start justify-center pt-3 press"
                style={{ minHeight: 44, minWidth: 60 }}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
              >
                <Icon
                  size={28}
                  className={active ? 'text-primary-500' : 'text-primary-300'}
                  strokeWidth={active ? 2.2 : 1.8}
                />
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

import { useUIStore } from '../store/uiStore';
import { IconCalendar, IconChecklist, IconPlus } from './Icons';

const FAB_EMOJI: Partial<Record<string, string>> = {
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

  const fabEmoji = FAB_EMOJI[theme];

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
        onClick={() => openEditor({
          categoryId: filter.kind === 'category' ? filter.categoryId : undefined,
          date: tab === 'calendar' ? selectedDate : undefined,
        })}
        className="fab flex h-14 w-14 items-center justify-center press"
        style={fabStyle}
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
      <nav
        className="tabbar relative z-[30] flex shrink-0 flex-col border-t border-primary-100 bg-appbg pb-2 pointer-events-auto"
        style={{ boxShadow: '0 -2px 12px rgba(107, 170, 122, 0.08)' }}
      >
        <div className="flex h-10 w-full items-center justify-around">
          {items.map(({ key, label, Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex items-center justify-center press"
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

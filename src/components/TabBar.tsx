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

  const fabEmoji = FAB_EMOJI[theme];

  const items = [
    { key: 'todos' as const, label: '待办', Icon: IconChecklist },
    { key: 'calendar' as const, label: '日历', Icon: IconCalendar },
  ];

  // FAB：固定在 TabBar 上方，bottom 用 CSS 变量动态避开安全区
  const fabStyle: React.CSSProperties = {
    position: 'fixed',
    right: 16,
    bottom: 'calc(var(--tabbar-h) + var(--sab) + 12px)',
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

      {/* TabBar —— in-flow + 高 z-index，确保在 TodoEditorSheet/Drawer 的全屏遮罩之上可点 */}
      <nav
        className="tabbar relative z-[70] flex shrink-0 flex-col border-t border-primary-100 bg-appbg pb-safe pointer-events-auto"
        style={{ boxShadow: '0 -2px 12px rgba(107, 170, 122, 0.08)' }}
      >
        <div className="flex h-14 w-full items-center justify-around">
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

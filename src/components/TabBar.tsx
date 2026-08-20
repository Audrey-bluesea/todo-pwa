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

  const tabbarStyle: React.CSSProperties = {
    position: 'fixed',
    left: 0,
    right: 0,
    /** ★ v29 最终版 —— 回到 v16 proven 尺寸 + 用户方案：
     *  v16(bottom:-60, height:90) 用户确认"有明显进展"，图标完整可见。
     *  当时唯一问题是 glass-strong 毛玻璃遮挡 + z-index 不够。
     *  现在三个改动：
     *  ① 实色背景替代毛玻璃 → 不再遮挡
     *  ② zIndex:999 → 最高层，盖过一切
     *  ③ 保持 bottom:-60 + height:90 → 图标区完整在可视区内 */
    bottom: -48,
    zIndex: 40,
    height: 90,
    backgroundColor: 'rgb(var(--c-appbg))',
    boxShadow: '0 -2px 12px rgba(107, 170, 122, 0.08)',
  };

  // FAB：与 v16 完全一致，在 TabBar 上方一点
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

      {/* TabBar —— 跟 v16 完全一样的单层结构 */}
      <nav
        className="tabbar fixed inset-x-0 border-t border-primary-100"
        style={tabbarStyle}
      >
        <div className="flex items-center justify-around" style={{ height: 56 }}>
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

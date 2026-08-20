import { createPortal } from 'react-dom';
import { useUIStore, type ThemeKey } from '../store/uiStore';
import { IconClose } from './Icons';

const THEMES: {
  key: ThemeKey;
  name: string;
  desc: string;
  emoji: string;
  swatch: string[];
}[] = [
  {
    key: 'matcha',
    name: '抹茶绿',
    desc: '清新淡雅 · 默认',
    emoji: '🍵',
    swatch: ['#6BAA7A', '#A8D5BA', '#E6F2E8'],
  },
  {
    key: 'pixel',
    name: '海边像素',
    desc: '8-bit 游戏机 · 夏日海滩',
    emoji: '🌊',
    swatch: ['#4A9EFF', '#FFD166', '#06D6A0'],
  },
  {
    key: 'spring',
    name: '花见',
    desc: '樱花 · 温柔少女感',
    emoji: '🍃',
    swatch: ['#F28B9C', '#F8B4C2', '#FFD93D', '#A8E6CF'],
  },
  {
    key: 'summer',
    name: '盛夏光年',
    desc: '克莱因蓝 · 清澈热烈',
    emoji: '☀️',
    swatch: ['#2D9CDB', '#7BC8F7', '#F2994A', '#27AE60'],
  },
  {
    key: 'autumn',
    name: '拾秋',
    desc: '陶土橙 · 温暖侘寂',
    emoji: '🍂',
    swatch: ['#D97A48', '#EBAF8B', '#C0392B', '#8E6E53'],
  },
  {
    key: 'winter',
    name: '初雪',
    desc: '冰川蓝灰 · 清冷极简',
    emoji: '❄️',
    swatch: ['#5B7B9A', '#9BB1C7', '#E26A7A', '#8D9CB0'],
  },
  {
    key: 'blossom',
    name: '春信',
    desc: '薄荷青绿 · 柔和清新',
    emoji: '🌸',
    swatch: ['#4EA09E', '#B9E2DF', '#D2646C', '#488C74'],
  },
];

export default function SettingsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[55]">
      <div
        className="absolute inset-0 anim-fade"
        style={{ backgroundColor: 'rgba(30, 43, 60, 0.4)' }}
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 anim-sheet rounded-t-2xl bg-white px-4 pb-8 pt-3 px-surface">
        {/* 拖拽条 */}
        <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-primary-200" />

        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* 像素海浪装饰 */}
            <div className="px-wave" aria-hidden>
              <span className="px-wave__block" />
              <span className="px-wave__block" />
              <span className="px-wave__block" />
              <span className="px-wave__block" />
              <span className="px-wave__block" />
            </div>
            <span className="text-[17px] font-bold text-primary-700">外观主题</span>
          </div>
          <button onClick={onClose} className="hit text-neutral-400 press" aria-label="关闭">
            <IconClose size={20} />
          </button>
        </div>

        <div className="space-y-2.5">
          {THEMES.map((t) => {
            const active = theme === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTheme(t.key)}
                className={`flex w-full items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left press active:scale-[0.99] ${
                  active
                    ? 'border-primary-500 bg-primary-100/70'
                    : 'border-primary-100 bg-white'
                }`}
                style={{ minHeight: 56 }}
              >
                <span className="text-[26px] leading-none">{t.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[15px] font-bold ${active ? 'text-primary-700' : 'text-neutral-700'}`}>
                    {t.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-neutral-400">{t.desc}</div>
                </div>
                <div className="flex items-center gap-1">
                  {t.swatch.map((c) => (
                    <span
                      key={c}
                      className="h-4 w-4 rounded-full border border-primary-200"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                {active && (
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-white">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-center text-[11.5px] text-neutral-400">
          切换即时生效 · 选择后将自动保存
        </p>
      </div>
    </div>,
    document.body,
  );
}

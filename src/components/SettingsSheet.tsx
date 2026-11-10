import { createPortal } from 'react-dom';
import { useUIStore } from '../store/uiStore';
import { THEME_META } from '../lib/themeMeta';
import { IconClose } from './Icons';

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
    <div className="fixed inset-0 z-[55]" style={{ bottom: 'calc(var(--kb-h, 0px) - var(--vp-gap, 0px))' }}>
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
          {THEME_META.map((t) => {
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

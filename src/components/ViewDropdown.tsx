import { useRef, useState, useEffect } from 'react';

interface Option {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (key: string) => void;
  icon?: React.ReactNode; // 触发按钮的图标
  ariaLabel?: string;
}

export default function ViewDropdown({ options, value, onChange, icon, ariaLabel = '切换视图' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const active = options.find((o) => o.key === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="hit flex items-center gap-1 rounded-xl bg-primary-100 px-2.5 py-1.5 text-primary-700 press active:bg-primary-200"
        aria-label={ariaLabel}
        style={{ minHeight: 36 }}
      >
        {icon || (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="14" y2="12" />
            <line x1="4" y1="18" x2="8" y2="18" />
          </svg>
        )}
        <span className="text-[12px] font-medium">{active?.label ?? '视图'}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          {/* 遮罩 */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

          {/* 下拉面板 */}
          <div
            className="absolute left-0 top-full z-40 mt-1 min-w-[180px] overflow-hidden rounded-2xl bg-white py-1.5 shadow-card anim-pop"
            style={{ border: '1px solid rgba(168,213,186,0.3)' }}
          >
            {options.map(({ key, label, icon: optIcon }) => {
              const isActive = key === value;
              return (
                <button
                  key={key}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 whitespace-nowrap px-3.5 py-2.5 text-left text-[13.5px] transition-colors ${
                    isActive ? 'bg-primary-50 font-semibold text-primary-700' : 'text-neutral-600'
                  }`}
                  style={{ minHeight: 44 }}
                >
                  {optIcon && <span className={isActive ? 'text-primary-500' : 'text-neutral-400'}>{optIcon}</span>}
                  {label}
                  {isActive && (
                    <svg
                      className="ml-auto h-[16px] w-[16px] text-primary-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

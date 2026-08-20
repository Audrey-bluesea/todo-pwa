import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ITEM_H = 36; // 单格高度
const VISIBLE = 5; // 可见格数（奇数，便于居中）
const VIEWPORT_H = ITEM_H * VISIBLE; // 180
const PAD = ITEM_H * Math.floor(VISIBLE / 2); // 顶部/底部留白 = 2 格，使首尾可居中

interface WheelProps {
  items: number[];
  value: number;
  onChange: (v: number) => void;
}

function WheelColumn({ items, value, onChange }: WheelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // 初次挂载：滚到当前值对应的位置（居中），用 layoutEffect 确保布局完成后立即定位
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = value * ITEM_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 每帧把当前滚动位置对应的居中项提交为选中值（iOS 惯量滚动也能可靠捕获最终值）
  const commit = () => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    onChange(items[clamped]);
  };
  const handleScroll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(commit);
  };
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      ref={ref}
      className="no-scrollbar relative"
      style={{
        height: VIEWPORT_H,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollSnapType: 'y mandatory',
        touchAction: 'pan-y',
      }}
      onScroll={handleScroll}
    >
      {/* 上下留白，使首/尾项可滚到正中 */}
      <div style={{ height: PAD }} />
      {items.map((n) => (
        <div
          key={n}
          style={{
            height: ITEM_H,
            scrollSnapAlign: 'center',
            lineHeight: `${ITEM_H}px`,
          }}
          className={`flex items-center justify-center text-[17px] tabular-nums ${
            n === value ? 'font-semibold text-neutral-800' : 'text-neutral-300'
          }`}
        >
          {n < 10 ? `0${n}` : n}
        </div>
      ))}
      <div style={{ height: PAD }} />
    </div>
  );
}

export default function TimePicker({
  title,
  initialHour,
  initialMinute,
  onConfirm,
  onCancel,
}: {
  title: string;
  initialHour: number;
  initialMinute: number;
  onConfirm: (hour: number, minute: number) => void;
  onCancel: () => void;
}) {
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      <div
        className="absolute inset-0 anim-fade"
        style={{ backgroundColor: 'rgba(30, 43, 60, 0.4)' }}
        onClick={onCancel}
      />
      <div className="absolute inset-x-0 bottom-0 anim-sheet rounded-t-2xl bg-white px-4 pb-8 pt-3 px-surface">
        <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-primary-200" />
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[16px] font-bold text-primary-700">{title}</span>
          <button
            onClick={() => onConfirm(hour, minute)}
            className="rounded-lg bg-primary-500 px-4 py-1.5 text-[14px] font-medium text-white press active:bg-primary-600"
          >
            确定
          </button>
        </div>

        {/* 滚轮区 */}
        <div className="relative mx-auto flex" style={{ width: 200 }}>
          {/* 选中高亮带 */}
          <div
            className="pointer-events-none absolute left-0 right-0 rounded-xl bg-primary-50"
            style={{ top: PAD, height: ITEM_H }}
          />
          <div className="flex-1">
            <WheelColumn items={hours} value={hour} onChange={setHour} />
          </div>
          <div className="flex items-center self-start pt-[70px] text-[17px] font-semibold text-neutral-400">:</div>
          <div className="flex-1">
            <WheelColumn items={minutes} value={minute} onChange={setMinute} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

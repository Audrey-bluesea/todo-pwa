import { useEffect, useState } from 'react';
import { useTimerStore, fmtElapsed, fmtDuration } from '../store/timerStore';
import { useUIStore } from '../store/uiStore';
import { IconClock } from './Icons';

/** 按开始时间升序（最早开始 = 累计最久的排前面） */
const byStart = (a: { start: number }, b: { start: number }) => a.start - b.start;

export default function TimerBubble() {
  const running = useTimerStore((s) => s.running);
  const stopTimer = useTimerStore((s) => s.stopTimer);
  const cancelTimer = useTimerStore((s) => s.cancelTimer);
  const showToast = useUIStore((s) => s.showToast);
  const setTimerSheetOpen = useUIStore((s) => s.setTimerSheetOpen);

  const [expanded, setExpanded] = useState(false);
  const [, setTick] = useState(0);

  // 每 1 秒刷新一次已用时长（绝对时间戳 → 不依赖后台计时）
  useEffect(() => {
    if (running.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running.length]);

  if (running.length === 0) return null;

  // 折叠态展示累计最久的那条
  const primary = [...running].sort(byStart)[0];
  const primaryElapsed = fmtElapsed(Date.now() - primary.start);

  const handleStop = async (id: string) => {
    const entry = await stopTimer(id);
    if (entry?.end) {
      const ms = +entry.end - +entry.start;
      showToast(`已记录 ${fmtDuration(ms)}`, { duration: 2200 });
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed left-4 z-40 flex items-center gap-2 rounded-full border border-primary-200 bg-primary-100 px-3 py-2 shadow-fab press active:bg-primary-200 anim-pop"
        style={{ bottom: 56 }}
        aria-label="计时中，点击展开"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-primary-500">
          <IconClock size={13} className="text-white" />
        </span>
        <span className="font-mono text-[14px] font-semibold tabular-nums text-primary-700">{primaryElapsed}</span>
        {running.length > 1 && (
          <span className="rounded-full bg-primary-500 px-1.5 text-[11px] font-bold text-white">+{running.length - 1}</span>
        )}
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
      </button>
    );
  }

  return (
    <div
      className="fixed left-4 z-40 w-[260px] rounded-2xl border border-primary-200 bg-white p-3 shadow-fab anim-pop"
      style={{ bottom: 56 }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-primary-700">
          <IconClock size={14} className="text-primary-500" />
          进行中 · {running.length}
        </span>
        <button onClick={() => setExpanded(false)} className="text-[12px] text-neutral-400 press">
          收起
        </button>
      </div>

      <div className="max-h-[40vh] space-y-2 overflow-y-auto">
        {[...running].sort(byStart).map((r) => (
          <div key={r.id} className="rounded-xl border border-primary-100 bg-primary-50/60 p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-700">{r.title}</span>
              <span className="font-mono text-[13px] font-semibold tabular-nums text-primary-700">
                {fmtElapsed(Date.now() - r.start)}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await cancelTimer(r.id);
                  showToast('已取消计时');
                }}
                className="flex-1 rounded-full bg-neutral-100 py-1.5 text-[12px] font-medium text-neutral-500 press active:bg-neutral-200"
                style={{ minHeight: 34 }}
              >
                取消
              </button>
              <button
                onClick={() => handleStop(r.id)}
                className="flex-1 rounded-full bg-primary-500 py-1.5 text-[12px] font-semibold text-white press active:bg-primary-600"
                style={{ minHeight: 34 }}
              >
                结束
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => {
          setExpanded(false);
          setTimerSheetOpen(true);
        }}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-primary-200 py-2 text-[13px] font-medium text-primary-500 press active:bg-primary-50"
        style={{ minHeight: 38 }}
      >
        ＋ 新增计时
      </button>
    </div>
  );
}

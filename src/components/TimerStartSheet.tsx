import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../store/uiStore';
import { useTimerStore, fmtElapsed, fmtDuration } from '../store/timerStore';
import { useDataStore } from '../store/dataStore';
import { isSameDay, fmtTime } from '../lib/date';
import { IconClose, IconClock, IconTrash } from './Icons';

export default function TimerStartSheet() {
  const open = useUIStore((s) => s.timerSheetOpen);
  const setOpen = useUIStore((s) => s.setTimerSheetOpen);
  const showToast = useUIStore((s) => s.showToast);

  const running = useTimerStore((s) => s.running);
  const startTimer = useTimerStore((s) => s.startTimer);
  const stopTimer = useTimerStore((s) => s.stopTimer);
  const removeTimeEntry = useTimerStore((s) => s.removeTimeEntry);
  const timeEntries = useTimerStore((s) => s.timeEntries);

  const categories = useDataStore((s) => s.categories);

  const [label, setLabel] = useState('');
  const [freeCat, setFreeCat] = useState(''); // '' = 收集箱（未分类）
  const [, setTick] = useState(0);

  // 运行中：实时刷新已用时长
  useEffect(() => {
    if (running.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running.length]);

  const todayEntries = useMemo(
    () => timeEntries.filter((e) => isSameDay(e.start, new Date())),
    [timeEntries],
  );

  if (!open) return null;

  const close = () => setOpen(false);

  const handleStartFree = async () => {
    await startTimer({ title: label.trim() || '自由计时', categoryId: freeCat || null });
    setLabel('');
    setFreeCat('');
    showToast('开始计时');
    close();
  };

  const handleStop = async (id: string) => {
    const entry = await stopTimer(id);
    if (entry?.end) {
      showToast(`已记录 ${fmtDuration(+entry.end - +entry.start)}`);
    }
  };

  const handleDelete = async (id: string) => {
    await removeTimeEntry(id);
    showToast('已删除记录');
  };

  return createPortal(
    <div className="fixed inset-0 z-[55]">
      <div
        className="absolute inset-0 anim-fade"
        style={{ backgroundColor: 'rgba(30, 43, 60, 0.4)' }}
        onClick={close}
      />
      <div className="absolute inset-x-0 bottom-0 anim-sheet max-h-[82vh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-8 pt-3 px-surface">
        <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-primary-200" />

        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconClock size={20} className="text-primary-500" />
            <span className="text-[17px] font-bold text-primary-700">计时</span>
          </div>
          <button onClick={close} className="hit text-neutral-400 press" aria-label="关闭">
            <IconClose size={20} />
          </button>
        </div>

        {/* 进行中 */}
        {running.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-neutral-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              进行中 · {running.length}
            </div>
            {[...running]
              .sort((a, b) => a.start - b.start)
              .map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-100/60 px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-neutral-700">{r.title}</div>
                    <div className="font-mono text-[13px] tabular-nums text-primary-600">
                      {fmtElapsed(Date.now() - r.start)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleStop(r.id)}
                    className="rounded-full bg-primary-500 px-4 py-2 text-[13px] font-semibold text-white press active:bg-primary-600"
                    style={{ minHeight: 38 }}
                  >
                    结束
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* 开始新计时 */}
        <div className="mb-2 text-[13px] font-semibold text-neutral-500">开始计时</div>

        {/* 选择清单（仅自由计时） */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFreeCat('')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] press ${
              freeCat === '' ? 'bg-primary-500 text-white' : 'border border-primary-100 bg-white text-neutral-600'
            }`}
            style={{ minHeight: 34 }}
          >
            收集箱
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setFreeCat(c.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] press ${
                freeCat === c.id ? 'bg-primary-500 text-white' : 'border border-primary-100 bg-white text-neutral-600'
              }`}
              style={{ minHeight: 34 }}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="记录名称（如：写周报）"
            className="min-w-0 flex-1 rounded-xl border border-primary-100 bg-primary-50 px-3.5 py-3 text-[15px] text-neutral-700 outline-none placeholder:text-neutral-400 focus:border-primary-300"
            style={{ minHeight: 46 }}
          />
          <button
            onClick={handleStartFree}
            className="shrink-0 rounded-xl bg-primary-500 px-5 py-3 text-[15px] font-semibold text-white press active:bg-primary-600"
            style={{ minHeight: 46 }}
          >
            开始
          </button>
        </div>

        {/* 今日记录 */}
        <div className="mb-2 text-[13px] font-semibold text-neutral-500">
          今日记录 {todayEntries.length > 0 && `（${todayEntries.length}）`}
        </div>
        {todayEntries.length === 0 ? (
          <div className="rounded-xl bg-primary-50 px-3.5 py-4 text-center text-[13px] text-neutral-400">
            还没有计时记录，点上方「开始」试试
          </div>
        ) : (
          <div className="space-y-2">
            {todayEntries.map((e) => {
              const ms = e.end ? +e.end - +e.start : 0;
              return (
                <div
                  key={e.id}
                  className="flex items-center gap-3 rounded-xl border border-primary-100 bg-white px-3.5 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-neutral-700">{e.title}</div>
                    <div className="text-[12px] text-neutral-400">
                      {fmtTime(e.start)} – {e.end ? fmtTime(e.end) : '进行中'} · {e.end ? fmtDuration(ms) : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="shrink-0 rounded-full p-2 text-neutral-400 press active:bg-neutral-100"
                    aria-label="删除记录"
                  >
                    <IconTrash size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

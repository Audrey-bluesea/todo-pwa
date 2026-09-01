import { useMemo } from 'react';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import {
  addDays,
  fmtTime,
  isAllDay,
  isSameDay,
  isToday,
  startOfWeek,
  weekDays,
  WEEK_EN,
} from '../lib/date';
import { solarToLunar } from '../lib/lunar';
import { holidayMark } from '../lib/holidays';
import HolidayBadge from '../components/HolidayBadge';
import { activeTodosOn, makeCatMap } from '../lib/todoIndex';
import { IconPlus } from '../components/Icons';

const MAX_ROWS = 5;

export default function CalendarWeekCards() {
  const todos = useDataStore((s) => s.todos);
  const categories = useDataStore((s) => s.categories);
  const selected = useUIStore((s) => s.viewDate);
  const selectedDate = useUIStore((s) => s.selectedDate);
  const setSelected = useUIStore((s) => s.setSelectedDate);
  const setViewDate = useUIStore((s) => s.setViewDate);
  const setCalendarView = useUIStore((s) => s.setCalendarView);
  const openEditor = useUIStore((s) => s.openEditor);

  const catMap = useMemo(() => makeCatMap(categories), [categories]);
  const days = useMemo(() => weekDays(selected), [selected]);

  return (
    <div className="scroll-y min-h-0 flex-1 px-3 pb-8 pt-2">
      <div className="grid grid-cols-2 gap-2.5">
        {/* 第 1 格：缩略月历 —— 点击某天切换下方周卡片到对应星期 */}
        <MiniMonth
          date={selected}
          onPick={(d) => {
            setSelected(d);
            setViewDate(d);
          }}
        />

        {/* 第 2-8 格：周一至周日 */}
        {days.map((d, i) => {
          const items = activeTodosOn(todos, d);
          const shown = items.slice(0, MAX_ROWS);
          const rest = items.length - shown.length;
          const today = isToday(d);
          const sel = isSameDay(d, selectedDate);
          const mark = holidayMark(d);

          return (
            <div
              key={+d}
              onClick={() => {
                setSelected(d);
                setViewDate(d);
              }}
              className={`relative flex min-h-[132px] flex-col rounded-lg bg-white p-2.5 shadow-card-soft ${
                sel ? 'ring-1 ring-primary-400' : ''
              }`}
            >
              {mark && (
                <span className="absolute right-1.5 top-1.5 z-10">
                  <HolidayBadge mark={mark} />
                </span>
              )}
              <div className="mb-1.5 flex items-baseline gap-1.5">
                {/* 左上角星期标签（英文） */}
                <span className="text-[11px] font-bold tracking-wide text-primary-600">
                  {WEEK_EN[i]}
                </span>
                <span
                  className={`text-[15px] font-semibold leading-none tabular-nums ${
                    today ? 'text-white' : 'text-neutral-600'
                  } ${today ? 'rounded-full bg-primary-500 px-1.5 py-0.5' : ''}`}
                >
                  {d.getDate()}
                </span>
                <span className="truncate text-[9px] text-neutral-400">{solarToLunar(d).label}</span>
              </div>

              <div className="min-h-0 flex-1 space-y-1">
                {shown.length === 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditor({ date: d });
                    }}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-primary-200 py-2 text-[10.5px] text-primary-400"
                  >
                    <IconPlus size={11} /> 空闲
                  </button>
                )}
                {shown.map((t) => {
                  const color = catMap.get(t.categoryId)?.color ?? '#A8D5BA';
                  const hasEnd = !!t.endDate && !isAllDay(t.endDate);
                  const isStart = isSameDay(d, t.dueDate!);
                  const isCross = hasEnd && t.dueDate && !isSameDay(t.dueDate, t.endDate);
                  // 仅起始日显示具体时间；中间日/结束日不显示时间
                  const timeLabel = isStart
                    ? hasEnd
                      ? `${fmtTime(t.dueDate!)}-${fmtTime(t.endDate!)}`
                      : t.dueDate && !isAllDay(t.dueDate)
                        ? fmtTime(t.dueDate)
                        : ''
                    : '';

                  // 跨天任务：仅起始日显示标题+时间，中间日/结束日只填色块
                  if (isCross && !isStart) {
                    return (
                      <div
                        key={t.id}
                        className="flex w-full items-center rounded-md px-1.5 py-[3px]"
                        style={{ backgroundColor: color + '20' }}
                      />
                    );
                  }

                  return (
                    <button
                      key={t.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditor({ todoId: t.id });
                      }}
                      className="flex w-full items-center rounded-md px-1.5 py-[3px] text-left"
                      style={{ backgroundColor: color + '30' }}
                    >
                      <span
                        className={`min-w-0 flex-1 truncate text-[10.5px] leading-tight ${
                          t.isCompleted ? 'text-neutral-700 line-through' : 'font-medium text-neutral-700'
                        }`}
                      >
                        {t.title}
                      </span>
                      {timeLabel && (
                        <span className="shrink-0 text-[9px] tabular-nums text-neutral-600/70">
                          {timeLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
                {rest > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(d);
                      setCalendarView('day');
                    }}
                    className="px-1 text-[10.5px] font-medium text-primary-400"
                  >
                    +{rest}...
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniMonth({ date, onPick }: { date: Date; onPick: (d: Date) => void }) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const start = startOfWeek(first);
  const weeks: Date[][] = [];
  let cur = start;
  while (cur <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
    cur = addDays(cur, 7);
  }
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="flex min-h-[132px] flex-col rounded-lg bg-primary-100 p-2">
      <div className="grid grid-cols-7 gap-y-[1px]">
        {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
          <div key={w} className="text-center text-[8px] leading-3 text-primary-600/70">
            {w}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const inMonth = d.getMonth() === date.getMonth();
          const inWeek = d >= weekStart && d <= weekEnd;
          const today = isToday(d);
          return (
            <button
              key={+d}
              onClick={() => onPick(d)}
              className="flex items-center justify-center py-[3px]"
              style={{ minHeight: 36 }}
            >
              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[9.5px] tabular-nums ${
                  today
                    ? 'bg-primary-500 font-bold text-white'
                    : inWeek
                      ? 'bg-white/80 text-primary-700'
                      : inMonth
                        ? 'text-neutral-600'
                        : 'text-neutral-400/70'
                }`}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

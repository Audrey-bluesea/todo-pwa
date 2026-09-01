import { useMemo } from 'react';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import SwipePager from '../components/SwipePager';
import { addDays, addMonths, isSameDay, isToday, startOfWeek, WEEK_CN } from '../lib/date';
import { solarToLunar } from '../lib/lunar';
import { holidayMark } from '../lib/holidays';
import HolidayBadge from '../components/HolidayBadge';
import { activeTodosOn, makeCatMap } from '../lib/todoIndex';

const MAX_ROWS = 5;

export default function CalendarMonthGrid() {
  const viewDate = useUIStore((s) => s.viewDate);
  const setViewDate = useUIStore((s) => s.setViewDate);
  const setSelected = useUIStore((s) => s.setSelectedDate);

  // 左右滑切换月份：右滑=上月，左滑=下月
  const stepMonth = (dir: number) => {
    const m = addMonths(viewDate, dir);
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const nd = new Date(m.getFullYear(), m.getMonth(), Math.min(viewDate.getDate(), days));
    setViewDate(nd);
    setSelected(nd);
  };

  return (
    <SwipePager
      current={viewDate}
      stepFn={addMonths}
      onCommit={(dir) => stepMonth(dir)}
      renderPane={(d) => <MonthPane date={d} />}
      className="h-full w-full"
    />
  );
}

function MonthPane({ date }: { date: Date }) {
  const todos = useDataStore((s) => s.todos);
  const categories = useDataStore((s) => s.categories);
  const selectedDate = useUIStore((s) => s.selectedDate);
  const setSelected = useUIStore((s) => s.setSelectedDate);
  const setViewDate = useUIStore((s) => s.setViewDate);
  const setCalendarView = useUIStore((s) => s.setCalendarView);

  const catMap = useMemo(() => makeCatMap(categories), [categories]);

  const weeks = useMemo(() => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const start = startOfWeek(first);
    const out: Date[][] = [];
    let cur = start;
    while (cur <= last) {
      out.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
      cur = addDays(cur, 7);
    }
    return out;
  }, [date]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b border-primary-100 pb-1 pt-1">
        {WEEK_CN.map((w) => (
          <div key={w} className="text-center text-[10.5px] font-medium text-neutral-400">
            {w}
          </div>
        ))}
      </div>

      <div className="scroll-y min-h-0 flex-1 pb-8">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((d) => {
              const items = activeTodosOn(todos, d);
              // 跨天任务优先排第一行，保证色块横向贯通不断开
              const crossItems = items.filter(
                (t) => !!t.endDate && !isSameDay(t.dueDate as Date, t.endDate as Date),
              );
              const singleItems = items.filter(
                (t) => !(!!t.endDate && !isSameDay(t.dueDate as Date, t.endDate as Date)),
              );
              const shown = [...crossItems, ...singleItems].slice(0, MAX_ROWS);
              const rest = items.length - shown.length;
              const today = isToday(d);
              const sel = isSameDay(d, selectedDate);
              const inMonth = d.getMonth() === date.getMonth();
              const lunar = solarToLunar(d);
              const mark = holidayMark(d);

              return (
                <button
                  key={+d}
                  onClick={() => {
                    setSelected(d);
                    setViewDate(d);
                    if (sel) {
                      setCalendarView('day');
                    }
                  }}
                  className={`relative flex min-h-[92px] flex-col items-stretch border-b border-r border-primary-100 px-[2px] pb-1 pt-1 text-left`}
                  style={{ minWidth: 0 }}
                >
                  <div className="mb-[2px] flex flex-col items-center">
                    <div className="relative">
                      <span
                        className={`flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1 text-[12px] font-medium leading-none tabular-nums ${
                          today ? 'bg-primary-500 text-white' : inMonth ? 'text-neutral-600' : 'text-neutral-300'
                        }`}
                      >
                        {d.getDate()}
                      </span>
                      {mark && (
                        <span className="absolute -right-1 -top-1">
                          <HolidayBadge mark={mark} />
                        </span>
                      )}
                    </div>
                    <span
                      className={`mt-[1px] w-full truncate text-center text-[8px] leading-none ${
                        inMonth ? 'text-neutral-400' : 'text-neutral-300'
                      }`}
                    >
                      {lunar.label}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-[1px]">
                    {shown.map((t) => {
                      const color = catMap.get(t.categoryId)?.color ?? '#A8D5BA';
                      const hasEnd = !!t.endDate;
                      const isStart = isSameDay(d, t.dueDate as Date);
                      const isEnd = hasEnd && isSameDay(d, t.endDate as Date);
                      const isCross = hasEnd && !isSameDay(t.dueDate as Date, t.endDate as Date);

                      // 跨天任务：整格贯通色块，仅起始格显示标题，其余格仅填色（相邻格拼成连续条纹）
                      if (isCross) {
                        const rounded = isStart ? 'rounded-l-sm' : isEnd ? 'rounded-r-sm' : '';
                        return (
                          <div
                            key={t.id}
                            className={`mx-[-2px] flex h-[15px] items-center ${rounded}`}
                            style={{ backgroundColor: color }}
                          >
                            {isStart && (
                              <span
                                className={`min-w-0 flex-1 truncate px-[4px] text-[8.5px] leading-[11px] font-medium ${
                                  t.isCompleted ? 'line-through' : ''
                                } text-neutral-800`}
                              >
                                {t.title}
                              </span>
                            )}
                          </div>
                        );
                      }

                      // 单天任务：小胶囊
                      return (
                        <div
                          key={t.id}
                          className="flex min-w-0 items-center rounded-[1px] px-[2px] py-[1px]"
                          style={{ backgroundColor: color + 'CC' }}
                        >
                          <span
                            className={`min-w-0 flex-1 truncate text-[8.5px] leading-[11px] font-medium ${
                              t.isCompleted ? 'line-through' : ''
                            } text-neutral-700`}
                          >
                            {t.title}
                          </span>
                        </div>
                      );
                    })}
                    {rest > 0 && (
                      <div className="pl-[6px] text-[8.5px] leading-[11px] text-primary-400">
                        +{rest}...
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
        <div className="px-4 pt-3 text-center text-[11px] text-neutral-400">
          再次点击已选中的日期可进入日视图
        </div>
      </div>
    </div>
  );
}

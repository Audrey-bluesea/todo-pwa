import { useMemo, useRef, useState, useCallback } from 'react';
import type { Category, Todo } from '../types';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import SwipePager from '../components/SwipePager';
import {
  addDays,
  addMonths,
  dateKey,
  durationHours,
  fmtTime,
  isAllDay,
  isSameDay,
  isToday,
  startOfWeek,
  WEEK_CN,
} from '../lib/date';
import { solarToLunar } from '../lib/lunar';
import { groupByDate, makeCatMap } from '../lib/todoIndex';
import EmptyState from '../components/EmptyState';
import { IconChevronDown } from '../components/Icons';

export default function CalendarListView() {
  const todos = useDataStore((s) => s.todos);
  const categories = useDataStore((s) => s.categories);
  const selected = useUIStore((s) => s.viewDate);
  const selectedDate = useUIStore((s) => s.selectedDate);
  const setSelected = useUIStore((s) => s.setSelectedDate);
  const setViewDate = useUIStore((s) => s.setViewDate);
  const openEditor = useUIStore((s) => s.openEditor);

  const [collapsed, setCollapsed] = useState(false);
  const [animating, setAnimating] = useState(false);
  // 纵向拖拽偏移：正值=向下拉（展开方向），负值=向上滑（收起方向）
  const [dragOffset, setDragOffset] = useState(0);
  const touchRef = useRef<{ startX: number; startY: number; startYTime: number; dir: 'x' | 'y' | null } | null>(null);
  const calRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const byDate = useMemo(() => groupByDate(todos), [todos]);
  const catMap = useMemo(() => makeCatMap(categories), [categories]);
  const dayItems = byDate.get(dateKey(selected)) ?? [];

  // 左右滑月历切换月份：右滑=上月，左滑=下月
  const stepMonth = useCallback(
    (dir: number) => {
      const m = addMonths(selected, dir);
      const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      const nd = new Date(m.getFullYear(), m.getMonth(), Math.min(selected.getDate(), days));
      setViewDate(nd);
      setSelected(nd);
    },
    [selected, setViewDate, setSelected],
  );

  const pickDay = useCallback(
    (d: Date) => {
      setSelected(d);
      setViewDate(d);
    },
    [setSelected, setViewDate],
  );

  // ---- 纵向手势：上滑收起 / 下滑展开（方向锁，水平滑交给内部 SwipePager）----
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (animating) return;
      const t = e.touches[0];
      touchRef.current = { startX: t.clientX, startY: t.clientY, startYTime: Date.now(), dir: null };
    },
    [animating],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchRef.current || animating) return;
      const dx = e.touches[0].clientX - touchRef.current.startX;
      const dy = e.touches[0].clientY - touchRef.current.startY;
      if (touchRef.current.dir === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        touchRef.current.dir = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      // 水平方向：交给内部 SwipePager 处理月份切换，这里不干预
      if (touchRef.current.dir === 'x') return;
      // 垂直方向：上滑收起 / 下滑展开
      if (collapsed && dy < 0) return;
      if (!collapsed && dy > 0) return;
      const limited = Math.max(-120, Math.min(120, dy));
      setDragOffset(limited * 0.5);
    },
    [collapsed, animating],
  );

  const handleTouchEnd = useCallback(() => {
    if (!touchRef.current || animating) return;
    // 水平滑动不触发收起/展开
    if (touchRef.current.dir === 'x') {
      touchRef.current = null;
      return;
    }
    const dt = Date.now() - touchRef.current.startYTime;
    const threshold = 40;
    const velocityThresh = 180; // px/s
    const velocity = Math.abs(dragOffset / (dt / 1000));
    const shouldToggle = Math.abs(dragOffset) > threshold || velocity > velocityThresh;

    if (shouldToggle) {
      setAnimating(true);
      setDragOffset(0);
      setTimeout(() => {
        setCollapsed(!collapsed);
        setAnimating(false);
      }, 220);
    } else {
      setAnimating(true);
      setDragOffset(0);
      setTimeout(() => setAnimating(false), 220);
    }
    touchRef.current = null;
  }, [dragOffset, collapsed, animating]);

  // 点击收起的周栏 → 展开
  const expandCalendar = () => {
    if (!collapsed || animating) return;
    setAnimating(true);
    setCollapsed(false);
    setTimeout(() => setAnimating(false), 280);
  };

  // 纵向收起的 transform / 过渡
  const calTransform = (): string | undefined => {
    if (dragOffset !== 0) return `translateY(${dragOffset}px)`;
    if (collapsed && !animating) return 'translateY(0)';
    return undefined;
  };
  const calTransition = dragOffset !== 0 ? 'none' : 'transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  const calHeight = collapsed && !animating && dragOffset === 0 ? 'auto' : undefined;
  const calOverflow = collapsed && !animating && dragOffset === 0 ? 'hidden' : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 月历区域：外层管纵向收起，内部 SwipePager 管横向切月（轮播）*/}
      <div
        ref={calRef}
        className="shrink-0 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: calTransform(),
          transition: calTransition,
          height: calHeight,
          overflow: calOverflow,
          cursor: 'grab',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        {collapsed ? (
          <SwipePager
            current={selected}
            stepFn={addMonths}
            onCommit={(dir) => stepMonth(dir)}
            renderPane={(d) => (
              <ListWeekPane
                date={d}
                selectedDate={selectedDate}
                byDate={byDate}
                catMap={catMap}
                onPick={pickDay}
                onExpand={expandCalendar}
              />
            )}
          />
        ) : (
          <SwipePager
            current={selected}
            stepFn={addMonths}
            onCommit={(dir) => stepMonth(dir)}
            renderPane={(d) => (
              <ListMonthPane date={d} selectedDate={selectedDate} byDate={byDate} catMap={catMap} onPick={pickDay} />
            )}
          />
        )}
      </div>

      {/* 当日事项时间轴 */}
      <div ref={scrollRef} className="scroll-y min-h-0 flex-1 pb-8">
        <div className="sticky top-0 z-10 flex items-center gap-2 bg-appbg/90 px-4 py-2 backdrop-blur">
          <div className="flex flex-col leading-tight">
            <span className="text-[14px] font-semibold text-primary-700">
              {selected.getMonth() + 1}月{selected.getDate()}日
            </span>
            <span className="text-[11px] text-neutral-400">
              {solarToLunar(selected).monthName}
              {solarToLunar(selected).dayName}
            </span>
          </div>
          <div className="flex-1" />
        </div>

        {dayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <EmptyState title="这天还没有安排" desc="点「添加」记一件事" />
          </div>
        ) : (
          <div className="relative px-4 pb-40">
            <div
              className="absolute bottom-0 left-[82px] top-0 w-[1.5px] bg-primary-200/60"
            />

            <div className="space-y-3">
              {dayItems.map((t) => {
                const allDay = isAllDay(t.dueDate);
                const hasTime = t.dueDate && !allDay;
                const color = catMap.get(t.categoryId)?.color ?? '#A8D5BA';
                const dur = durationHours(t.dueDate, t.endDate);
                const rowH = allDay ? 72 : Math.min(120, Math.max(44, Math.round(48 + (dur > 0 ? dur * 5 : 0))));
                return (
                  <div key={t.id} className="relative flex items-center gap-3" style={{ minHeight: rowH }}>
                    <div className="w-[50px] shrink-0 pr-1 text-right leading-none flex items-center justify-end" style={{ height: rowH }}>
                      <span className="whitespace-nowrap text-[11px] tabular-nums text-neutral-400">
                        {allDay ? 'All Day' : hasTime && t.dueDate ? fmtTime(t.dueDate) : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-center" style={{ width: 9, height: 9 }}>
                      <div
                        className="h-[9px] w-[9px] rounded-full border-2"
                        style={{
                          borderColor: color,
                          backgroundColor: '#fff',
                        }}
                      />
                    </div>

                    <button
                      onClick={() => openEditor({ todoId: t.id })}
                      className="min-w-0 flex-1 rounded-2xl bg-white px-3.5 py-2.5 text-left shadow-card-soft press active:bg-primary-50"
                      style={{ minHeight: rowH }}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-[3px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[2px] border-[1.4px] ${
                            t.isCompleted ? 'border-primary-500 bg-primary-500' : 'border-primary-300 bg-white'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            useDataStore.getState().toggleTodo(t.id);
                          }}
                        >
                          {t.isCompleted && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12.5l4.5 4.5L19 7" />
                            </svg>
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-[15px] leading-snug ${
                              t.isCompleted ? 'text-neutral-700 line-through' : 'text-neutral-600'
                            }`}
                          >
                            {t.title}
                          </div>
                          {t.description && (
                            <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-neutral-400">
                              {t.description}
                            </div>
                          )}
                          <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-neutral-400">
                            {catMap.get(t.categoryId) && (
                              <>
                                <span className="text-[12px] leading-none">{catMap.get(t.categoryId)!.icon}</span>
                                <span>{catMap.get(t.categoryId)!.name}</span>
                              </>
                            )}
                            {(() => {
                              if (!t.endDate) return null;
                              const isCross = !isSameDay(t.dueDate as Date, t.endDate as Date);
                              if (allDay && isCross) {
                                const daySpan = Math.ceil(
                                  ((t.endDate as Date).getTime() - (t.dueDate as Date).getTime()) / 86400000,
                                ) + 1;
                                return <span className="tabular-nums text-neutral-350">· {daySpan}天</span>;
                              }
                              if (dur > 0 && !allDay) {
                                return (
                                  <span className="tabular-nums text-neutral-350">
                                    · {dur >= 1 ? `${Math.round(dur)}h` : `${Math.round(dur * 60)}m`}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 展开态：单个月份的整月网格（含星期标题），供 SwipePager 的三格轨道复用 */
function ListMonthPane({
  date,
  selectedDate,
  byDate,
  catMap,
  onPick,
}: {
  date: Date;
  selectedDate: Date;
  byDate: Map<string, Todo[]>;
  catMap: Map<string, Category>;
  onPick: (d: Date) => void;
}) {
  const weeks = useMemo(() => buildMonthWeeks(date), [date]);
  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 px-2 pb-0.5 pt-1.5">
        {WEEK_CN.map((w) => (
          <div key={w} className="text-center text-[11px] font-medium text-neutral-400">
            {w}
          </div>
        ))}
      </div>
      <div className="px-2 pb-1">
        {weeks.map((week, i) => (
          <div key={i} className="grid grid-cols-7">
            {week.map((d) => (
              <DayCell
                key={+d}
                date={d}
                selected={isSameDay(d, selectedDate)}
                inMonth={d.getMonth() === date.getMonth()}
                dots={dotColors(byDate.get(dateKey(d)), catMap)}
                onClick={() => onPick(d)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 收起态：本周一行（点空白处展开），供 SwipePager 复用 */
function ListWeekPane({
  date,
  selectedDate,
  byDate,
  catMap,
  onPick,
  onExpand,
}: {
  date: Date;
  selectedDate: Date;
  byDate: Map<string, Todo[]>;
  catMap: Map<string, Category>;
  onPick: (d: Date) => void;
  onExpand: () => void;
}) {
  const week = useMemo(() => {
    const s = startOfWeek(date);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [date]);
  return (
    <div onClick={onExpand} className="relative cursor-pointer px-2 pb-1">
      <div className="grid grid-cols-7">
        {week.map((d) => (
          <DayCell
            key={+d}
            date={d}
            selected={isSameDay(d, selectedDate)}
            inMonth
            dots={dotColors(byDate.get(dateKey(d)), catMap)}
            compact
            onClick={() => onPick(d)}
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-center">
        <IconChevronDown size={14} className="text-primary-400 animate-bounce" />
      </div>
    </div>
  );
}

function DayCell({
  date,
  selected,
  inMonth,
  dots,
  compact,
  onClick,
}: {
  date: Date;
  selected: boolean;
  inMonth: boolean;
  dots: string[];
  compact?: boolean;
  onClick: () => void;
}) {
  const today = isToday(date);
  const lunar = solarToLunar(date);

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center py-0.5"
      style={{ minHeight: 44 }}
    >
      <span
        className={`flex flex-col items-center justify-center rounded-[13px] px-1 transition-colors ${
          compact ? 'h-[40px] w-[40px]' : 'h-[42px] w-[42px]'
        } ${
          today ? 'bg-primary-500' : selected ? 'bg-primary-100 ring-1 ring-primary-400' : 'active:bg-primary-100'
        }`}
      >
        <span
          className={`text-[15px] font-medium leading-none tabular-nums ${
            today ? 'text-white' : inMonth ? 'text-neutral-600' : 'text-neutral-300'
          }`}
        >
          {date.getDate()}
        </span>
        <span
          className={`mt-[2px] max-w-[38px] truncate text-[9px] leading-none ${
            today ? 'text-white/85' : inMonth ? 'text-neutral-400' : 'text-neutral-300'
          }`}
        >
          {lunar.label}
        </span>
      </span>
      <span className="mt-[2px] flex h-[4px] items-center gap-[2px]">
        {dots.slice(0, 3).map((c, i) => (
          <span key={i} className="h-[4px] w-[4px] rounded-full" style={{ backgroundColor: today ? '#85C09A' : c }} />
        ))}
      </span>
    </button>
  );
}

function dotColors(items: Todo[] | undefined, catMap: Map<string, Category>): string[] {
  if (!items) return [];
  const out: string[] = [];
  for (const t of items) {
    if (t.isCompleted) continue;
    out.push(catMap.get(t.categoryId)?.color ?? '#A8D5BA');
    if (out.length >= 3) break;
  }
  return out;
}

/** 生成当月周行（周一起始），只渲染覆盖当月的行 */
function buildMonthWeeks(d: Date): Date[][] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const start = startOfWeek(first);
  const weeks: Date[][] = [];
  let cur = start;
  while (cur <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
    cur = addDays(cur, 7);
  }
  return weeks;
}

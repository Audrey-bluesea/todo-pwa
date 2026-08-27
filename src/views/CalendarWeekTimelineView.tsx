import { useEffect, useMemo, useRef, useState } from 'react';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import { useTimerStore } from '../store/timerStore';
import {
  addDays,
  dateKey,
  endOfDay,
  fmtTime,
  isAllDay,
  isSameDay,
  isToday,
  startOfDay,
  weekDays,
  WEEK_CN,
} from '../lib/date';
import { solarToLunar } from '../lib/lunar';
import { activeTodosOn, groupByDate, makeCatMap } from '../lib/todoIndex';
import { assignLanes, hexToRgba, darkenHex } from '../lib/calendarLanes';
import { stripEmoji } from '../lib/text';
import SwipePager from '../components/SwipePager';

const HOUR_H = 68;
const GUTTER = 40;
const TEXT_MIN_H = 11;
const TIME_TEXT_MIN_H = 22;

export default function CalendarWeekTimelineView() {
  const selected = useUIStore((s) => s.viewDate);
  const setViewDate = useUIStore((s) => s.setViewDate);
  const setSelected = useUIStore((s) => s.setSelectedDate);

  // 左右滑切换周：左滑=下一周，右滑=上一周（与日/月视图一致，过渡丝滑）
  const onCommit = (dir: number) => {
    const nd = addDays(selected, dir * 7);
    setSelected(nd);
    setViewDate(nd);
  };

  return (
    <SwipePager
      current={selected}
      stepFn={(d, n) => addDays(d, n * 7)}
      onCommit={onCommit}
      renderPane={(d) => <WeekPane date={d} />}
      className="h-full w-full"
    />
  );
}

function WeekPane({ date }: { date: Date }) {
  const setViewDate = useUIStore((s) => s.setViewDate);
  const setSelected = useUIStore((s) => s.setSelectedDate);
  const setCalendarView = useUIStore((s) => s.setCalendarView);

  const todos = useDataStore((s) => s.todos);
  const categories = useDataStore((s) => s.categories);
  const timeEntries = useTimerStore((s) => s.timeEntries);
  const running = useTimerStore((s) => s.running);
  const openEditor = useUIStore((s) => s.openEditor);
  const setEditingTimeEntry = useUIStore((s) => s.setEditingTimeEntry);

  const catMap = useMemo(() => makeCatMap(categories), [categories]);
  const byDate = useMemo(() => groupByDate(todos), [todos]);
  const days = useMemo(() => weekDays(date), [date]);
  const weekStartKey = dateKey(days[0]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());

  // 整周最早的有时间任务小时，用于初始滚动定位（无则默认 8 点）
  const anchorHour = useMemo(() => {
    let min: number | null = null;
    for (const d of days) {
      const items = (byDate.get(dateKey(d)) ?? []).filter((t) => !isAllDay(t.dueDate));
      for (const t of items) {
        const h = (t.dueDate as Date).getHours();
        if (min === null || h < min) min = h;
      }
    }
    return min === null ? 8 : Math.max(0, min - 1);
  }, [days, byDate]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = anchorHour * HOUR_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartKey]);

  const goToDay = (d: Date) => {
    setSelected(d);
    setViewDate(d);
    setCalendarView('day');
  };

  return (
    // 与日时间轴一致：前两行（日期头 / 全天任务）固定不滚动，第三行 1fr 占满剩余高度，
    // 内部用 absolute inset-0 做滚动容器，仅时间轴区域可纵向滑动，避开 iOS WebKit 的 flex 滚动 bug。
    <div className="grid min-h-0 h-full w-full max-w-full min-w-0 grid-rows-[auto_auto_1fr] overflow-x-hidden">
      {/* 日期头：固定置顶，纵向滑动时间轴时始终停留最上方；点击进入日视图 */}
      <div className="day-week-header shrink-0 border-b border-primary-100 bg-[rgb(var(--c-appbg))] px-0 pb-1 pt-1.5">
        <div className="flex">
          <div style={{ width: GUTTER }} className="shrink-0" />
          <div className="grid flex-1 grid-cols-7">
            {days.map((d, i) => {
              const td = isToday(d);
              const has = (byDate.get(dateKey(d)) ?? []).length > 0;
              return (
                <button
                  key={+d}
                  onClick={() => goToDay(d)}
                  className="flex min-w-0 flex-col items-center justify-center gap-[1px] py-1"
                  style={{ minHeight: 46 }}
                >
                  <span className="text-[10.5px] font-medium text-neutral-400">{WEEK_CN[i]}</span>
                  <span
                    className={`flex h-[28px] w-[28px] items-center justify-center rounded-full text-[14px] font-semibold tabular-nums ${
                      td ? 'bg-primary-500 text-white' : 'text-neutral-600'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <span className="w-full truncate px-[1px] text-center text-[8.5px] leading-none text-neutral-400">
                    {solarToLunar(d).label}
                  </span>
                  <span
                    className="h-[3px] w-[3px] rounded-full"
                    style={{ backgroundColor: has ? 'rgb(var(--c-success))' : 'transparent' }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 全天任务行：固定，不随时间轴滚动 */}
      <div className="all-day-section shrink-0 border-b border-primary-100 py-2">
        <div className="flex">
          <div
            style={{ width: GUTTER }}
            className="flex shrink-0 items-start justify-end pr-2 pt-0.5"
          >
            <span className="text-[10px] font-medium tracking-wide text-neutral-400">全天</span>
          </div>
          <div className="grid flex-1 grid-cols-7 gap-px">
            {days.map((d) => (
              <AllDayCell key={+d} date={d} todos={todos} catMap={catMap} openEditor={openEditor} />
            ))}
          </div>
        </div>
      </div>

      {/* 时间轴：占满剩余高度，仅此区域纵向滚动（与日时间轴一致） */}
      <div className="relative min-h-0 w-full max-w-full overflow-hidden">
        <div ref={scrollRef} className="scroll-y absolute inset-0 w-full overflow-x-hidden pt-4">
          <div className="relative w-full min-w-0" style={{ height: 25 * HOUR_H }}>
            {/* 小时线（贯穿 7 列） */}
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute left-0 right-0" style={{ top: h * HOUR_H, height: HOUR_H }}>
                <div className="border-t border-primary-200" style={{ marginLeft: GUTTER }} />
                <span
                  className="absolute left-0 pr-2 text-[10px] tabular-nums text-neutral-400 leading-none"
                  style={{ width: GUTTER, textAlign: 'right', top: -6 }}
                >
                  {String(h).padStart(2, '0')}
                </span>
              </div>
            ))}

            <div className="absolute left-0 right-0" style={{ top: 24 * HOUR_H, height: HOUR_H }}>
              <div className="border-t border-dashed border-primary-300" style={{ marginLeft: GUTTER }} />
              <span
                className="absolute left-0 pr-2 text-[10px] tabular-nums font-semibold text-primary-500 leading-none"
                style={{ width: GUTTER, textAlign: 'right', top: -5.5 }}
              >
                00
              </span>
            </div>

            {/* 7 列事件区（等分剩余宽度，与日期头对齐） */}
            <div className="absolute inset-y-0 grid grid-cols-7" style={{ left: GUTTER, right: 0 }}>
              {days.map((d) => (
                <DayColumn
                  key={+d}
                  date={d}
                  todos={todos}
                  timeEntries={timeEntries}
                  running={running}
                  catMap={catMap}
                  now={now}
                  openEditor={openEditor}
                  setEditingTimeEntry={setEditingTimeEntry}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 单日列：全天任务之外的计时/定时任务块 */
function DayColumn({
  date,
  todos,
  timeEntries,
  running,
  catMap,
  now,
  openEditor,
  setEditingTimeEntry,
}: {
  date: Date;
  todos: any[];
  timeEntries: any[];
  running: any[];
  catMap: Map<string, any>;
  now: Date;
  openEditor: (opts: { todoId?: string; date?: Date | null }) => void;
  setEditingTimeEntry: (id: string | null) => void;
}) {
  const dayStart = startOfDay(date);
  const nextDay = addDays(dayStart, 1);

  // 当日定时任务（非全天，含跨天段）
  const timedSegs = useMemo(() => {
    const active = activeTodosOn(todos, date).filter((t) => !isAllDay(t.dueDate));
    return active.map((t) => {
      const s = t.dueDate as Date;
      const e = t.endDate ?? new Date(s.getTime() + 30 * 60000);
      const segStart = s < dayStart ? dayStart : s;
      const segEnd = e > nextDay ? nextDay : e;
      return { id: t.id, segStart, segEnd, isStartDay: isSameDay(s, date), todo: t };
    });
  }, [todos, date, dayStart, nextDay]);

  // 当日计时记录（含进行中）
  const teSegs = useMemo(() => {
    const completed = timeEntries.filter(
      (e) =>
        isSameDay(e.start, date) ||
        (e.end && isSameDay(e.end, date)) ||
        (e.end && e.start < dayStart && e.end > endOfDay(date)),
    );
    const live = running
      .filter((r) => isSameDay(new Date(r.start), date))
      .map((r) => ({
        id: r.id,
        start: new Date(r.start),
        end: null as Date | null,
        title: r.title,
        todoId: r.todoId ?? null,
        categoryId: r.categoryId ?? null,
        live: true,
      }));
    const all = [
      ...completed.map((e) => ({
        id: e.id,
        start: e.start,
        end: e.end,
        title: e.title,
        categoryId: e.categoryId ?? null,
        todoId: e.todoId ?? null,
        live: false,
      })),
      ...live,
    ];
    return all.map((e) => {
      const s = e.start as Date;
      const eEnd = e.end ?? now;
      const segStart = s < dayStart ? dayStart : s;
      const segEnd = eEnd > nextDay ? nextDay : eEnd;
      return { id: e.id, segStart, segEnd, isStartDay: isSameDay(s, date), entry: e };
    });
  }, [timeEntries, running, date, dayStart, nextDay, now]);

  const timedTodoIds = useMemo(
    () => new Set(timedSegs.filter((x) => x.todo).map((x) => x.todo.id)),
    [timedSegs],
  );

  // 分栏：合并定时任务与未合并的计时块
  const lanes = useMemo(() => {
    const input = [
      ...timedSegs.map((x) => ({ id: x.id, dueDate: x.segStart, endDate: x.segEnd })),
      ...teSegs
        .filter((x) => !(x.entry.todoId && timedTodoIds.has(x.entry.todoId)))
        .map((x) => ({ id: x.id, dueDate: x.segStart, endDate: x.segEnd })),
    ];
    return assignLanes(input);
  }, [timedSegs, teSegs, timedTodoIds]);

  const pos = (segStart: Date, segEnd: Date) => {
    const top = (segStart.getTime() - dayStart.getTime()) / 60000 * (HOUR_H / 60);
    const h = (segEnd.getTime() - segStart.getTime()) / 60000 * (HOUR_H / 60);
    return { top, h };
  };

  return (
    <div className="relative min-w-0 border-l border-primary-100 first:border-l-0">
      {/* 定时任务块 */}
      {timedSegs.map((seg) => {
        const t = seg.todo;
        const title = stripEmoji(t.title);
        const color = catMap.get(t.categoryId)?.color ?? '#A8D5BA';
        const { top, h: evtH } = pos(seg.segStart, seg.segEnd);
        const lane = lanes.get(t.id) ?? { index: 0, total: 1 };
        const laneW = 100 / lane.total;
        const leftPct = `calc(${lane.index * laneW}% + 1px)`;
        const widthPct = `calc(${laneW}% - 2px)`;
        const showTimeText = seg.isStartDay;

        return (
          <button
            key={t.id}
            onClick={() => openEditor({ todoId: t.id })}
            className="day-event absolute mx-[1px] flex items-start overflow-hidden rounded-[4px] px-1 py-0 text-left shadow-card-soft bg-white"
            style={{
              top,
              left: leftPct,
              width: widthPct,
              height: evtH,
              borderLeft: `3px solid ${color}`,
            }}
          >
            {evtH >= TEXT_MIN_H && (
              <div className="min-w-0 flex-1">
                {showTimeText && evtH >= TIME_TEXT_MIN_H ? (
                  <>
                    <div
                      className={`overflow-hidden break-words leading-tight text-[10px] ${
                        t.isCompleted ? 'text-neutral-700 line-through' : 'text-neutral-600'
                      }`}
                    >
                      {running.some((r) => r.todoId === t.id) && (
                        <span className="mr-1 inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-red-500 align-middle" />
                      )}
                      {title}
                    </div>
                    <div className="overflow-hidden whitespace-nowrap text-[9px] text-primary-500">
                      {fmtTime(seg.segStart)}
                    </div>
                  </>
                ) : (
                  <div
                    className={`overflow-hidden break-words leading-tight ${
                      evtH < 16 ? 'text-[9px]' : 'text-[10px]'
                    } ${t.isCompleted ? 'text-neutral-700 line-through' : 'text-neutral-600'}`}
                  >
                    {running.some((r) => r.todoId === t.id) && (
                      <span className="mr-1 inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-red-500 align-middle" />
                    )}
                    {title}
                  </div>
                )}
              </div>
            )}
          </button>
        );
      })}

      {/* 计时记录块 */}
      {teSegs.map((seg) => {
        if (seg.entry.todoId && timedTodoIds.has(seg.entry.todoId)) return null;
        const e = seg.entry;
        const title = stripEmoji(e.title);
        const catColor = e.categoryId ? catMap.get(e.categoryId)?.color : null;
        const accent = catColor || '#6BBF8A';
        const bgLight = catColor ? hexToRgba(catColor, 0.6) : 'rgb(var(--c-primary-100))';
        const { top, h: evtH } = pos(seg.segStart, seg.segEnd);
        const lane = lanes.get(e.id) ?? { index: 0, total: 1 };
        const laneW = 100 / lane.total;
        const leftPct = `calc(${lane.index * laneW}% + 1px)`;
        const widthPct = `calc(${laneW}% - 2px)`;
        const showTimeText = seg.isStartDay;
        const textColor = catColor ? darkenHex(accent, 0.55) : 'rgb(var(--c-primary-800))';
        const timeColor = catColor ? darkenHex(accent, 0.25) : 'rgb(var(--c-primary-600))';

        return (
          <button
            key={e.id}
            onClick={() => setEditingTimeEntry(e.id)}
            className="day-event absolute mx-[1px] flex items-start overflow-hidden rounded-[4px] px-1 py-0 text-left shadow-card-soft"
            style={{
              top,
              left: leftPct,
              width: widthPct,
              height: evtH,
              backgroundColor: bgLight,
              borderLeft: `3px solid ${accent}`,
            }}
          >
            {evtH >= TEXT_MIN_H && (
              <div className="min-w-0 flex-1">
                {showTimeText && evtH >= TIME_TEXT_MIN_H ? (
                  <>
                    <div className="overflow-hidden break-words leading-tight text-[10px]" style={{ color: textColor }}>
                      {e.live && (
                        <span className="mr-1 inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-red-500 align-middle" />
                      )}
                      {title}
                    </div>
                    <div className="overflow-hidden whitespace-nowrap text-[9px]" style={{ color: timeColor }}>
                      {fmtTime(seg.segStart)}
                      {!e.end ? ' · 进行中' : ''}
                    </div>
                  </>
                ) : (
                  <div
                    className={`overflow-hidden break-words leading-tight ${evtH < 16 ? 'text-[9px]' : 'text-[10px]'}`}
                    style={{ color: textColor }}
                  >
                    {e.live && (
                      <span className="mr-1 inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-red-500 align-middle" />
                    )}
                    {title}
                  </div>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 全天任务单元格（单日） */
function AllDayCell({
  date,
  todos,
  catMap,
  openEditor,
}: {
  date: Date;
  todos: any[];
  catMap: Map<string, any>;
  openEditor: (opts: { todoId?: string }) => void;
}) {
  const items = useMemo(() => activeTodosOn(todos, date).filter((t) => isAllDay(t.dueDate)), [todos, date]);
  const cross = items.filter((t) => !!t.endDate && !isSameDay(t.dueDate, t.endDate));
  const single = items.filter((t) => !(t.endDate && !isSameDay(t.dueDate, t.endDate)));
  const isStart = (t: any) => isSameDay(t.dueDate, date);

  // 方案 B：不内嵌滚动，随内容增高；最多显示 2 条，超出显示「+N 更多」
  const MAX_VISIBLE = 2;
  const rendered = [
    ...cross.map((t) => ({ kind: 'cross' as const, t, showFull: isStart(t) })),
    ...single.map((t) => ({ kind: 'single' as const, t, showFull: false })),
  ];
  const visible = rendered.slice(0, MAX_VISIBLE);
  const overflow = rendered.length - visible.length;

  return (
    <div className="min-w-0 px-[1px]">
      {items.length === 0 ? (
        <div className="py-1 text-center text-[10px] text-neutral-300">—</div>
      ) : (
        <div className="space-y-1">
          {visible.map(({ kind, t, showFull }) => {
            const color = catMap.get(t.categoryId)?.color ?? '#A8D5BA';
            const title = stripEmoji(t.title);
            const baseBtn = 'flex w-full items-center gap-1 overflow-hidden rounded-[4px] px-1.5 py-1 text-left';
            const baseStyle = {
              backgroundColor: color + '2E',
              borderLeft: `3px solid ${color}`,
              minHeight: 24,
            };
            if (kind === 'cross' && !showFull) {
              // 跨天任务的延续日：显示标题 + 结束日，一眼知道是哪件事
              return (
                <button key={t.id} onClick={() => openEditor({ todoId: t.id })} className={baseBtn} style={baseStyle}>
                  <span className="shrink-0 text-[8px] text-neutral-400">↳</span>
                  <span className="min-w-0 flex-1 overflow-hidden break-words text-[10px] font-medium text-neutral-700">
                    {title}
                  </span>
                  <span className="shrink-0 text-[8px] tabular-nums text-neutral-500">
                    {t.endDate!.getMonth() + 1}/{t.endDate!.getDate()}
                  </span>
                </button>
              );
            }
            if (kind === 'cross' && showFull) {
              return (
                <button key={t.id} onClick={() => openEditor({ todoId: t.id })} className={baseBtn} style={baseStyle}>
                  <span className="min-w-0 flex-1 overflow-hidden break-words text-[10px] font-medium text-neutral-700">
                    {title}
                  </span>
                  <span className="shrink-0 text-[8px] tabular-nums text-neutral-500">
                    {t.dueDate!.getMonth() + 1}/{t.dueDate!.getDate()}–{t.endDate!.getMonth() + 1}/{t.endDate!.getDate()}
                  </span>
                </button>
              );
            }
            // 单日全天
            return (
              <button key={t.id} onClick={() => openEditor({ todoId: t.id })} className={baseBtn} style={baseStyle}>
                <span className="mr-0.5 inline-block h-[6px] w-[6px] shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span
                  className={`min-w-0 flex-1 overflow-hidden break-words text-[10px] ${
                    t.isCompleted ? 'text-neutral-700 line-through' : 'font-medium text-neutral-700'
                  }`}
                >
                  {title}
                </span>
              </button>
            );
          })}
          {overflow > 0 && (
            <div className="px-1.5 py-0.5 text-[9px] font-medium text-neutral-400">+{overflow} 更多</div>
          )}
        </div>
      )}
    </div>
  );
}

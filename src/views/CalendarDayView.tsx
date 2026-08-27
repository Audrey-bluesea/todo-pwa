import { useEffect, useMemo, useRef, useState } from 'react';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import { useTimerStore } from '../store/timerStore';
import SwipePager from '../components/SwipePager';
import {
  addDays,
  dateKey,
  durationHours,
  endOfDay,
  fmtTime,
  isAllDay,
  isSameDay,
  isToday,
  pad,
  startOfDay,
  startOfWeek,
  WEEK_CN,
} from '../lib/date';
import { solarToLunar } from '../lib/lunar';
import { groupByDate, activeTodosOn, makeCatMap } from '../lib/todoIndex';
import { assignLanes, hexToRgba, darkenHex } from '../lib/calendarLanes';

const HOUR_H = 60;
const GUTTER = 52;

export default function CalendarDayView() {
  const selected = useUIStore((s) => s.viewDate);
  const setViewDate = useUIStore((s) => s.setViewDate);
  const setSelected = useUIStore((s) => s.setSelectedDate);

  // 左右滑切换天：右滑=前一天，左滑=后一天
  const stepDay = (dir: number) => {
    const nd = addDays(selected, dir);
    setSelected(nd);
    setViewDate(nd);
  };

  return (
    <SwipePager
      current={selected}
      stepFn={addDays}
      onCommit={(dir) => stepDay(dir)}
      renderPane={(d) => <DayPane date={d} />}
      className="h-full w-full"
    />
  );
}

function DayPane({ date }: { date: Date }) {
  const todos = useDataStore((s) => s.todos);
  const categories = useDataStore((s) => s.categories);
  const selectedDate = useUIStore((s) => s.selectedDate);
  const openEditor = useUIStore((s) => s.openEditor);
  const setSelected = useUIStore((s) => s.setSelectedDate);
  const setViewDate = useUIStore((s) => s.setViewDate);

  const catMap = useMemo(() => makeCatMap(categories), [categories]);
  const byDate = useMemo(() => groupByDate(todos), [todos]);
  const timeEntries = useTimerStore((s) => s.timeEntries);
  const running = useTimerStore((s) => s.running);
  const setEditingTimeEntry = useUIStore((s) => s.setEditingTimeEntry);
  const items = byDate.get(dateKey(date)) ?? [];
  const allDayItems = useMemo(
    () => activeTodosOn(todos, date).filter((t) => isAllDay(t.dueDate)),
    [todos, date],
  );
  const crossAllDay = allDayItems.filter((t) => !!t.endDate && !isSameDay(t.dueDate, t.endDate));
  const singleAllDay = allDayItems.filter((t) => !(t.endDate && !isSameDay(t.dueDate, t.endDate)));
  const timed = items.filter((t) => !isAllDay(t.dueDate));
  const timedTodoIds = useMemo(() => new Set(timed.map((t) => t.id)), [timed]);

  // 当日计时记录（含进行中实时块）：跨天记录在开始日和结束日都渲染色块，时间文字只写在开始日
  const { teItems } = useMemo(() => {
    const completed = timeEntries.filter(
      (e) =>
        isSameDay(e.start, date) ||
        (e.end && isSameDay(e.end, date)) ||
        (e.end && e.start < startOfDay(date) && (e.end as Date) > endOfDay(date)),
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
    const items = [
      ...completed.map((e) => ({ id: e.id, start: e.start, end: e.end, title: e.title, categoryId: e.categoryId ?? null, todoId: e.todoId ?? null, live: false })),
      ...live,
    ];
    return { teItems: items };
  }, [timeEntries, running, date]);

  // 计划任务 + 计时记录 共享同一套分栏：占满整条时间轴，按时间重叠自动分列，互不重叠
  // 已与当日任务合并的计时块不占栏，避免把任务块挤窄
  const allLanes = useMemo(() => {
    const evs = [
      ...timed.map((t) => ({ id: t.id, dueDate: t.dueDate as Date, endDate: (t.endDate ?? null) as Date | null })),
      ...teItems
        .filter((e) => !(e.todoId && timedTodoIds.has(e.todoId)))
        .map((e) => ({ id: e.id, dueDate: e.start as Date, endDate: (e.end ?? new Date()) as Date | null })),
    ];
    return assignLanes(evs);
  }, [timed, teItems, timedTodoIds]);

  const currentWeek = useMemo(() => {
    const s = startOfWeek(date);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [date]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const showNow = isToday(date);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchorHour = timed.length
      ? Math.max(0, (timed[0].dueDate as Date).getHours() - 1)
      : Math.max(0, new Date().getHours() - 1);
    el.scrollTop = anchorHour * HOUR_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey(date)]);

  const nowTop = (now.getHours() * 60 + now.getMinutes()) * (HOUR_H / 60);

  return (
    // 改用 CSS Grid：前两行放日期行/全天任务，第三行 1fr 占满剩余空间。
    // Grid item 有明确高度，内部再用 absolute inset-0 做滚动容器，可避开 iOS WebKit
    // 对 flex item 滚动容器计算 scrollHeight 的 bug。
    <div className="grid min-h-0 h-full w-full max-w-full grid-rows-[auto_auto_1fr] overflow-x-hidden">
      {/* 本周日期行 */}
      <div className="day-week-header shrink-0 border-b border-primary-100 px-2 pb-1 pt-1.5">
        <div className="grid grid-cols-7">
          {WEEK_CN.map((w) => (
            <div key={w} className="text-center text-[10.5px] font-medium text-neutral-400">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {currentWeek.map((d) => {
            const sel = isSameDay(d, selectedDate);
            const td = isToday(d);
            const has = (byDate.get(dateKey(d)) ?? []).length > 0;
            return (
              <button
                key={+d}
                onClick={() => {
                  setSelected(d);
                  setViewDate(d);
                }}
                className="flex flex-col items-center justify-center gap-[1px] py-1"
                style={{ minWidth: 0, minHeight: 46 }}
              >
                <span
                  className={`flex h-[28px] w-[28px] items-center justify-center rounded-full text-[14px] font-semibold tabular-nums ${
                    sel ? 'bg-primary-500 text-white' : td ? 'bg-primary-100 text-primary-700' : 'text-neutral-600'
                  }`}
                >
                  {d.getDate()}
                </span>
                <span
                  className={`w-full truncate px-[1px] text-center text-[8.5px] leading-none ${
                    sel ? 'text-primary-600' : 'text-neutral-400'
                  }`}
                >
                  {solarToLunar(d).label}
                </span>
                <span className="h-[3px] w-[3px] rounded-full" style={{ backgroundColor: has ? 'rgb(var(--c-success))' : 'transparent' }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* 全天任务区 */}
      <div className="all-day-section shrink-0 border-b border-primary-100 px-3 py-2">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11px] font-medium tracking-wide text-neutral-400">全天</span>
          <div className="flex-1" />
        </div>
        {allDayItems.length === 0 ? (
          <div className="text-[12px] text-neutral-400">没有全天任务</div>
        ) : (
          <div className="space-y-1.5">
            {crossAllDay.map((t) => {
              const color = catMap.get(t.categoryId)?.color ?? '#A8D5BA';
              const sd = t.dueDate as Date;
              const ed = t.endDate as Date;
              return (
                <button
                  key={t.id}
                  onClick={() => openEditor({ todoId: t.id })}
                  className={`flex w-full items-center gap-2 rounded-[4px] px-3 py-2 text-left press`}
                  style={{ backgroundColor: color + '2E', borderLeft: `4px solid ${color}`, minHeight: 42 }}
                >
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-500">
                    {sd.getMonth() + 1}/{sd.getDate()}
                  </span>
                  <span
                      className={`min-w-0 flex-1 truncate text-[13px] font-medium ${
                      t.isCompleted ? 'line-through text-neutral-700' : 'text-neutral-700'
                    }`}
                  >
                    {t.title}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-500">
                    {ed.getMonth() + 1}/{ed.getDate()}
                  </span>
                </button>
              );
            })}
            {singleAllDay.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {singleAllDay.map((t) => {
                  const color = catMap.get(t.categoryId)?.color ?? '#A8D5BA';
                  return (
                    <button
                      key={t.id}
                      onClick={() => openEditor({ todoId: t.id })}
                      className={`max-w-full truncate rounded-full px-2.5 py-1.5 text-[12px] press ${
                        t.isCompleted ? 'line-through text-neutral-600' : 'text-neutral-700'
                      }`}
                      style={{ backgroundColor: color + '2E', minHeight: 36 }}
                    >
                      {t.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 时间轴 */}
      {/* 用 grid-row 明确拿到剩余高度，再套一层 relative + absolute inset-0 滚动容器。
         避免把 flex item 自身当滚动容器时 iOS WebKit 算不出 scrollHeight 的问题。 */}
      <div className="relative min-h-0 w-full max-w-full overflow-hidden">
        <div ref={scrollRef} className="scroll-y absolute inset-0 w-full overflow-x-hidden pt-4">
          <div className="relative w-full max-w-full" style={{ height: 24 * HOUR_H + 68 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="absolute left-0 right-0" style={{ top: h * HOUR_H, height: HOUR_H }}>
              <div className="border-t border-primary-200" style={{ marginLeft: GUTTER }} />
              <span
                className="absolute left-0 pr-2 text-[11px] tabular-nums text-neutral-400 leading-none"
                style={{ width: GUTTER, textAlign: 'right', top: -6.5 }}
              >
                {pad(h)}:00
              </span>
            </div>
          ))}

          <div className="absolute left-0 right-0" style={{ top: 24 * HOUR_H, height: HOUR_H }}>
            <div className="border-t border-dashed border-primary-300" style={{ marginLeft: GUTTER }} />
            <span
              className="absolute left-0 pr-2 text-[11px] tabular-nums font-semibold text-primary-500 leading-none"
              style={{ width: GUTTER, textAlign: 'right', top: -5 }}
            >
              00:00
            </span>
          </div>

          <div className="absolute inset-y-0" style={{ left: GUTTER, right: 8 }}>
            {timed.map((t) => {
              const d = t.dueDate as Date;
              const end = t.endDate as Date | undefined;
              const color = catMap.get(t.categoryId)?.color ?? '#A8D5BA';
              const hasEnd = !!end && !isAllDay(end);
              const crossesMidnight = hasEnd && !isSameDay(d, end!);
              const isStartDay = isSameDay(d, date);
              const isEndDay = hasEnd && isSameDay(end!, date);
              // 跨天任务：只在该跨天区间内（开始日或结束日）渲染，其它日期不显示
              if (crossesMidnight && !isStartDay && !isEndDay) return null;

              const lane = allLanes.get(t.id) ?? { index: 0, total: 1 };
              const laneW = 100 / lane.total;
              const leftPct = `calc(${lane.index * laneW}% + 2px)`;
              const widthPct = `calc(${laneW}% - 4px)`;

              let top: number;
              let evtH: number;
              let showTimeText: boolean;
              if (crossesMidnight && isEndDay) {
                // 结束日延续段：00:00 → 实际结束时间，彩色块，不显示时间文字
                top = 0;
                evtH = (end!.getHours() * 60 + end!.getMinutes()) * (HOUR_H / 60);
                showTimeText = false;
              } else {
                // 开始日 / 同日任务
                top = (d.getHours() * 60 + d.getMinutes()) * (HOUR_H / 60);
                evtH = HOUR_H / 6;
                if (hasEnd) {
                  const dur = durationHours(d, end);
                  if (crossesMidnight) evtH = 24 * HOUR_H - top;
                  else if (dur > 0) evtH = dur * HOUR_H;
                }
                showTimeText = true;
              }
              if (top + evtH > 24 * HOUR_H) evtH = 24 * HOUR_H - top;

              return (
                <button
                  key={t.id}
                  onClick={() => openEditor({ todoId: t.id })}
                  className={`day-event absolute overflow-hidden rounded-[4px] px-2 py-1 shadow-card-soft text-left ${
                    evtH < 32 ? 'items-center' : 'items-start'
                  } flex bg-white`}
                  style={{
                    top,
                    left: leftPct,
                    width: widthPct,
                    height: evtH,
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    {showTimeText && evtH >= 36 ? (
                      <>
                        <div
                          className={`truncate leading-tight text-[13px] ${
                            t.isCompleted ? 'text-neutral-700 line-through' : 'text-neutral-600'
                          }`}
                        >
                          {running.some((r) => r.todoId === t.id) && (
                            <span className="mr-1 inline-block h-[6px] w-[6px] animate-pulse rounded-full bg-red-500 align-middle" />
                          )}
                          {t.title}
                        </div>
                        <div className="truncate text-[10.5px] text-primary-500">
                          {hasEnd ? `${fmtTime(d)}–${fmtTime(t.endDate!)}` : fmtTime(d)}
                        </div>
                      </>
                    ) : showTimeText ? (
                      <div
                        className={`flex items-center gap-1 truncate leading-tight ${
                          evtH < 28 ? 'text-[10px]' : 'text-[13px]'
                        } ${t.isCompleted ? 'text-neutral-700 line-through' : 'text-neutral-600'}`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {running.some((r) => r.todoId === t.id) && (
                            <span className="mr-1 inline-block h-[6px] w-[6px] animate-pulse rounded-full bg-red-500 align-middle" />
                          )}
                          {t.title}
                        </span>
                        <span className="shrink-0 text-primary-500">
                          {hasEnd ? `${fmtTime(d)}–${fmtTime(t.endDate!)}` : fmtTime(d)}
                        </span>
                      </div>
                    ) : (
                      <div
                        className={`truncate leading-tight ${
                          evtH < 28
                            ? `text-[10px] ${t.isCompleted ? 'text-neutral-700 line-through' : 'text-neutral-600'}`
                            : `text-[13px] ${t.isCompleted ? 'text-neutral-700 line-through' : 'text-neutral-600'}`
                        }`}
                      >
                        {running.some((r) => r.todoId === t.id) && (
                          <span className="mr-1 inline-block h-[6px] w-[6px] animate-pulse rounded-full bg-red-500 align-middle" />
                        )}
                        {t.title}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

            {/* 计时记录块：按清单分类着色（与当日任务合并的块不单独渲染） */}
            {teItems.map((e) => {
              // 关联任务且命中当日 → 已由任务块在同一时间呈现，跳过避免重复
              if (e.todoId && timedTodoIds.has(e.todoId)) return null;
              const rawStart = e.start as Date;
              const rawEnd = e.end ?? now;
              const catColor = e.categoryId ? catMap.get(e.categoryId)?.color : null;
              const accent = catColor || '#6BBF8A';
              const bgLight = catColor ? hexToRgba(catColor, 0.60) : 'rgb(var(--c-primary-100))';

              const isStartDay = isSameDay(rawStart, date);
              const isEndDay = !!e.end && isSameDay(rawEnd, date);
              const isCrossDay = !!e.end && !isSameDay(rawStart, rawEnd);

              let top: number;
              let evtH: number;
              let showTimeText: boolean;
              if (isCrossDay && isEndDay && !isStartDay) {
                // 结束日：从 00:00 渲染到实际结束时间，不显示时间文字
                top = 0;
                evtH = (rawEnd.getHours() * 60 + rawEnd.getMinutes()) * (HOUR_H / 60);
                showTimeText = false;
              } else {
                // 开始日 / 同日：从实际开始时间渲染到午夜（跨天）或实际时长
                top = (rawStart.getHours() * 60 + rawStart.getMinutes()) * (HOUR_H / 60);
                if (isCrossDay) {
                  evtH = 24 * HOUR_H - top;
                } else {
                  const durH = (rawEnd.getTime() - rawStart.getTime()) / 3600000;
                  evtH = durH > 0 ? durH * HOUR_H : HOUR_H / 6;
                }
                showTimeText = true;
              }
              if (top + evtH > 24 * HOUR_H) evtH = 24 * HOUR_H - top;

              const lane = allLanes.get(e.id) ?? { index: 0, total: 1 };
              const laneW = 100 / lane.total;
              const leftPct = `calc(${lane.index * laneW}% + 2px)`;
              const widthPct = `calc(${laneW}% - 4px)`;

              return (
                <button
                  key={e.id}
                  onClick={() => setEditingTimeEntry(e.id)}
                  className={`day-event absolute flex overflow-hidden rounded-[4px] px-2 py-1 text-left shadow-card-soft ${
                    evtH < 32 ? 'items-center' : 'items-start'
                  }`}
                  style={{
                    top,
                    left: leftPct,
                    width: widthPct,
                    height: evtH,
                    backgroundColor: bgLight,
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    {showTimeText && evtH >= 36 ? (
                      <>
                        <div
                          className={`truncate leading-tight ${evtH < 28 ? 'text-[10px]' : 'text-[13px]'}`}
                          style={{ color: catColor ? darkenHex(accent, 0.55) : 'rgb(var(--c-primary-800))' }}
                        >
                          {e.live && (
                            <span className="mr-1 inline-block h-[6px] w-[6px] animate-pulse rounded-full bg-red-500 align-middle" />
                          )}
                          {e.title}
                        </div>
                        <div className="truncate text-[10.5px]" style={{ color: catColor ? darkenHex(accent, 0.25) : 'rgb(var(--c-primary-600))' }}>
                          {fmtTime(rawStart)}
                          {e.end ? `–${fmtTime(rawEnd)}` : ' · 进行中'}
                        </div>
                      </>
                    ) : showTimeText ? (
                      <div
                        className={`flex items-center gap-1 truncate leading-tight ${evtH < 28 ? 'text-[10px]' : 'text-[13px]'}`}
                        style={{ color: catColor ? darkenHex(accent, 0.55) : 'rgb(var(--c-primary-800))' }}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {e.live && (
                            <span className="mr-1 inline-block h-[6px] w-[6px] animate-pulse rounded-full bg-red-500 align-middle" />
                          )}
                          {e.title}
                        </span>
                        <span className="shrink-0" style={{ color: catColor ? darkenHex(accent, 0.25) : 'rgb(var(--c-primary-600))' }}>
                          {fmtTime(rawStart)}
                          {e.end ? `–${fmtTime(rawEnd)}` : ' · 进行中'}
                        </span>
                      </div>
                    ) : (
                      <div
                        className={`truncate leading-tight ${evtH < 28 ? 'text-[10px]' : 'text-[13px]'}`}
                        style={{ color: catColor ? darkenHex(accent, 0.55) : 'rgb(var(--c-primary-800))' }}
                      >
                        {e.live && (
                          <span className="mr-1 inline-block h-[6px] w-[6px] animate-pulse rounded-full bg-red-500 align-middle" />
                        )}
                        {e.title}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {showNow && (
            <div className="pointer-events-none absolute left-0 right-2" style={{ top: nowTop }}>
              <div className="flex items-center" style={{ marginTop: -6.5 }}>
                <span className="w-[44px] shrink-0 pr-1 text-right text-[10px] font-semibold tabular-nums text-primary-400">
                  {fmtTime(now)}
                </span>
                <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-primary-400" />
                <span className="h-[1.5px] flex-1 bg-primary-400" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}

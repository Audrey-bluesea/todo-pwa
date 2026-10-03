import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../store/uiStore';
import { useDataStore } from '../store/dataStore';
import { useTimerStore, fmtDuration } from '../store/timerStore';
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  addDays,
  isSameDay,
  fmtTime,
  fmtDate,
} from '../lib/date';
import { IconClose, IconRecap } from './Icons';
import type { TimeEntry } from '../types';

/* ---------- 睡眠洞察辅助 ---------- */
interface SleepAgg {
  hasData: boolean;
  avgDailyMs?: number;
  daysWithSleep?: number;
  avgBed?: string;
  avgWake?: string;
  regularity?: string;
  usualFrom?: string;
  usualTo?: string;
  trend?: { date: Date; ms: number }[];
  maxSleep?: number;
  lastAgo?: string;
  lastDur?: string;
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** 睡眠柱上的紧凑时长：如 7h32m / 6h / 45m */
const fmtShort = (ms: number): string => {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m}m` : `${h}h${pad2(m)}`;
};

/** 时钟时刻（分钟 0–1439）的圆形均值，正确处理跨午夜（23:30 与 00:30 平均成 00:00） */
function clockMeanMin(times: number[]): number {
  if (!times.length) return 0;
  let s = 0;
  let c = 0;
  for (const t of times) {
    const a = (t / 1440) * 2 * Math.PI;
    s += Math.sin(a);
    c += Math.cos(a);
  }
  let m = (Math.atan2(s, c) / (2 * Math.PI)) * 1440;
  if (m < 0) m += 1440;
  return m;
}

/** 时钟时刻的圆形标准差（分钟），衡量规律性 */
function clockStdMin(times: number[]): number {
  if (times.length < 2) return 0;
  let s = 0;
  let c = 0;
  for (const t of times) {
    const a = (t / 1440) * 2 * Math.PI;
    s += Math.sin(a);
    c += Math.cos(a);
  }
  const R = Math.sqrt(s * s + c * c) / times.length;
  if (R >= 1) return 0;
  return Math.sqrt(-2 * Math.log(R)) * (1440 / (2 * Math.PI));
}

const fmtHM = (min: number): string => {
  min = (((Math.round(min) % 1440) + 1440) % 1440);
  return `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
};

const agoText = (ms: number): string => {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
};

/** 睡眠归属日：凌晨 5 点前入睡算前一天（兜住夜猫子跨零点） */
const sleepAttrDay = (start: Date): Date => {
  const h = start.getHours();
  return h < 5 ? addDays(startOfDay(start), -1) : startOfDay(start);
};

/* ---------- 小部件 ---------- */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-[13px] font-semibold tracking-wide text-neutral-400">{title}</div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-white/60 px-3 py-4 text-center text-[13px] text-neutral-400 border border-primary-100">
      {text}
    </div>
  );
}

function SegBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-full py-2 text-[14px] font-medium press ${
        active ? 'bg-primary-500 text-white' : 'bg-primary-50 text-primary-600'
      }`}
      style={{ minHeight: 38 }}
    >
      {label}
    </button>
  );
}

/* ---------- 回顾页 ---------- */
export default function RecapView() {
  const open = useUIStore((s) => s.recapOpen);
  const setOpen = useUIStore((s) => s.setRecapOpen);
  const todos = useDataStore((s) => s.todos);
  const categories = useDataStore((s) => s.categories);
  const timeEntries = useTimerStore((s) => s.timeEntries);
  const [mode, setMode] = useState<'day' | 'week' | 'habit'>('day');

  const data = useMemo(() => {
    const now = new Date();
    const dayStart = startOfDay(now);
    const dayEnd = endOfDay(now);
    const wkStart = startOfWeek(now);
    const wkEnd = endOfDay(addDays(wkStart, 6));

    const rangeStart = mode === 'day' ? dayStart : wkStart;
    const rangeEnd = mode === 'day' ? dayEnd : wkEnd;

    const completed = todos
      .filter(
        (t) =>
          t.isCompleted &&
          t.completedAt &&
          t.completedAt >= rangeStart &&
          t.completedAt <= rangeEnd,
      )
      .sort((a, b) => (b.completedAt!.getTime() - a.completedAt!.getTime()));

    const pending =
      mode === 'day'
        ? todos.filter((t) => !t.isCompleted && t.dueDate && isSameDay(t.dueDate, dayStart))
        : [];

    // 计时按分类汇总
    const catMap = new Map<string, { name: string; color: string }>();
    for (const c of categories) catMap.set(c.id, { name: c.name, color: c.color ?? '#6BAA7A' });
    const UNCAT = { name: '未分类', color: '#C8D5CA' };

    const dist = new Map<string, { name: string; color: string; ms: number }>();
    let totalMs = 0;
    for (const e of timeEntries) {
      if (!e.end) continue;
      if (e.start < rangeStart || e.start > rangeEnd) continue;
      const ms = e.end.getTime() - e.start.getTime();
      if (ms <= 0) continue;
      totalMs += ms;
      const key = e.categoryId ?? '';
      const meta = key ? catMap.get(key) ?? UNCAT : UNCAT;
      const cur = dist.get(key) ?? { ...meta, ms: 0 };
      cur.ms += ms;
      dist.set(key, cur);
    }
    const distArr = [...dist.values()].sort((a, b) => b.ms - a.ms);
    const maxMs = distArr.length ? distArr[0].ms : 0;

    // 睡眠洞察（固定近 14 天窗口）
    const sleepWinStart = startOfDay(addDays(now, -13));
    const sleepWinEnd = endOfDay(now);
    const SLEEP_KW = ['睡', '眠', 'sleep'];
    const sleepCatName = (id: string | null) =>
      id ? (catMap.get(id)?.name ?? '').toLowerCase() : '';
    const isSleep = (e: TimeEntry): boolean => {
      if (!e.end) return false;
      const t = (e.title || '').toLowerCase();
      const c = sleepCatName(e.categoryId);
      return SLEEP_KW.some((k) => t.includes(k) || c.includes(k));
    };
    const sleepAll = timeEntries.filter(isSleep);
    const sleepInWin = sleepAll.filter((e) => {
      const a = sleepAttrDay(e.start);
      return a >= sleepWinStart && a <= sleepWinEnd;
    });

    let sleep: SleepAgg = { hasData: false };
    if (sleepInWin.length) {
      let totalMs = 0;
      const daySet = new Set<string>();
      const dayMs = new Map<string, number>();
      const bedMins: number[] = [];
      const wakeMins: number[] = [];
      for (const e of sleepInWin) {
        const ms = e.end!.getTime() - e.start.getTime();
        if (ms <= 0) continue;
        totalMs += ms;
        const a = sleepAttrDay(e.start);
        const key = fmtDate(a);
        daySet.add(key);
        dayMs.set(key, (dayMs.get(key) ?? 0) + ms);
        bedMins.push(e.start.getHours() * 60 + e.start.getMinutes());
        wakeMins.push(e.end!.getHours() * 60 + e.end!.getMinutes());
      }
      const daysWithSleep = daySet.size;
      const bedMean = clockMeanMin(bedMins);
      const bedStd = clockStdMin(bedMins);
      const wakeMean = clockMeanMin(wakeMins);
      const regularity =
        bedStd < 30 ? '很规律' : bedStd < 60 ? '比较规律' : '起伏较大';
      const sleepTrend = Array.from({ length: 14 }, (_, i) => {
        const d = addDays(sleepWinStart, i);
        return { date: d, ms: dayMs.get(fmtDate(d)) ?? 0 };
      });
      const maxSleep = Math.max(1, ...sleepTrend.map((t) => t.ms));
      const last = [...sleepAll].sort((a, b) => b.start.getTime() - a.start.getTime())[0];
      const lastMs = last.end!.getTime() - last.start.getTime();
      sleep = {
        hasData: true,
        avgDailyMs: daysWithSleep ? totalMs / daysWithSleep : 0,
        daysWithSleep,
        avgBed: fmtHM(bedMean),
        avgWake: fmtHM(wakeMean),
        regularity,
        usualFrom: fmtHM(bedMean - bedStd),
        usualTo: fmtHM(bedMean + bedStd),
        trend: sleepTrend,
        maxSleep,
        lastAgo: agoText(now.getTime() - last.end!.getTime()),
        lastDur: fmtDuration(lastMs),
      };
    }

    return { completed, pending, distArr, maxMs, totalMs, sleep };
  }, [todos, categories, timeEntries, mode]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[55] flex flex-col bg-appbg">
      {/* 顶部：标题 + 关闭 + 今日/本周/习惯切换（pt-safe + tg-glow 避开 iOS 27 顶部模糊带） */}
      <div className="pt-safe tg-glow">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-primary-500">
              <IconRecap size={22} />
            </span>
            <div className="text-[22px] font-bold leading-tight text-primary-700">回顾</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="关闭"
            className="hit flex h-9 w-9 items-center justify-center rounded-xl text-primary-500 press active:bg-primary-50"
          >
            <IconClose size={22} />
          </button>
        </div>
        <div className="flex gap-2 px-5 pb-3">
          <SegBtn label="今日" active={mode === 'day'} onClick={() => setMode('day')} />
          <SegBtn label="本周" active={mode === 'week'} onClick={() => setMode('week')} />
          <SegBtn label="习惯" active={mode === 'habit'} onClick={() => setMode('habit')} />
        </div>
      </div>

      {/* 内容区 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-safe pt-1">
        {mode !== 'habit' && (
          <>
            {/* 英雄卡：完成数 + 计时合计 */}
            <div className="mb-5 rounded-2xl bg-primary-50/70 px-5 py-4">
          <div className="text-[13px] text-primary-600">{mode === 'day' ? '今天完成' : '本周完成'}</div>
          <div className="mt-0.5 text-[28px] font-bold leading-tight text-primary-700 tabular-nums">
            {data.completed.length}
            <span className="ml-1 text-[15px] font-medium text-primary-500">件</span>
          </div>
          {data.totalMs > 0 && (
            <div className="mt-1 text-[13px] text-neutral-500">计时 {fmtDuration(data.totalMs)}</div>
          )}
        </div>

        {/* 已完成清单 */}
        <Section title="已完成">
          {data.completed.length === 0 ? (
            <Empty text="还没有勾掉任何事" />
          ) : (
            <div className="space-y-1">
              {data.completed.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border border-primary-100 bg-white px-3 py-2.5"
                >
                  <span className="text-primary-500 shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4 4 10-10" />
                    </svg>
                  </span>
                  <span className="flex-1 truncate text-[14px] text-neutral-700">{t.title}</span>
                  {t.completedAt && (
                    <span className="shrink-0 text-[12px] tabular-nums text-neutral-400">
                      {fmtTime(t.completedAt)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 时间都花在哪（按分类） */}
        <Section title="时间都花在哪">
          {data.distArr.length === 0 ? (
            <Empty text="还没有计时记录" />
          ) : (
            <div className="space-y-2.5">
              {data.distArr.map((d) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-1.5 text-neutral-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}
                    </span>
                    <span className="tabular-nums text-neutral-400">{fmtDuration(d.ms)}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-primary-100/60">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${data.maxMs ? (d.ms / data.maxMs) * 100 : 0}%`,
                        backgroundColor: d.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
          </>
        )}

        {/* 睡眠洞察（固定近 14 天，仅「习惯」Tab） */}
        {mode === 'habit' && data.sleep.hasData && (
          <Section title="睡眠">
            <div className="mb-3 rounded-2xl bg-primary-50/70 px-5 py-4">
              <div className="text-[13px] text-primary-600">近 14 天日均睡眠</div>
              <div className="mt-0.5 text-[28px] font-bold leading-tight text-primary-700 tabular-nums">
                {fmtDuration(data.sleep.avgDailyMs ?? 0)}
              </div>
              <div className="mt-1 text-[12px] text-neutral-500">
                按有记录的天（{data.sleep.daysWithSleep} 天）
              </div>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-primary-100 bg-white px-3 py-2.5">
                <div className="text-[12px] text-neutral-400">平均入睡</div>
                <div className="mt-0.5 text-[18px] font-semibold tabular-nums text-neutral-700">
                  {data.sleep.avgBed}
                </div>
              </div>
              <div className="rounded-xl border border-primary-100 bg-white px-3 py-2.5">
                <div className="text-[12px] text-neutral-400">平均起床</div>
                <div className="mt-0.5 text-[18px] font-semibold tabular-nums text-neutral-700">
                  {data.sleep.avgWake}
                </div>
              </div>
            </div>

            <div className="mb-3 text-[12px] text-neutral-500">
              多在 {data.sleep.usualFrom}–{data.sleep.usualTo} 间入睡 · {data.sleep.regularity}
            </div>

            <div className="mb-2 text-[13px] text-neutral-400">近 14 天</div>
            <div className="mb-1 flex items-end gap-1">
              {data.sleep.trend!.map((t, i) => {
                const pct = t.ms > 0 ? Math.max((t.ms / data.sleep.maxSleep!) * 100, 12) : 3;
                const isShort = t.ms > 0 && t.ms < 360 * 60000;
                const color = t.ms === 0 ? '#D3D1C7' : isShort ? '#EF9F27' : '#639922';
                return (
                  <div key={i} className="flex flex-1 flex-col items-center">
                    <div className="flex w-full items-end" style={{ height: 78 }}>
                      <div
                        className="relative w-full rounded-sm"
                        style={{ height: `${pct}%`, backgroundColor: color }}
                      >
                        {t.ms > 0 && (
                          <span
                            className="absolute inset-0 flex items-center justify-center whitespace-nowrap text-[8.5px] font-medium leading-none tabular-nums"
                            style={{
                              // 亮橙底压不住白字，改用深棕；深绿底用白字+阴影
                              color: isShort ? '#5A3A00' : '#FFFFFF',
                              textShadow: isShort ? 'none' : '0 0 2px rgba(0,0,0,0.45)',
                            }}
                          >
                            {fmtShort(t.ms)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="mt-1 whitespace-nowrap text-[8.5px] leading-none tabular-nums text-neutral-400">
                      {`${t.date.getMonth() + 1}/${pad2(t.date.getDate())}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mb-3 text-[11px] text-neutral-400">
              绿色=睡够 · 橙色=偏短（不足 6 小时）
            </div>

            <div className="rounded-xl border border-primary-100 bg-white px-3 py-2.5 text-[13px] text-neutral-600">
              最近一次 · {data.sleep.lastAgo} · 睡了 {data.sleep.lastDur}
            </div>
          </Section>
        )}
        {mode === 'habit' && !data.sleep.hasData && (
          <Empty text="近 14 天还没有睡眠记录（用计时记录「睡 / 眠 / sleep」即可自动统计）" />
        )}

        {/* 还没做完（仅今日） */}
        {mode === 'day' && (
          <Section title="还没做完">
            {data.pending.length === 0 ? (
              <Empty text="今天的都搞定啦" />
            ) : (
              <div className="space-y-1">
                {data.pending.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-xl border border-primary-100 bg-white px-3 py-2.5"
                  >
                    <span className="h-4 w-4 shrink-0 rounded border-2 border-neutral-300" />
                    <span className="flex-1 truncate text-[14px] text-neutral-600">{t.title}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        <div className="pb-2 pt-1 text-center text-[11px] text-neutral-400">
          数据来自本机记录 · 离线可用
        </div>
      </div>
    </div>,
    document.body,
  );
}

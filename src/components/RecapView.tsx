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
  weekDays,
  isSameDay,
  fmtTime,
  WEEK_CN,
} from '../lib/date';
import { IconClose, IconRecap } from './Icons';

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
  const [mode, setMode] = useState<'day' | 'week'>('day');

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

    // 本周每日完成趋势
    const days = mode === 'week' ? weekDays(now) : [];
    const trend = days.map((d) => ({
      date: d,
      count: completed.filter((t) => t.completedAt && isSameDay(t.completedAt, d)).length,
    }));
    const maxTrend = trend.length ? Math.max(1, ...trend.map((t) => t.count)) : 0;

    return { completed, pending, distArr, maxMs, totalMs, trend, maxTrend };
  }, [todos, categories, timeEntries, mode]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[55] flex flex-col bg-appbg">
      {/* 顶部：标题 + 关闭 + 今日/本周切换（pt-safe + tg-glow 避开 iOS 27 顶部模糊带） */}
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
        </div>
      </div>

      {/* 内容区 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-safe pt-1">
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

        {/* 一周完成趋势（仅本周） */}
        {mode === 'week' && (
          <Section title="一周完成趋势">
            <div className="flex items-end justify-between gap-1.5" style={{ height: 92 }}>
              {data.trend.map((t, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-md bg-primary-200"
                      style={{
                        height: `${t.count ? Math.max((t.count / data.maxTrend) * 100, 8) : 3}%`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-neutral-400">{WEEK_CN[i]}</span>
                </div>
              ))}
            </div>
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

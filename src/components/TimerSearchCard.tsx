import { useMemo } from 'react';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import type { TimeEntry } from '../types';
import { fmtTime, fmtDateFriendly } from '../lib/date';
import Highlight from './Highlight';

const FALLBACK_COLOR = '#B9B4A8';

/**
 * 搜索结果中的计时记录卡片。点按打开该条记录的编辑弹层（TimerEntryEditSheet）。
 */
export default function TimerSearchCard({ entry, query }: { entry: TimeEntry; query: string }) {
  const categories = useDataStore((s) => s.categories);
  const setEditingTimeEntry = useUIStore((s) => s.setEditingTimeEntry);

  const catColor = useMemo(() => {
    if (!entry.categoryId) return FALLBACK_COLOR;
    return categories.find((c) => c.id === entry.categoryId)?.color ?? FALLBACK_COLOR;
  }, [categories, entry.categoryId]);

  const range = entry.end ? `${fmtTime(entry.start)} – ${fmtTime(entry.end)}` : '进行中';

  return (
    <button
      onClick={() => setEditingTimeEntry(entry.id)}
      className="flex w-full items-stretch gap-2 rounded-card bg-white px-3 py-2 text-left shadow-card-soft press active:bg-primary-50"
    >
      <span className="w-[4px] shrink-0 self-stretch rounded-full" style={{ backgroundColor: catColor }} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[15px] font-medium text-neutral-700">
            <Highlight text={entry.title} query={query} />
          </span>
          <span className="shrink-0 text-[12px] tabular-nums text-neutral-400">{range}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-400">
          <span className="shrink-0">{fmtDateFriendly(entry.start)}</span>
          {entry.note && (
            <span className="truncate text-neutral-500">
              <Highlight text={entry.note} query={query} />
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

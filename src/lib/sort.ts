import type { Todo } from '../types';

/**
 * 「已完成」排序用的「有效完成时间」：保证「刚刚完成的」永远排在历史任务之上。
 *
 *  - 有 completedAt：用它本身；但若落在未来（历史坏数据，例如提前勾掉、截止日还在未来），
 *    视作最旧 → 0，避免压住今天真实完成的任务。
 *  - 无 completedAt（历史任务）：回退到截止日（仅当它已过去），否则创建时间，再否则 0。
 *
 * 这样无论历史数据多乱，今天刚勾掉的任务一定排最顶。列表视图与看板视图共用，避免两处逻辑分叉。
 */
export function effCompletedAt(t: Todo): number {
  if (t.completedAt) {
    const v = +new Date(t.completedAt);
    return v > Date.now() ? 0 : v;
  }
  if (t.dueDate) {
    const d = +new Date(t.dueDate);
    if (d <= Date.now()) return d;
  }
  if (t.createdAt) return +new Date(t.createdAt);
  return 0;
}

/**
 * 手动排序比较器（默认 / 「手动」排序方式）：
 * 已完成沉底 → 其余按 sortOrder（创建序）升序。
 * 列表视图与看板视图在 sortMode==='manual' 时共用，替代各自散落的 sortDefault / bySort。
 */
export function sortManual(a: Todo, b: Todo): number {
  return Number(a.isCompleted) - Number(b.isCompleted) || a.sortOrder - b.sortOrder;
}

/**
 * 按日期升序比较器（「按日期」排序方式的有日期区块用）：
 * 有日期按 dueDate 升序，无日期视为最大（沉底），同刻按 sortOrder 兜底。
 */
export function byDueAsc(a: Todo, b: Todo): number {
  const av = a.dueDate ? +a.dueDate : Number.MAX_SAFE_INTEGER;
  const bv = b.dueDate ? +b.dueDate : Number.MAX_SAFE_INTEGER;
  return av - bv || a.sortOrder - b.sortOrder;
}

/**
 * 判断任务是否「有日期」（用于「按日期」模式下把列/块切成「有日期锁顶 / 无日期沉底可拖」两段）。
 */
export function hasDue(t: Todo): boolean {
  return !!t.dueDate;
}

/**
 * 「按分组」列/块内排序拆分（列表与看板共用，保证「有日期锁顶、无日期沉底可拖」规则一致）：
 *  - manual 模式：所有任务按 sortManual 排成一段（dated 为空，undated = 全部）。
 *  - date 模式：有日期按 byDueAsc 升序锁顶（dated），无日期按 sortManual 沉底成可拖段（undated）。
 */
export function splitForSort(arr: Todo[], mode: 'manual' | 'date'): { dated: Todo[]; undated: Todo[] } {
  if (mode !== 'date') {
    return { dated: [], undated: arr.slice().sort(sortManual) };
  }
  const dated = arr.filter(hasDue).sort(byDueAsc);
  const undated = arr.filter((t) => !t.dueDate).sort(sortManual);
  return { dated, undated };
}

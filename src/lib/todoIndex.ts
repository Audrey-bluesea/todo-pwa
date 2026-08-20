import type { Category, Todo } from '../types';
import { dateKey, isAllDay } from './date';

/**
 * 按日期分组任务。
 * 跨天任务（endDate 在不同日期）会同时出现在起始日和结束日的桶中，
 * 以便日/周视图在两天都能渲染对应的色块段。
 */
export function groupByDate(todos: Todo[]): Map<string, Todo[]> {
  const map = new Map<string, Todo[]>();
  for (const t of todos) {
    if (!t.dueDate) continue;
    // 始终放入开始日期
    const startK = dateKey(t.dueDate);
    push(map, startK, t);
    // 如果有结束时间且跨天，也放入结束日期
    if (t.endDate && !isAllDay(t.dueDate) && !isAllDay(t.endDate)) {
      const endK = dateKey(t.endDate);
      if (endK !== startK) {
        push(map, endK, t);
      }
    }
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const aAll = isAllDay(a.dueDate) ? 0 : 1;
      const bAll = isAllDay(b.dueDate) ? 0 : 1;
      if (aAll !== bAll) return aAll - bAll;
      return (+(a.dueDate as Date)) - (+(b.dueDate as Date));
    });
  }
  return map;
}

function push(map: Map<string, Todo[]>, k: string, t: Todo): void {
  const arr = map.get(k);
  if (arr) arr.push(t);
  else map.set(k, [t]);
}

export function catColor(cat: Category | undefined): string {
  return cat?.color ?? '#A8D5BA';
}

/**
 * 返回某一天「活跃」的所有任务：
 * - 单点任务（无 endDate）仅当天命中；
 * - 跨天任务（endDate 在不同日期）在 dueDate~endDate 区间内每一天都命中。
 * 用于周/月视图，使跨天任务在持续期内的每一天都出现，而非只在起始日显示一次。
 */
export function activeTodosOn(todos: Todo[], day: Date): Todo[] {
  const dk = dateKey(day);
  const out: Todo[] = [];
  for (const t of todos) {
    if (!t.dueDate) continue;
    const startK = dateKey(t.dueDate);
    const endK = t.endDate ? dateKey(t.endDate) : startK;
    if (dk >= startK && dk <= endK) out.push(t);
  }
  out.sort((a, b) => {
    const aAll = isAllDay(a.dueDate) ? 0 : 1;
    const bAll = isAllDay(b.dueDate) ? 0 : 1;
    if (aAll !== bAll) return aAll - bAll;
    return (+(a.dueDate as Date)) - (+(b.dueDate as Date));
  });
  return out;
}

export function makeCatMap(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]));
}

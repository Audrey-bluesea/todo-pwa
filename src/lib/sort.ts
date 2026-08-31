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

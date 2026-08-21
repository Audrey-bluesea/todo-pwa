/**
 * 时间轴通用工具：重叠分栏 + 颜色处理。
 * 被日时间轴、周时间轴共用。
 */

/**
 * 计算时间轴事件的重叠分栏（苹果日历式智能重叠处理）。
 * 思路：按开始时间排序，把时间上相交的事件聚成一个 cluster，
 * 在 cluster 内贪心分配列（每列内的事件互不重叠），
 * 返回每个事件所处的列索引 index 与总列数 total。
 */
export function assignLanes(
  items: { id: string; dueDate: Date | null; endDate: Date | null }[],
): Map<string, { index: number; total: number }> {
  const sorted = [...items].sort((a, b) => +(a.dueDate as Date) - +(b.dueDate as Date));
  const result = new Map<string, { index: number; total: number }>();
  let cluster: { id: string; start: number; end: number }[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const cols: { id: string; end: number }[][] = [];
    for (const ev of cluster) {
      let placed = false;
      for (const col of cols) {
        if (col[col.length - 1].end <= ev.start) {
          col.push(ev);
          placed = true;
          break;
        }
      }
      if (!placed) cols.push([ev]);
    }
    const total = cols.length;
    cols.forEach((col, ci) => {
      for (const ev of col) result.set(ev.id, { index: ci, total });
    });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const t of sorted) {
    const s = +(t.dueDate as Date);
    const e = t.endDate ? +(t.endDate as Date) : s + 30 * 60 * 1000;
    if (cluster.length > 0 && s >= clusterEnd) flush();
    cluster.push({ id: t.id, start: s, end: e });
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return result;
}

/** hex (#RRGGBB) → rgba(...) */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 往黑色方向混合（factor=0.5 表示 50% 黑），用于生成深色文字色 */
export function darkenHex(hex: string, factor: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * (1 - factor));
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * (1 - factor));
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * (1 - factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

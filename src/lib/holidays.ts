import { dateKey } from './date';

/**
 * 中国大陆法定节假日 / 调休上班日标记。
 *
 * 数据来源：国务院办公厅《关于 2026 年部分节假日安排的通知》（2025-11-04 发布）。
 * 放假安排由国务院每年约 11 月发布次年安排，没有可推导的固定规则，
 * 因此只能内置官方数据，不能靠算法算出来。
 *
 * 更新方式：每年国办发布新通知后，在下面两个常量里补上对应年份即可；
 * 没有数据的年份不会显示任何标记（不会出错）。
 */

export type HolidayMark =
  | { type: 'rest'; name: string }
  | { type: 'work' };

/** 放假区间：[起始日, 结束日, 节日名]（含首尾） */
const REST_RANGES: Array<[string, string, string]> = [
  ['2026-01-01', '2026-01-03', '元旦'],
  ['2026-02-15', '2026-02-23', '春节'],
  ['2026-04-04', '2026-04-06', '清明节'],
  ['2026-05-01', '2026-05-05', '劳动节'],
  ['2026-06-19', '2026-06-21', '端午节'],
  ['2026-09-25', '2026-09-27', '中秋节'],
  ['2026-10-01', '2026-10-07', '国庆节'],
];

/** 调休上班日：本应休息但要上班（周末补班） */
const WORK_DAYS: string[] = [
  '2026-01-04', // 元旦调休（周日）
  '2026-02-14', // 春节调休（周六）
  '2026-02-28', // 春节调休（周六）
  '2026-05-09', // 劳动节调休（周六）
  '2026-09-20', // 国庆调休（周日）
  '2026-10-10', // 国庆调休（周六）
];

/** 按本地时区解析 YYYY-MM-DD，避免 new Date('2026-01-01') 被当成 UTC 导致差一天 */
function parseYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const MARK_MAP: Record<string, HolidayMark> = {};

for (const [start, end, name] of REST_RANGES) {
  const cur = parseYMD(start);
  const last = parseYMD(end);
  while (cur <= last) {
    MARK_MAP[dateKey(cur)] = { type: 'rest', name };
    cur.setDate(cur.getDate() + 1);
  }
}
// 调休单独写入，放在最后确保不会被放假区间覆盖
for (const day of WORK_DAYS) {
  MARK_MAP[day] = { type: 'work' };
}

/** 查询某天的节假日标记；无安排则返回 null */
export function holidayMark(date: Date): HolidayMark | null {
  return MARK_MAP[dateKey(date)] ?? null;
}

/** 内置数据覆盖的年份（用于提示"该年暂无数据"） */
export const HOLIDAY_YEARS: number[] = Array.from(
  new Set(Object.keys(MARK_MAP).map((k) => Number(k.slice(0, 4)))),
).sort((a, b) => a - b);

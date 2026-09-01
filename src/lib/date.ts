export const MS_DAY = 86400000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return x;
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(d: Date | null): boolean {
  return isSameDay(d, new Date());
}

export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_DAY);
}

/** 周一为一周起点 */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const wd = (x.getDay() + 6) % 7; // 0 = Monday
  return addDays(x, -wd);
}

export function weekDays(d: Date): Date[] {
  const s = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** 月视图 6×7 网格（周一起始） */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function dateKey(d: Date): string {
  return fmtDate(d);
}

/** 全天任务约定：时分为 00:00 */
export function isAllDay(d: Date | null): boolean {
  return !!d && d.getHours() === 0 && d.getMinutes() === 0;
}

/** 计算持续时长（小时）。无结束时间返回 0；全天任务返回 24 */
export function durationHours(dueDate: Date | null, endDate: Date | null): number {
  if (!dueDate || !endDate) return 0;
  if (isAllDay(dueDate) && isAllDay(endDate)) {
    // 全天跨天：按天数 × 24
    return Math.max(1, Math.round((endDate.getTime() - dueDate.getTime()) / MS_DAY)) * 24;
  }
  return (endDate.getTime() - dueDate.getTime()) / 3600000;
}

export const WEEK_CN = ['一', '二', '三', '四', '五', '六', '日'];
export const WEEK_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** 英文月份缩写（0=Jan），用于日期选择器头部 */
export const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 日历网格星期头（周日起始，与 JS getDay() 对齐） */
export const WEEK_EN_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 人类友好日期（别名 humanDate，供编辑器时间行显示） */
export function fmtDateFriendly(d: Date): string {
  return humanDate(d);
}

/** 人类可读的相对日期 */
export function humanDate(d: Date): string {
  const diff = dayDiff(d, new Date());
  if (diff === 0) return '今天';
  if (diff === 1) return '明天';
  if (diff === -1) return '昨天';
  if (diff > 1 && diff <= 7) return `周${WEEK_CN[(d.getDay() + 6) % 7]}`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 打卡时间戳（卡片右上角浅淡展示用）：始终完整绝对时间，格式 `8/25 18:02`。
 * 跨年时补上年份（`2025/8/25 18:02`），避免去年完成的被误读成今年。
 */
export function completedStamp(d: Date): string {
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const now = new Date();
  const datePart = d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}/${md}`;
  return `${datePart} ${fmtTime(d)}`;
}

export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

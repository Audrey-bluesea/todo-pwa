export interface Category {
  id: string;
  name: string;
  icon: string; // 用户自定义 Emoji
  color?: string; // 分类标识色（取自抹茶色板）
  /** 清单内的分组（可选） */
  sections?: { id: string; name: string; sortOrder: number }[];
  createdAt: Date;
  sortOrder: number;
}

export interface SubTask {
  id: string;
  content: string;
  isCompleted: boolean;
}

/** 计时记录：一次开始→结束的时间段，可关联任务也可纯自由计时 */
export interface TimeEntry {
  id: string;
  /** 关联任务 id；自由计时为 null */
  todoId: string | null;
  /** 记录标题（自由计时默认「自由计时」，绑任务时为任务标题） */
  title: string;
  /** 关联分类 id（来自绑定任务，自由计时为 null） */
  categoryId: string | null;
  /** 开始时间 */
  start: Date;
  /** 结束时间；null 表示正在进行中 */
  end: Date | null;
  note?: string;
  createdAt: Date;
}

export interface Todo {
  id: string;
  categoryId: string;
  /** 所属 section（可选，用于清单内分组） */
  sectionId: string | null;
  title: string;
  /** 补充说明（显示在卡片标题下方） */
  description: string;
  /**
   * 开始时间。约定：时分为 00:00 表示「全天任务」，
   * 其它时间点则在日时间轴上定位显示。
   */
  dueDate: Date | null;
  /**
   * 结束时间（可选）。不填则为单点时刻；
   * 填写后表示持续时段，可跨天。
   */
  endDate: Date | null;
  subTasks: SubTask[];
  isCompleted: boolean;
  /** 完成时间（用于已完成视图排序） */
  completedAt: Date | null;
  sortOrder: number;
  createdAt: Date;
  /**
   * 提醒设置：null 表示不提醒。
   * enabled=true 且 leadMin 为提前分钟数（0=准点，5/10/15/30=提前）。
   * 仅对带 dueDate 的清单任务生效；时间到由后端推送服务触发。
   */
  reminder?: { enabled: boolean; leadMin: number } | null;
}

export interface QuickTimerPreset {
  id: string;
  title: string;
  /** 关联分类 id；'' 或 null 表示收集箱 */
  categoryId: string | null;
  createdAt: Date;
  sortOrder: number;
}

export type TabKey = 'todos' | 'calendar';
export type TodoViewMode = 'list' | 'board';
export type CalendarViewMode = 'list' | 'day' | 'week' | 'month';
/** 周视图内部的两种子模式：卡片 / 时间轴 */
export type CalendarWeekMode = 'cards' | 'timeline';

/** 抽屉里的过滤视图 */
export type DrawerFilter =
  | { kind: 'all' }
  | { kind: 'today' }
  | { kind: 'next7' }
  | { kind: 'inbox' }
  | { kind: 'completed' }
  | { kind: 'category'; categoryId: string };

/** 看板分组模式 */
export type BoardMode = 'category' | 'time';

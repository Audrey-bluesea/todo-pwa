import { create } from 'zustand';
import type { TimeEntry } from '../types';
import * as db from '../db/idb';
import { uid } from '../lib/date';
import { useDataStore } from './dataStore';

/** 把计时时间回写到关联任务（计划时间随之变为实际时间）。
 *  autoComplete=true 时（计时结束）同时把任务标记为已完成。todoId 为空则无操作。 */
function syncTodoTime(
  todoId: string | null,
  dueDate: Date | null,
  endDate: Date | null,
  autoComplete = false,
) {
  if (!todoId) return;
  void useDataStore.getState().updateTodo(todoId, {
    dueDate,
    endDate,
    ...(autoComplete ? { isCompleted: true, completedAt: new Date() } : {}),
  });
}

/** 进行中的计时会话（尚未落库为 TimeEntry），用绝对时间戳保证后台/刷新可恢复 */
export interface RunningTimer {
  id: string;
  todoId: string | null;
  title: string;
  categoryId: string | null;
  /** 开始时间（ms 时间戳） */
  start: number;
  /** 开始计时前任务的原时间，用于取消时还原 */
  prevDueDate?: Date | null;
  prevEndDate?: Date | null;
}

const RUNNING_KEY = 'timer:running';

interface TimerState {
  ready: boolean;
  timeEntries: TimeEntry[];
  /** 所有进行中的计时（支持并发多计时） */
  running: RunningTimer[];

  init: () => Promise<void>;
  /** 开始计时（追加新会话，不打断其它进行中的计时）。自由计时传 todoId=null */
  startTimer: (input: { todoId?: string | null; title: string; categoryId?: string | null }) => Promise<void>;
  /** 结束指定计时（按 id）→ 落库为 TimeEntry，返回该记录 */
  stopTimer: (id: string) => Promise<TimeEntry | null>;
  /** 取消指定计时（按 id，不落库） */
  cancelTimer: (id: string) => Promise<void>;
  /** 删除一条历史记录 */
  removeTimeEntry: (id: string) => Promise<void>;
  /** 修改一条已落库记录（标题 / 清单等） */
  updateTimeEntry: (id: string, patch: Partial<TimeEntry>) => Promise<void>;
  /** 修改进行中的计时（标题 / 清单），按 id 定位 */
  updateRunning: (id: string, patch: Partial<RunningTimer>) => Promise<void>;
}

export const useTimerStore = create<TimerState>((set, get) => {
  /** 把进行中的会话落库为 TimeEntry，并从运行态移除 */
  async function finalize(cur: RunningTimer): Promise<TimeEntry> {
    const end = new Date();
    const entry: TimeEntry = {
      id: cur.id,
      todoId: cur.todoId,
      title: cur.title,
      categoryId: cur.categoryId,
      start: new Date(cur.start),
      end,
      createdAt: new Date(),
    };
    // 关联任务：计划时间变为实际计时区间，并自动标记为完成
    if (cur.todoId) syncTodoTime(cur.todoId, entry.start, entry.end, true);
    await db.putTimeEntry(entry);
    const next = get().running.filter((r) => r.id !== cur.id);
    set((s) => ({ running: next, timeEntries: [entry, ...s.timeEntries] }));
    await db.setMeta(RUNNING_KEY, next);
    return entry;
  }

  return {
    ready: false,
    timeEntries: [],
    running: [],

    async init() {
      if (get().ready) return;
      const entries = await db.allTimeEntries();
      const raw = await db.getMeta<RunningTimer | RunningTimer[]>(RUNNING_KEY);
      let list: RunningTimer[] = [];
      if (Array.isArray(raw)) list = raw;
      else if (raw && typeof (raw as RunningTimer).start === 'number') {
        // 兼容旧版单计时：曾以单个对象存储
        list = [raw as RunningTimer];
      }
      list = list.filter((r) => r && typeof r.start === 'number' && !Number.isNaN(r.start));
      set({ timeEntries: entries, running: list, ready: true });
    },

    async startTimer({ todoId = null, title, categoryId = null }) {
      // 多计时器：直接追加新会话，不打断其它进行中的计时
      const rec: RunningTimer = {
        id: uid(),
        todoId,
        title: title.trim() || '自由计时',
        categoryId,
        start: Date.now(),
      };
      // 关联任务：把计划时间挪到实际开始时间，并记录原值以便取消时还原
      if (todoId) {
        const t = useDataStore.getState().todos.find((x) => x.id === todoId);
        if (t) {
          rec.prevDueDate = t.dueDate ?? null;
          rec.prevEndDate = t.endDate ?? null;
          syncTodoTime(todoId, new Date(rec.start), null);
        }
      }
      const next = [...get().running, rec];
      set({ running: next });
      await db.setMeta(RUNNING_KEY, next);
    },

    async stopTimer(id) {
      const cur = get().running.find((r) => r.id === id);
      if (!cur) return null;
      return finalize(cur);
    },

    async cancelTimer(id) {
      const cur = get().running.find((r) => r.id === id);
      if (!cur) return;
      // 关联任务：还原为开始计时前的计划时间
      if (cur.todoId && cur.prevDueDate !== undefined) {
        syncTodoTime(cur.todoId, cur.prevDueDate, cur.prevEndDate ?? null);
      }
      const next = get().running.filter((r) => r.id !== id);
      set({ running: next });
      await db.setMeta(RUNNING_KEY, next);
    },

    async removeTimeEntry(id) {
      await db.deleteTimeEntry(id);
      set((s) => ({ timeEntries: s.timeEntries.filter((e) => e.id !== id) }));
    },

    async updateTimeEntry(id, patch) {
      const cur = get().timeEntries.find((e) => e.id === id);
      if (!cur) return;
      const updated: TimeEntry = { ...cur, ...patch };
      await db.putTimeEntry(updated);
      set((s) => ({ timeEntries: s.timeEntries.map((e) => (e.id === id ? updated : e)) }));
      // 改了时间则同步回关联任务
      if ((patch.start || patch.end) && cur.todoId) {
        syncTodoTime(cur.todoId, updated.start, updated.end);
      }
    },

    async updateRunning(id, patch) {
      const cur = get().running.find((r) => r.id === id);
      if (!cur) return;
      const updated: RunningTimer = { ...cur, ...patch };
      const next = get().running.map((r) => (r.id === id ? updated : r));
      set({ running: next });
      await db.setMeta(RUNNING_KEY, next);
      // 改了开始时间则同步回关联任务（进行中没有结束时间，endDate 置空）
      if (patch.start !== undefined && cur.todoId) {
        syncTodoTime(cur.todoId, new Date(patch.start), null);
      }
    },
  };
});

/** 时长格式化：H:MM:SS（不足 1 小时则 MM:SS） */
export function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 友好时长：如「1 小时 20 分钟」「42 分钟」「30 秒」 */
export function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return `${Math.max(1, Math.round(ms / 1000))} 秒`;
  if (totalMin < 60) return `${totalMin} 分钟`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`;
}

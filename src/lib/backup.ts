import { useDataStore } from '../store/dataStore';
import { useTimerStore } from '../store/timerStore';
import * as db from '../db/idb';
import type { Category, Todo, TimeEntry, QuickTimerPreset } from '../types';

const APP_ID = 'matcha-todo';
const BACKUP_VERSION = 2;

export interface BackupData {
  categories: Category[];
  todos: Todo[];
  timeEntries: TimeEntry[];
  quickPresets: QuickTimerPreset[];
}

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  data: BackupData;
}

/** 收集当前全部数据，生成备份对象（Date 会被 JSON 自动转成 ISO 字符串） */
export function buildBackup(): BackupFile {
  const { categories, todos } = useDataStore.getState();
  const { timeEntries, quickPresets } = useTimerStore.getState();
  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { categories, todos, timeEntries, quickPresets },
  };
}

/** 触发浏览器下载备份文件 */
export function downloadBackup() {
  const backup = buildBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `matcha-backup-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 把 ISO 字符串还原回 Date 对象（与 idb.ts 的 revive 保持一致） */
function reviveData(raw: Partial<BackupData>): BackupData {
  const categories = (raw.categories ?? []).map((c: any) => ({
    ...c,
    createdAt: new Date(c.createdAt),
  }));
  const todos = (raw.todos ?? []).map((t: any) => ({
    ...t,
    dueDate: t.dueDate ? new Date(t.dueDate) : null,
    endDate: t.endDate ? new Date(t.endDate) : null,
    createdAt: new Date(t.createdAt),
  }));
  const timeEntries = (raw.timeEntries ?? []).map((e: any) => ({
    ...e,
    start: new Date(e.start),
    end: e.end ? new Date(e.end) : null,
    createdAt: new Date(e.createdAt),
  }));
  const quickPresets = (raw.quickPresets ?? []).map((p: any) => ({
    ...p,
    createdAt: new Date(p.createdAt),
  }));
  return { categories, todos, timeEntries, quickPresets };
}

/** 解析并校验备份文件，返回可用的数据；格式不对则抛错 */
export async function parseBackupFile(file: File): Promise<BackupData> {
  const text = await file.text();
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON');
  }
  if (!obj || obj.app !== APP_ID || !obj.data) {
    throw new Error('不是本应用的备份文件');
  }
  return reviveData(obj.data);
}

/** 用导入的数据覆盖当前全部数据（清空三张表后写入，并同步内存状态） */
export async function restoreBackup(data: BackupData) {
  const { categories, todos, timeEntries, quickPresets } = data;

  await db.clearCategories();
  await db.clearTodos();
  await db.clearTimeEntries();
  await db.setMeta('timer:quickPresets', quickPresets ?? []);

  await db.putCategories(categories);
  await db.putTodos(todos);
  await db.putTimeEntries(timeEntries);

  useDataStore.setState({ categories, todos });
  useTimerStore.setState({ timeEntries, quickPresets: quickPresets ?? [] });
}

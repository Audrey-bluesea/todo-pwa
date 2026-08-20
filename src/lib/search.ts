import type { Category, Todo, TimeEntry } from '../types';

/** 分类 id → 名称 映射，供搜索时匹配清单名 */
export function buildCatNameMap(categories: Category[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of categories) m.set(c.id, c.name);
  return m;
}

/**
 * 单个任务是否命中查询词。
 * 命中范围：标题 + 描述 + 子任务内容 + 所属清单名（大小写不敏感）。
 */
export function todoMatches(todo: Todo, q: string, catNameMap: Map<string, string>): boolean {
  if (!q) return true;
  const hay = [
    todo.title,
    todo.description,
    ...todo.subTasks.map((s) => s.content),
    catNameMap.get(todo.categoryId) ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

/** 全局搜索：跨全部任务（忽略当前筛选/视图），返回命中列表 */
export function searchTodos(todos: Todo[], rawQuery: string, catNameMap: Map<string, string>): Todo[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return todos;
  return todos.filter((t) => todoMatches(t, q, catNameMap));
}

/**
 * 计时记录搜索：匹配 TimeEntry 的标题与备注（大小写不敏感）。
 * 含自由计时（todoId 为空）也能命中 —— 这部分在 Todo 搜索里找不到，故独立成区。
 */
export function searchTimeEntries(entries: TimeEntry[], rawQuery: string): TimeEntry[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) =>
    [e.title, e.note ?? ''].join(' ').toLowerCase().includes(q),
  );
}

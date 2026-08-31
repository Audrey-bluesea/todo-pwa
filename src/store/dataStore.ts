import { create } from 'zustand';
import type { Category, SubTask, Todo } from '../types';
import * as db from '../db/idb';
import { addDays, startOfDay, uid } from '../lib/date';

/** 分类标识色 —— 20 色板（4 行 × 5 列） */
export const CATEGORY_COLORS = [
  '#D85C66', // 玫红
  '#4C5C99', // 藏青
  '#7CA982', // 苔绿
  '#DDA94B', // 芥黄
  '#B9B4A8', // 灰褐
  '#F4D23C', // 亮黄
  '#7DB7EA', // 天蓝
  '#BEE7C8', // 薄荷
  '#A998D4', // 浅紫
  '#F5F4EF', // 米白
  '#6A5F82', // 暗紫
  '#8BB7C8', // 雾蓝
  '#DE9A63', // 焦橙
  '#A8C1A1', // 鼠尾草绿
  '#D4D6D8', // 浅灰
  '#7EDBD2', // 湖绿
  '#BEEFEA', // 冰蓝
  '#FFD94D', // 暖黄
  '#FFC7DE', // 粉樱
  '#B7D6F7', // 淡蓝
];

export function randomCategoryColor() {
  return CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)];
}

/** 全局标签池在 IndexedDB meta 里的键 */
const TAG_POOL_KEY = 'tagPool';

interface DataState {
  ready: boolean;
  categories: Category[];
  todos: Todo[];
  /**
   * 全局标签池（持久化）。
   * 标签不再从 todos 实时推导——否则「最后一个使用它的任务删掉标签」时，
   * 标签就会从建议/筛选里消失，无法复用（滴答清单的行为是保留，可再次选用）。
   */
  tagPool: string[];

  init: () => Promise<void>;

  /** 把标签注册进全局池（幂等） */
  addTagToPool: (tags: string[]) => Promise<void>;
  /** 从全局池彻底删除标签（仅用于将来显式的「删除标签」入口） */
  removeTagFromPool: (tag: string) => Promise<void>;
  /** 彻底删除标签：从标签池移除，并从所有用到它的任务上移除（避免下次启动被任务标签重新填充） */
  deleteTag: (tag: string) => Promise<void>;

  addCategory: (name: string, icon: string, color?: string) => Promise<Category>;
  updateCategory: (id: string, patch: Partial<Omit<Category, 'id'>>) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;
  reorderCategories: (updates: { id: string; sortOrder: number }[]) => Promise<void>;

  /** Section 管理（清单内分组） */
  addSection: (categoryId: string, name: string) => Promise<{ id: string; name: string; sortOrder: number }>;
  updateSection: (categoryId: string, sectionId: string, patch: { name?: string; sortOrder?: number }) => Promise<void>;
  removeSection: (categoryId: string, sectionId: string) => Promise<void>;
  reorderSections: (categoryId: string, updates: { id: string; sortOrder: number }[]) => Promise<void>;

  addTodo: (input: {
    categoryId: string;
    title: string;
    description?: string;
    dueDate: Date | null;
    endDate?: Date | null;
    subTasks: SubTask[];
    isCompleted?: boolean;
    sectionId?: string | null;
    reminder?: { enabled: boolean; leadMin: number } | null;
    tags?: string[];
  }) => Promise<Todo>;
  updateTodo: (id: string, patch: Partial<Omit<Todo, 'id'>>) => Promise<void>;
  toggleTodo: (id: string) => Promise<void>;
  toggleSubTask: (todoId: string, subId: string) => Promise<void>;
  removeTodo: (id: string) => Promise<void>;
  reorderTodos: (updates: { id: string; sortOrder: number; categoryId?: string }[]) => Promise<void>;
}

export const useDataStore = create<DataState>((set, get) => ({
  ready: false,
  categories: [],
  todos: [],
  tagPool: [],

  /** 把标签合并进全局池（幂等，去重，去空白）；有新增才写盘 */
  async addTagToPool(tags) {
    const incoming = (tags ?? []).map((t) => (t ?? '').trim()).filter(Boolean);
    if (incoming.length === 0) return;
    const cur = get().tagPool;
    const set0 = new Set(cur);
    const added: string[] = [];
    for (const t of incoming) {
      if (!set0.has(t)) {
        set0.add(t);
        added.push(t);
      }
    }
    if (added.length === 0) return;
    const next = [...set0];
    set({ tagPool: next });
    await db.setMeta(TAG_POOL_KEY, next);
  },

  /** 从全局池彻底删除某个标签（不影响任何任务上的标签） */
  async removeTagFromPool(tag) {
    const t = (tag ?? '').trim();
    if (!t) return;
    const next = get().tagPool.filter((x) => x !== t);
    if (next.length === get().tagPool.length) return;
    set({ tagPool: next });
    await db.setMeta(TAG_POOL_KEY, next);
  },

  /** 彻底删除标签：从池子移除，并从所有用到它的任务上剥离（否则下次启动由任务标签重新填充池子） */
  async deleteTag(tag) {
    const t = (tag ?? '').trim();
    if (!t) return;
    const pool = get().tagPool.filter((x) => x !== t);
    set({ tagPool: pool });
    await db.setMeta(TAG_POOL_KEY, pool);
    for (const todo of get().todos) {
      if (todo.tags && todo.tags.includes(t)) {
        await get().updateTodo(todo.id, { tags: todo.tags.filter((x) => x !== t) });
      }
    }
  },

  async init() {
    if (get().ready) return;
    let categories = await db.allCategories();
    let todos = await db.allTodos();

    const seeded = await db.getMeta<boolean>('seeded');
    if (!seeded && categories.length === 0) {
      const seed = buildSeed();
      for (const c of seed.categories) await db.putCategory(c);
      await db.putTodos(seed.todos);
      await db.setMeta('seeded', true);
      categories = seed.categories;
      todos = seed.todos;
    }

    // 标签池：读取持久化的池，并与现有任务的标签取并集（兼容历史数据，自动播种）
    const storedPool = (await db.getMeta<string[]>(TAG_POOL_KEY)) ?? [];
    const fromTodos: string[] = [];
    for (const t of todos) for (const tg of t.tags ?? []) if (tg && tg.trim()) fromTodos.push(tg.trim());
    const merged = [...new Set([...storedPool, ...fromTodos])];
    if (merged.length !== storedPool.length) {
      await db.setMeta(TAG_POOL_KEY, merged);
    }

    set({ categories, todos, ready: true, tagPool: merged });

    // 一次性迁移：旧版默认清单名「收件箱 / 收集箱」统一改为 Inbox
    const legacy = categories.filter((c) => c.name === '收件箱' || c.name === '收集箱');
    for (const c of legacy) {
      await db.putCategory({ ...c, name: 'Inbox' });
    }
    if (legacy.length) {
      set({ categories: categories.map((c) => (legacy.some((l) => l.id === c.id) ? { ...c, name: 'Inbox' } : c)) });
    }

    // 一次性迁移：把「已完成但 completedAt 为 null」的历史任务补上打卡时间。
    // 这类任务包括：① completedAt 功能上线前就完成的；② 在编辑页勾选完成（旧 updateTodo 没写 completedAt）。
    // 没有真实打卡时间可用，用「截止日期」兜底（与用户看到的日期一致、符合"越晚截止越晚完成"的直觉），
    // 没有截止日期则退回 createdAt。回填后 completedAt 非 null，下次 init 不会再触发，天然幂等。
    const needBackfill = todos.filter((t) => t.isCompleted && !t.completedAt);
    if (needBackfill.length > 0) {
      const fixed = todos.map((t) => {
        if (!t.isCompleted || t.completedAt) return t;
        const proxy = t.dueDate
          ? new Date(t.dueDate)
          : t.createdAt
          ? new Date(t.createdAt)
          : new Date(0);
        const patched: Todo = { ...t, completedAt: proxy };
        void db.putTodo(patched);
        return patched;
      });
      set({ todos: fixed });
    }
  },

  async addCategory(name, icon, color) {
    const maxOrder = get().categories.reduce((m, c) => Math.max(m, c.sortOrder ?? -1), -1);
    const c: Category = {
      id: uid(),
      name: name.trim() || '新清单',
      icon: icon || '🍵',
      color: color ?? randomCategoryColor(),
      createdAt: new Date(),
      sortOrder: maxOrder + 1,
    };
    await db.putCategory(c);
    set((s) => ({ categories: [...s.categories, c] }));
    return c;
  },

  async updateCategory(id, patch) {
    const cur = get().categories.find((c) => c.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    await db.putCategory(next);
    set((s) => ({ categories: s.categories.map((c) => (c.id === id ? next : c)) }));
  },

  async removeCategory(id) {
    await db.deleteCategory(id);
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== id),
      todos: s.todos.filter((t) => t.categoryId !== id),
    }));
  },

  async reorderCategories(updates) {
    const map = new Map(updates.map((u) => [u.id, u.sortOrder]));
    const next = get().categories.map((c) => {
      const so = map.get(c.id);
      return so !== undefined ? { ...c, sortOrder: so } : c;
    });
    set({ categories: next });
    await db.putCategories(next.filter((c) => map.has(c.id)));
  },

  // ---- Section 管理 ----

  async addSection(categoryId, name) {
    const cat = get().categories.find((c) => c.id === categoryId);
    if (!cat) throw new Error('Category not found');
    const sections = cat.sections ?? [];
    const maxOrder = sections.reduce((m, s) => Math.max(m, s.sortOrder), -1);
    const section = { id: uid(), name: name.trim() || '新分组', sortOrder: maxOrder + 1 };
    const nextSections = [...sections, section];
    const nextCat = { ...cat, sections: nextSections };
    await db.putCategory(nextCat);
    set((s) => ({ categories: s.categories.map((c) => (c.id === categoryId ? nextCat : c)) }));
    return section;
  },

  async updateSection(categoryId, sectionId, patch) {
    const cat = get().categories.find((c) => c.id === categoryId);
    if (!cat?.sections) return;
    const nextSections = cat.sections.map((s) =>
      s.id === sectionId ? { ...s, ...patch } : s,
    );
    const nextCat = { ...cat, sections: nextSections };
    await db.putCategory(nextCat);
    set((s) => ({ categories: s.categories.map((c) => (c.id === categoryId ? nextCat : c)) }));
  },

  async removeSection(categoryId, sectionId) {
    const cat = get().categories.find((c) => c.id === categoryId);
    if (!cat?.sections) return;
    const nextSections = cat.sections.filter((s) => s.id !== sectionId);
    const nextCat = { ...cat, sections: nextSections };
    await db.putCategory(nextCat);
    // 清除引用该 section 的任务的 sectionId
    const todos = get().todos.map((t) =>
      t.sectionId === sectionId ? { ...t, sectionId: null } : t,
    );
    set((s) => ({
      categories: s.categories.map((c) => (c.id === categoryId ? nextCat : c)),
      todos,
    }));
    await db.putTodos(todos.filter((t) => t.sectionId === sectionId));
  },

  async reorderSections(categoryId, updates) {
    const cat = get().categories.find((c) => c.id === categoryId);
    if (!cat?.sections) return;
    const map = new Map(updates.map((u) => [u.id, u.sortOrder]));
    const nextSections = cat.sections.map((s) => {
      const so = map.get(s.id);
      return so !== undefined ? { ...s, sortOrder: so } : s;
    });
    const nextCat = { ...cat, sections: nextSections };
    set((s) => ({ categories: s.categories.map((c) => (c.id === categoryId ? nextCat : c)) }));
    await db.putCategory(nextCat);
  },

  async addTodo({ categoryId, title, description, dueDate, endDate, subTasks, isCompleted, sectionId, reminder, tags }) {
    const maxOrder = get().todos.reduce((m, t) => Math.max(m, t.sortOrder), 0);
    const t: Todo = {
      id: uid(),
      categoryId,
      sectionId: sectionId ?? null,
      title: title.trim(),
      description: (description ?? '').trim(),
      dueDate,
      endDate: endDate ?? null,
      subTasks,
      isCompleted: isCompleted ?? false,
      completedAt: (isCompleted ?? false) ? new Date() : null,
      sortOrder: maxOrder + 1,
      createdAt: new Date(),
      reminder: reminder ?? null,
      tags: tags ? tags.filter(Boolean) : [],
    };
    await db.putTodo(t);
    set((s) => ({ todos: [...s.todos, t] }));
    // 标签进池：只增不减，任务里删掉标签不影响以后复用
    await get().addTagToPool(t.tags ?? []);
    return t;
  },

  async updateTodo(id, patch) {
    const cur = get().todos.find((t) => t.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch } as Todo;
    // 在编辑页勾选/取消完成时，必须同步 completedAt，否则已完成排序会乱
    if ('isCompleted' in patch) {
      if (patch.isCompleted && !cur.isCompleted) next.completedAt = new Date();
      else if (!patch.isCompleted && cur.isCompleted) next.completedAt = null;
    }
    await db.putTodo(next);
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? next : t)) }));
    // 标签进池：只增不减，任务里删掉标签不影响以后复用
    await get().addTagToPool(next.tags ?? []);
  },

  async toggleTodo(id) {
    const cur = get().todos.find((t) => t.id === id);
    if (!cur) return;
    const isCompleted = !cur.isCompleted;
    const next: Todo = {
      ...cur,
      isCompleted,
      completedAt: isCompleted ? new Date() : null,
      // 整条完成时，子任务一并勾选
      subTasks: isCompleted ? cur.subTasks.map((s) => ({ ...s, isCompleted: true })) : cur.subTasks,
    };
    await db.putTodo(next);
    set((s) => ({ todos: s.todos.map((t) => (t.id === id ? next : t)) }));
  },

  async toggleSubTask(todoId, subId) {
    const cur = get().todos.find((t) => t.id === todoId);
    if (!cur) return;
    const subTasks = cur.subTasks.map((s) =>
      s.id === subId ? { ...s, isCompleted: !s.isCompleted } : s,
    );
    const next: Todo = { ...cur, subTasks };
    await db.putTodo(next);
    set((s) => ({ todos: s.todos.map((t) => (t.id === todoId ? next : t)) }));
  },

  async removeTodo(id) {
    await db.deleteTodo(id);
    set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }));
  },

  async reorderTodos(updates) {
    const map = new Map(updates.map((u) => [u.id, u]));
    const next = get().todos.map((t) => {
      const u = map.get(t.id);
      return u ? { ...t, sortOrder: u.sortOrder, categoryId: u.categoryId ?? t.categoryId } : t;
    });
    set({ todos: next });
    await db.putTodos(next.filter((t) => map.has(t.id)));
  },
}));

/* ---------------- 首次启动示例数据 ---------------- */

function buildSeed(): { categories: Category[]; todos: Todo[] } {
  const now = new Date();
  const mk = (name: string, icon: string, color: string, index: number, sections?: { id: string; name: string; sortOrder: number }[]): Category => ({
    id: uid(),
    name,
    icon,
    color,
    sections,
    createdAt: new Date(now.getTime() + Math.random() * 10),
    sortOrder: index,
  });

  const workSecMeeting = { id: uid(), name: '会议', sortOrder: 0 };
  const workSecDoc = { id: uid(), name: '文档', sortOrder: 1 };
  const workSecFollow = { id: uid(), name: '跟进', sortOrder: 2 };
  const lifeSecShop = { id: uid(), name: '采购', sortOrder: 0 };
  const lifeSecHealth = { id: uid(), name: '健康', sortOrder: 1 };

  const inbox = mk('Inbox', '📥', '#6BAA7A', 0);
  const work = mk('工作', '💼', '#529463', 1, [workSecMeeting, workSecDoc, workSecFollow]);
  const life = mk('生活', '🏠', '#85C09A', 2, [lifeSecShop, lifeSecHealth]);
  const study = mk('学习', '📚', '#A8D5BA', 3);
  const categories = [inbox, work, life, study];

  const today = startOfDay(now);
  const at = (d: Date, h: number, m = 0) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x;
  };

  let order = 0;
  const mkTodo = (
    categoryId: string,
    title: string,
    dueDate: Date | null,
    subs: string[] = [],
    isCompleted = false,
    description = '',
    sectionId?: string,
  ): Todo => ({
    id: uid(),
    categoryId,
    sectionId: sectionId ?? null,
    title,
    description,
    dueDate,
    endDate: null,
    subTasks: subs.map((c) => ({ id: uid(), content: c, isCompleted: false })),
    isCompleted,
    completedAt: isCompleted ? new Date() : null,
    sortOrder: order++,
    createdAt: new Date(),
  });

  const todos: Todo[] = [
    mkTodo(work.id, '整理季度复盘文档', at(today, 10, 30), ['汇总数据', '写结论', '同步给团队'], false, 'Q2 数据已出，需要整理成 PPT', workSecDoc.id),
    mkTodo(work.id, '和设计对齐首页改版', at(today, 14, 0), [], false, '', workSecMeeting.id),
    mkTodo(life.id, '买抹茶粉和牛奶', today, ['宇治抹茶', '低温奶'], false, '去楼下超市看看有没有无糖的', lifeSecShop.id),
    mkTodo(study.id, '读《深度工作》第三章', at(today, 21, 0)),
    mkTodo(inbox.id, '预约周末体检', at(today, 9, 0), [], true),
    mkTodo(work.id, '周会同步进度', at(addDays(today, 1), 11, 0), [], false, '', workSecMeeting.id),
    mkTodo(life.id, '给绿植换盆', addDays(today, 1), [], false, '', lifeSecHealth.id),
    mkTodo(study.id, '背 50 个单词', at(addDays(today, 2), 8, 0)),
    mkTodo(work.id, '提交报销单', at(addDays(today, 3), 17, 30), [], false, '', workSecFollow.id),
    mkTodo(life.id, '预定周末露营装备', addDays(today, 4), ['帐篷', '折叠椅'], false, '', lifeSecShop.id),
    mkTodo(study.id, '完成线上课程作业', at(addDays(today, 6), 20, 0)),
    // 收集箱任务（categoryId 为空）
    { ...mkTodo('', '整理照片备份', null), id: uid(), categoryId: '' },
    { ...mkTodo('', '想想下个月的旅行计划', null, ['选目的地', '查机票']), id: uid(), categoryId: '' },
    mkTodo(work.id, '更新简历', addDays(today, 12), [], false, '', workSecFollow.id),
  ];

  return { categories, todos };
}

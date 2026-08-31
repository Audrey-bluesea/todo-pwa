import { create } from 'zustand';
import type {
  BoardMode,
  CalendarViewMode,
  CalendarWeekMode,
  DrawerFilter,
  TabKey,
  TodoViewMode,
} from '../types';
import { startOfDay } from '../lib/date';

export type ThemeKey = 'matcha' | 'pixel' | 'spring' | 'summer' | 'autumn' | 'winter' | 'blossom';

const THEME_KEY = 'xingshilu.theme';

const VALID_THEMES: ThemeKey[] = ['matcha', 'pixel', 'spring', 'summer', 'autumn', 'winter', 'blossom'];

function loadTheme(): ThemeKey {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v && (VALID_THEMES as string[]).includes(v) ? (v as ThemeKey) : 'matcha';
  } catch {
    return 'matcha';
  }
}

function saveTheme(t: ThemeKey) {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* 忽略存储失败 */
  }
}

/* ---------- 视图记忆 ---------- */
/**
 * 记住「上一次停留的视图」，刷新/重开后自动回到那里。
 * 只记忆视图形态本身；日期、抽屉开合、搜索态、编辑器态一律不记忆
 * （这些属于临时上下文，恢复反而会造成困惑）。
 */
const VIEW_KEY = 'xingshilu.view';

type PersistedView = Pick<
  UIState,
  | 'tab'
  | 'todoView'
  | 'boardMode'
  | 'groupBy'
  | 'calendarView'
  | 'calendarWeekMode'
  | 'completedView'
  | 'filter'
>;

const VALID_TABS: TabKey[] = ['todos', 'calendar'];
const VALID_TODO_VIEW: TodoViewMode[] = ['list', 'board'];
const VALID_BOARD_MODE: BoardMode[] = ['category', 'time'];
const VALID_GROUP_BY = ['time', 'section', 'category'] as const;
const VALID_CAL_VIEW: CalendarViewMode[] = ['list', 'day', 'week', 'month'];
const VALID_CAL_WEEK: CalendarWeekMode[] = ['cards', 'timeline'];
const VALID_FILTER_KINDS = ['all', 'today', 'next7', 'inbox', 'completed', 'category'];

function isValidFilter(v: unknown): v is DrawerFilter {
  if (!v || typeof v !== 'object') return false;
  const f = v as { kind?: unknown; categoryId?: unknown };
  if (typeof f.kind !== 'string' || !VALID_FILTER_KINDS.includes(f.kind)) return false;
  if (f.kind === 'category') return typeof f.categoryId === 'string' && f.categoryId.length > 0;
  return true;
}

function loadView(): Partial<PersistedView> {
  try {
    const raw = localStorage.getItem(VIEW_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return {};
    const out: Partial<PersistedView> = {};
    if (VALID_TABS.includes(v.tab)) out.tab = v.tab;
    if (VALID_TODO_VIEW.includes(v.todoView)) out.todoView = v.todoView;
    if (VALID_TODO_VIEW.includes(v.completedView)) out.completedView = v.completedView;
    if (VALID_BOARD_MODE.includes(v.boardMode)) out.boardMode = v.boardMode;
    if (VALID_GROUP_BY.includes(v.groupBy)) out.groupBy = v.groupBy;
    if (VALID_CAL_VIEW.includes(v.calendarView)) out.calendarView = v.calendarView;
    if (VALID_CAL_WEEK.includes(v.calendarWeekMode)) out.calendarWeekMode = v.calendarWeekMode;
    if (isValidFilter(v.filter)) out.filter = v.filter;
    return out;
  } catch {
    return {};
  }
}

function saveView(v: PersistedView) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    /* 忽略存储失败 */
  }
}

const rememberedView = loadView();

interface UIState {
  tab: TabKey;
  todoView: TodoViewMode;
  boardMode: BoardMode;
  /** 分组方式：按时间 / 按 section / 按清单（列表视图用） */
  groupBy: 'time' | 'section' | 'category';
  calendarView: CalendarViewMode;
  /** 周视图内部子模式：卡片 / 时间轴 */
  calendarWeekMode: CalendarWeekMode;
  drawerOpen: boolean;
  /** 抽屉拖拽偏移（右滑打开/左滑关闭的跟手值，px） */
  drawerOffset: number;
  filter: DrawerFilter;
  /** 全局搜索：是否处于搜索态 */
  searchActive: boolean;
  /** 全局搜索：查询词（标题/描述/子任务/清单名） */
  searchQuery: string;
  /** 标签筛选：选中的标签集合（任一命中即显示，OR 逻辑）；空数组表示不过滤 */
  tagFilter: string[];
  /** 当前查看的日期（驱动日/周/月视图显示哪段时期；导航只改它） */
  viewDate: Date;
  /** 用户显式选中的日期（仅用于高亮 + 新建任务默认日期；不被导航改变） */
  selectedDate: Date;
  editorOpen: boolean;
  editingTodoId: string | null;
  /** 新建时的默认日期（从日历某天点「+」进入） */
  presetDate: Date | null;
  /** 新建时的默认分类（从某分类下点「添加」进入） */
  presetCategoryId: string | null;
  /** 新建时的默认分组（从某分组下点「添加」进入） */
  presetSectionId: string | null;
  toast: string | null;
  /** 全局 toast 的可选动作（如「撤销」），存在时渲染按钮 */
  toastAction: { label: string; onAction: () => void } | null;
  /** 主题：抹茶绿（默认）/ 海边像素 */
  theme: ThemeKey;
  /** 已完成视图模式：列表 / 看板 */
  completedView: TodoViewMode;
  /** 计时面板（开始/记录/历史）是否打开 */
  timerSheetOpen: boolean;
  /** 正在编辑的计时记录 id（日时间轴点击触发），null 表示无 */
  editingTimeEntryId: string | null;
  /** 看板-按分组模式下当前所在分组的 id（用于 FAB 预填；非该模式为 null） */
  boardSectionId: string | null;

  setTab: (t: TabKey) => void;
  setTheme: (t: ThemeKey) => void;
  setTodoView: (v: TodoViewMode) => void;
  setCompletedView: (v: TodoViewMode) => void;
  setBoardMode: (v: BoardMode) => void;
  setGroupBy: (v: 'time' | 'section' | 'category') => void;
  setCalendarView: (v: CalendarViewMode) => void;
  setCalendarWeekMode: (v: CalendarWeekMode) => void;
  setDrawerOpen: (b: boolean) => void;
  setDrawerOffset: (v: number) => void;
  setFilter: (f: DrawerFilter) => void;
  setSearchActive: (b: boolean) => void;
  setSearchQuery: (q: string) => void;
  exitSearch: () => void;
  /** 切换某个标签的选中态（在 tagFilter 中增删） */
  toggleTagFilter: (tag: string) => void;
  /** 清空标签筛选 */
  clearTagFilter: () => void;
  setViewDate: (d: Date) => void;
  setSelectedDate: (d: Date) => void;
  openEditor: (opts?: { todoId?: string; date?: Date | null; categoryId?: string; sectionId?: string | null }) => void;
  closeEditor: () => void;
  showToast: (msg: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number }) => void;
  setTimerSheetOpen: (b: boolean) => void;
  setEditingTimeEntry: (id: string | null) => void;
  /** 设置看板当前所在分组（用于 FAB 预填分类+分组） */
  setBoardSection: (sectionId: string | null) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useUIStore = create<UIState>((set) => ({
  // 视图形态类字段：有记忆则恢复，否则用默认值
  tab: rememberedView.tab ?? 'todos',
  todoView: rememberedView.todoView ?? 'list',
  boardMode: rememberedView.boardMode ?? 'category',
  groupBy: rememberedView.groupBy ?? 'time',
  calendarView: rememberedView.calendarView ?? 'list',
  calendarWeekMode: rememberedView.calendarWeekMode ?? 'cards',
  drawerOpen: false,
  drawerOffset: 0,
  filter: rememberedView.filter ?? { kind: 'all' },
  searchActive: false,
  searchQuery: '',
  tagFilter: [],
  viewDate: startOfDay(new Date()),
  selectedDate: startOfDay(new Date()),
  editorOpen: false,
  editingTodoId: null,
  presetDate: null,
  presetCategoryId: null,
  presetSectionId: null,
  toast: null,
  toastAction: null,
  theme: loadTheme(),
  completedView: rememberedView.completedView ?? 'list',
  timerSheetOpen: false,
  editingTimeEntryId: null,
  boardSectionId: null,

  setTab: (tab) => set({ tab }),
  setTheme: (theme) => {
    saveTheme(theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    set({ theme });
  },
  setTodoView: (todoView) => set({ todoView }),
  setCompletedView: (completedView) => set({ completedView }),
  setBoardMode: (boardMode) => set({ boardMode }),
  setGroupBy: (groupBy) => set({ groupBy }),
  setCalendarView: (calendarView) => set({ calendarView }),
  setCalendarWeekMode: (calendarWeekMode) => set({ calendarWeekMode }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen, drawerOffset: 0 }),
  setDrawerOffset: (drawerOffset) => set({ drawerOffset }),
  setFilter: (filter) => set({ filter, drawerOpen: false, drawerOffset: 0 }),
  setSearchActive: (searchActive) => set({ searchActive }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  exitSearch: () => set({ searchActive: false, searchQuery: '' }),
  toggleTagFilter: (tag) =>
    set((s) => ({
      tagFilter: s.tagFilter.includes(tag)
        ? s.tagFilter.filter((t) => t !== tag)
        : [...s.tagFilter, tag],
    })),
  clearTagFilter: () => set({ tagFilter: [] }),
  setSelectedDate: (selectedDate) => set({ selectedDate: startOfDay(selectedDate) }),
  setViewDate: (viewDate) => set({ viewDate: startOfDay(viewDate) }),
  openEditor: (opts) =>
    set({
      editorOpen: true,
      editingTodoId: opts?.todoId ?? null,
      presetDate: opts?.date ?? null,
      presetCategoryId: opts?.categoryId ?? null,
      presetSectionId: opts?.sectionId ?? null,
    }),
  closeEditor: () => set({ editorOpen: false, editingTodoId: null, presetDate: null, presetCategoryId: null, presetSectionId: null }),
  showToast: (msg, opts) => {
    set({ toast: msg, toastAction: opts?.onAction ? { label: opts.actionLabel ?? '撤销', onAction: opts.onAction } : null });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null, toastAction: null }), opts?.duration ?? 1800);
  },
  setTimerSheetOpen: (timerSheetOpen) => set({ timerSheetOpen }),
  setEditingTimeEntry: (editingTimeEntryId) => set({ editingTimeEntryId }),
  setBoardSection: (boardSectionId) => set({ boardSectionId }),
}));

/* ---------- 视图记忆：视图形态变化时落盘 ---------- */
function pickView(s: UIState): PersistedView {
  return {
    tab: s.tab,
    todoView: s.todoView,
    boardMode: s.boardMode,
    groupBy: s.groupBy,
    calendarView: s.calendarView,
    calendarWeekMode: s.calendarWeekMode,
    completedView: s.completedView,
    filter: s.filter,
  };
}

let lastViewJSON = JSON.stringify(pickView(useUIStore.getState()));
useUIStore.subscribe((s) => {
  const json = JSON.stringify(pickView(s));
  if (json === lastViewJSON) return; // 只有视图形态真的变了才写盘
  lastViewJSON = json;
  saveView(pickView(s));
});

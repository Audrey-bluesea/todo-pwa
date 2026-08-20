import { create } from 'zustand';
import type {
  BoardMode,
  CalendarViewMode,
  DrawerFilter,
  TabKey,
  TodoViewMode,
} from '../types';
import { startOfDay } from '../lib/date';

export type ThemeKey = 'matcha' | 'pixel' | 'spring' | 'summer' | 'autumn' | 'winter' | 'blossom' | 'sky-blue';

const THEME_KEY = 'xingshilu.theme';

const VALID_THEMES: ThemeKey[] = ['matcha', 'pixel', 'spring', 'summer', 'autumn', 'winter', 'blossom', 'sky-blue'];

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

interface UIState {
  tab: TabKey;
  todoView: TodoViewMode;
  boardMode: BoardMode;
  /** 分组方式：按时间 / 按 section / 按清单（列表视图用） */
  groupBy: 'time' | 'section' | 'category';
  calendarView: CalendarViewMode;
  drawerOpen: boolean;
  /** 抽屉拖拽偏移（右滑打开/左滑关闭的跟手值，px） */
  drawerOffset: number;
  filter: DrawerFilter;
  /** 全局搜索：是否处于搜索态 */
  searchActive: boolean;
  /** 全局搜索：查询词（标题/描述/子任务/清单名） */
  searchQuery: string;
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

  setTab: (t: TabKey) => void;
  setTheme: (t: ThemeKey) => void;
  setTodoView: (v: TodoViewMode) => void;
  setCompletedView: (v: TodoViewMode) => void;
  setBoardMode: (v: BoardMode) => void;
  setGroupBy: (v: 'time' | 'section' | 'category') => void;
  setCalendarView: (v: CalendarViewMode) => void;
  setDrawerOpen: (b: boolean) => void;
  setDrawerOffset: (v: number) => void;
  setFilter: (f: DrawerFilter) => void;
  setSearchActive: (b: boolean) => void;
  setSearchQuery: (q: string) => void;
  exitSearch: () => void;
  setViewDate: (d: Date) => void;
  setSelectedDate: (d: Date) => void;
  openEditor: (opts?: { todoId?: string; date?: Date | null; categoryId?: string; sectionId?: string | null }) => void;
  closeEditor: () => void;
  showToast: (msg: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number }) => void;
  setTimerSheetOpen: (b: boolean) => void;
  setEditingTimeEntry: (id: string | null) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useUIStore = create<UIState>((set) => ({
  tab: 'todos',
  todoView: 'list',
  boardMode: 'category',
  groupBy: 'time',
  calendarView: 'list',
  drawerOpen: false,
  drawerOffset: 0,
  filter: { kind: 'all' },
  searchActive: false,
  searchQuery: '',
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
  completedView: 'list',
  timerSheetOpen: false,
  editingTimeEntryId: null,

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
  setDrawerOpen: (drawerOpen) => set({ drawerOpen, drawerOffset: 0 }),
  setDrawerOffset: (drawerOffset) => set({ drawerOffset }),
  setFilter: (filter) => set({ filter, drawerOpen: false, drawerOffset: 0 }),
  setSearchActive: (searchActive) => set({ searchActive }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  exitSearch: () => set({ searchActive: false, searchQuery: '' }),
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
}));

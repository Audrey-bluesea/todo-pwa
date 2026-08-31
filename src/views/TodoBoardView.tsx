import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import type { Todo, DrawerFilter, BoardMode, Category } from '../types';
import { addDays, dayDiff, fmtTime, humanDate, isAllDay, isSameDay, startOfDay } from '../lib/date';
import { effCompletedAt } from '../lib/sort';
import { scrollMemory } from '../lib/scrollMemory';
import EmptyState from '../components/EmptyState';
import SectionTabBar from '../components/SectionTabBar';

/* ---------- 类型定义 ---------- */

interface SwipeTab {
  id: string;
  label: string;
  items: Todo[];
  /** 时间模式：预设日期（点添加按钮用） */
  presetDate?: Date | null;
  /** 按清单模式：标识色 + emoji */
  accentColor?: string;
  accentIcon?: string;
  /** 是否逾期列 */
  isOverdueCol?: boolean;
}

type TimeColKey = 'overdue' | 'today' | 'tomorrow' | 'upcoming' | 'unscheduled';

/* ---------- 时间分桶工具函数 ---------- */

function buildTimeTabs(filter: DrawerFilter): { key: TimeColKey; label: string; offset: number | null }[] {
  switch (filter.kind) {
    case 'today':
      return [
        { key: 'overdue', label: '逾期', offset: 0 },
        { key: 'today', label: '今天', offset: 0 },
      ];
    case 'inbox':
      return [
        { key: 'overdue', label: '逾期', offset: 0 },
        { key: 'today', label: '今天', offset: 0 },
        { key: 'tomorrow', label: '明天', offset: 1 },
        { key: 'upcoming', label: '未来几天', offset: 2 },
        { key: 'unscheduled', label: '无日期', offset: null },
      ];
    case 'next7':
      return [
        { key: 'overdue', label: '逾期', offset: 0 },
        { key: 'today', label: '今天', offset: 0 },
        { key: 'tomorrow', label: '明天', offset: 1 },
        { key: 'upcoming', label: '未来几天', offset: 2 },
      ];
    case 'category':
    case 'all':
    default:
      return [
        { key: 'overdue', label: '逾期', offset: 0 },
        { key: 'today', label: '今天', offset: 0 },
        { key: 'tomorrow', label: '明天', offset: 1 },
        { key: 'upcoming', label: '未来几天', offset: 2 },
        { key: 'unscheduled', label: '无日期', offset: null },
      ];
  }
}

/** 按dueDate归桶（跨天任务只出现一次，持续信息由TodoCard传达） */
function bucketOf(t: Todo, today: Date): TimeColKey {
  if (!t.dueDate) return 'unscheduled';
  const d = dayDiff(t.dueDate, today);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  return 'upcoming';
}

/* ---------- 排序 ---------- */

function sortTime(a: Todo, b: Todo): number {
  if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
  const da = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
  const db = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
  if (da !== db) return da - db;
  return a.sortOrder - b.sortOrder;
}

function sortDefault(a: Todo, b: Todo): number {
  return Number(a.isCompleted) - Number(b.isCompleted) || a.sortOrder - b.sortOrder;
}

/** 已完成视图排序：按「有效完成时间」倒序（最近勾选的在最上面），与活动任务正序相反 */
function sortCompletedDesc(a: Todo, b: Todo): number {
  return effCompletedAt(b) - effCompletedAt(a) || a.sortOrder - b.sortOrder;
}

function sortSections<T extends { sortOrder: number }>(arr: T[]): T[] {
  return arr.slice().sort((a, b) => a.sortOrder - b.sortOrder);
}

/* ---------- 主组件 ---------- */

export default function TodoBoardView({
  todos,
  mode,
  filter,
}: {
  todos: Todo[];
  mode: BoardMode;
  filter: DrawerFilter;
}) {
  const categories = useDataStore((s) => s.categories);
  const addSection = useDataStore((s) => s.addSection);
  const updateSection = useDataStore((s) => s.updateSection);
  const removeSection = useDataStore((s) => s.removeSection);
  const reorderSections = useDataStore((s) => s.reorderSections);
  const updateTodo = useDataStore((s) => s.updateTodo);
  const toggleTodo = useDataStore((s) => s.toggleTodo);
  const openEditor = useUIStore((s) => s.openEditor);
  const showToast = useUIStore((s) => s.showToast);
  const setBoardSection = useUIStore((s) => s.setBoardSection);
  const groupBy = useUIStore((s) => s.groupBy);
  const setGroupBy = useUIStore((s) => s.setGroupBy);
  const catMap = useMemo(() => new Map<string, Category>(categories.map((c) => [c.id, c])), [categories]);
  const today = startOfDay(new Date());

  // 当前单清单（用于分组切换）
  const cat = filter.kind === 'category' ? categories.find((c) => c.id === filter.categoryId) ?? null : null;
  const hasSections = !!(cat?.sections && cat.sections.length > 0);

  // 记忆 key：切筛选/视图重挂载时恢复滚动与当前 tab
  const memKey = `${filter.kind}:${filter.kind === 'category' ? filter.categoryId : ''}:${mode}:${groupBy}`;

  const [activeTabIdx, setActiveTabIdxRaw] = useState(() => {
    const saved = scrollMemory.get(memKey);
    return saved ? saved.tab : 0;
  });
  const [addingSec, setAddingSec] = useState(false);
  const [newSecName, setNewSecName] = useState('');

  // 打卡退场动画：exiting=已打卡、停留展示；collapsing=开始收拢消失
  const [exiting, setExiting] = useState<Set<string>>(new Set());
  const [collapsing, setCollapsing] = useState<Set<string>>(new Set());
  const handleCheck = useCallback((id: string) => {
    toggleTodo(id); // 实际打卡（翻转完成态）
    setExiting((prev) => new Set(prev).add(id));
    window.setTimeout(() => setCollapsing((prev) => new Set(prev).add(id)), 420);
    window.setTimeout(() => {
      setExiting((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setCollapsing((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }, 420 + 340);
    const t = todos.find((x) => x.id === id);
    showToast(`已完成「${t?.title || '任务'}」`, { actionLabel: '撤销', onAction: () => toggleTodo(id), duration: 4000 });
  }, [todos, toggleTodo, showToast]);

  // 普通视图排除已完成任务（打卡后即归置到「已完成」清单），但退场动画期间保留可见
  const isCompletedView = filter.kind === 'completed';
  const visibleTodos = useMemo(() => {
    if (isCompletedView) return todos;
    return todos.filter((t) => !t.isCompleted || exiting.has(t.id) || collapsing.has(t.id));
  }, [todos, isCompletedView, exiting, collapsing]);

  // 看板-按分组模式：构建分组标签栏数据（重命名/拖拽用真实 section 列表 + 未分组计数）
  const sectionBar = useMemo(() => {
    if (filter.kind !== 'category' || groupBy !== 'section' || !cat) return null;
    const catTodos = visibleTodos.filter((t) => t.categoryId === cat.id);
    const secs = sortSections(cat.sections ?? []).map((sec) => ({
      id: sec.id,
      label: sec.name,
      count: catTodos.filter((t) => t.sectionId === sec.id).length,
      editable: true as const,
    }));
    const unsectionedCount = catTodos.filter((t) => !t.sectionId).length;
    return {
      secs,
      unsectioned: unsectionedCount > 0 ? { label: '未分组', count: unsectionedCount } : null,
    };
  }, [filter, groupBy, cat, visibleTodos]);

  // 跟手横滑状态
  const viewportRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  // 横滑手势用原生非 passive 监听，靠 ref 读取最新 activeTabIdx / tabs 长度，避免重渲染时重挂监听打断手势
  const swipeRef = useRef({ x: 0, y: 0, t: 0, lock: null as null | 'h' | 'v', w: 0 });
  const activeIdxRef = useRef(activeTabIdx);
  activeIdxRef.current = activeTabIdx;
  const tabsLenRef = useRef(0);
  const memKeyRef = useRef(memKey);
  memKeyRef.current = memKey;

  // 构建所有 tab
  const tabs = useMemo<SwipeTab[]>(() => {
    // ① 单清单 + 分组模式：按 section 分列（有 sections 时按各 section 列，无 sections 时显示「未分组」单列）
    if (filter.kind === 'category' && groupBy === 'section' && cat) {
      const catTodos = visibleTodos.filter((t) => t.categoryId === cat.id);
      if (hasSections) {
        const secTabs: SwipeTab[] = sortSections(cat.sections ?? []).map((sec) => ({
          id: `sec-${sec.id}`,
          label: sec.name,
          items: catTodos.filter((t) => t.sectionId === sec.id).sort(sortDefault),
          accentColor: cat.color ?? '#A8D5BA',
          accentIcon: cat.icon,
        }));
        const unsectioned = catTodos.filter((t) => !t.sectionId).sort(sortDefault);
        if (unsectioned.length > 0) {
          secTabs.push({
            id: 'sec-none',
            label: '未分组',
            items: unsectioned,
            accentColor: cat.color ?? '#A8D5BA',
            accentIcon: cat.icon,
          });
        }
        return secTabs;
      }
      // 无 sections：全部归入「未分组」单列
      return [{
        id: 'sec-none',
        label: '未分组',
        items: catTodos.sort(sortDefault),
        accentColor: cat.color ?? '#A8D5BA',
        accentIcon: cat.icon,
      }];
    }

    if (mode === 'category' && filter.kind !== 'category') {
      // 按清单模式：每个清单一个 tab（仅智能清单层级；单清单下不展示全部分类）
      const useSort = filter.kind === 'completed' ? sortCompletedDesc : sortDefault;
      const catTabs: SwipeTab[] = categories.map((c) => ({
        id: c.id,
        label: c.name,
        items: visibleTodos.filter((t) => t.categoryId === c.id).sort(useSort),
        accentColor: c.color ?? '#A8D5BA',
        accentIcon: c.icon,
      }));

      // 收集箱兜底
      const uncategorized = visibleTodos.filter((t) => !t.categoryId || t.categoryId === '').sort(useSort);
      if (uncategorized.length > 0) {
        catTabs.push({
          id: '__inbox__',
          label: 'Inbox',
          items: uncategorized,
          accentColor: '#6BAA7A',
          accentIcon: '📥',
        });
      }
      return catTabs.filter((t) => t.items.length > 0);
    }

    // 时间模式：按时间分桶的 tab（跨天任务按dueDate只归一个桶）
    const timeDefs = buildTimeTabs(filter);
    return timeDefs
      .map((td) => ({
        id: td.key,
        label: td.label,
        items: visibleTodos.filter((t) => bucketOf(t, today) === td.key).sort(sortTime),
        isOverdueCol: td.key === 'overdue',
        presetDate: td.offset === null ? null : addDays(today, td.offset),
      }))
      .filter((tab) => tab.items.length > 0);
  }, [mode, categories, todos, visibleTodos, filter, today, groupBy, cat, hasSections]);
  tabsLenRef.current = tabs.length;

  // 切到新 tab 并记忆；越界时钳制
  const commitTab = (next: number) => {
    const clamped = Math.max(0, Math.min(next, tabs.length - 1));
    setActiveTabIdxRaw(clamped);
    const el = colRefs.current[clamped];
    const scroll = el ? el.scrollTop : 0;
    scrollMemory.save(memKey, scroll, clamped);
  };

  // tabs 数量变化后钳制 activeTabIdx，避免越界白屏
  useEffect(() => {
    if (tabs.length > 0 && activeTabIdx > tabs.length - 1) {
      setActiveTabIdxRaw(tabs.length - 1);
    }
  }, [tabs.length, activeTabIdx]);

  // tabs 的 id 集合变化（增删/重排分组、删除分组）后，保持「当前分组」稳定（按 id 重定位 activeTabIdx）
  const tabSig = tabs.map((t) => t.id).join('|');
  const activeIdRef = useRef<string | null>(tabs[activeTabIdx]?.id ?? null);
  useEffect(() => {
    activeIdRef.current = tabs[activeTabIdx]?.id ?? null;
  }, [activeTabIdx, tabSig]);
  useEffect(() => {
    const id = activeIdRef.current;
    if (!id) return;
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) setActiveTabIdxRaw(Math.max(0, Math.min(activeTabIdx, tabs.length - 1)));
    else if (idx !== activeTabIdx) setActiveTabIdxRaw(idx);
  }, [tabSig, activeTabIdx, tabs]);

  // 看板-按分组模式下，把当前所在分组 id 发布到全局（供 FAB 预填分类+分组）
  useEffect(() => {
    const inSectionMode = filter.kind === 'category' && groupBy === 'section';
    if (!inSectionMode) {
      setBoardSection(null);
      return;
    }
    const id = tabs[activeTabIdx]?.id;
    setBoardSection(id && id.startsWith('sec-') && id !== 'sec-none' ? id.slice(4) : null);
  }, [activeTabIdx, tabs, filter, groupBy, setBoardSection]);

  // 看板卸载（切到列表/日历）时清空当前分组，避免 FAB 误用旧分组预填
  useEffect(() => () => setBoardSection(null), [setBoardSection]);

  // 重挂载时恢复各列滚动位置（记忆中的当前 tab 已在 useState 初值里）
  useEffect(() => {
    const saved = scrollMemory.get(memKey);
    if (saved) {
      const el = colRefs.current[saved.tab];
      if (el) el.scrollTop = saved.scroll;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memKey]);

  // 空状态
  if (tabs.length === 0) {
    return (
      <EmptyState
        title="这里空空如也"
        desc={mode === 'category' && categories.length === 0 ? '在左上角菜单里新建一个清单吧' : '换个筛选条件，或添加一些任务吧'}
        emoji="📅"
      />
    );
  }

  // 内联创建分组
  const handleAddSec = async () => {
    if (!newSecName.trim() || !cat) return;
    await addSection(cat.id, newSecName.trim());
    setNewSecName('');
    setAddingSec(false);
    setGroupBy('section');
  };

  // 分组标签栏交互（仅看板-按分组模式）
  const handleSectionSelect = (fullId: string) => {
    const idx = tabs.findIndex((t) => t.id === fullId);
    if (idx >= 0) commitTab(idx);
  };
  const handleSectionReorder = (orderedIds: string[]) => {
    if (!cat) return;
    reorderSections(
      cat.id,
      orderedIds.map((id, i) => ({ id, sortOrder: i })),
    );
  };

  // —— 长按卡片拖到分组标题 → 切换分组 ——
  const [taskDrag, setTaskDrag] = useState<{ todo: Todo; x: number; y: number } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const taskDragRef = useRef(false);
  const dropTargetRef = useRef<string | null>(null);
  const taskTodoRef = useRef<Todo | null>(null);
  const taskDragging = !!taskDrag;

  const handleTaskLongPress = useCallback((todo: Todo, x: number, y: number) => {
    taskTodoRef.current = todo;
    setTaskDrag({ todo, x, y });
    setDropTargetId(null);
    dropTargetRef.current = null;
    taskDragRef.current = true;
  }, []);

  useEffect(() => {
    if (!taskDragging) return;
    const onMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      setTaskDrag((d) => (d ? { ...d, x, y } : d));
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const pill = el?.closest('[data-section-id]') as HTMLElement | null;
      const id = pill ? pill.getAttribute('data-section-id') : null;
      dropTargetRef.current = id;
      setDropTargetId(id);
    };
    const onUp = () => {
      const target = dropTargetRef.current;
      const todo = taskTodoRef.current;
      if (todo && target) {
        const sid = target === 'none' ? null : target;
        if (todo.sectionId !== sid) updateTodo(todo.id, { sectionId: sid });
      }
      setTaskDrag(null);
      setDropTargetId(null);
      dropTargetRef.current = null;
      taskDragRef.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskDragging, updateTodo]);

  // ---- 跟手横滑（iOS 可靠版：原生非 passive 监听，横滑时 preventDefault 阻止 Safari 干扰）----
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onStart = (e: TouchEvent) => {
      if (taskDragRef.current) return; // 正在拖拽任务换分组，不触发横滑
      const t = e.touches[0];
      if (!t) return;
      swipeRef.current = {
        x: t.clientX,
        y: t.clientY,
        t: Date.now(),
        lock: null,
        w: vp.clientWidth || window.innerWidth,
      };
    };
    const onMove = (e: TouchEvent) => {
      if (taskDragRef.current) return;
      const s = swipeRef.current;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (s.lock === null) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) s.lock = 'h';
        else if (Math.abs(dy) > 8) s.lock = 'v';
      }
      if (s.lock === 'h') {
        // 关键：阻止 Safari 的横向回退/滚动默认行为，确保横滑被 JS 接管
        e.preventDefault();
        let nx = dx;
        const idx = activeIdxRef.current;
        const len = tabsLenRef.current;
        if ((idx === 0 && dx > 0) || (idx === len - 1 && dx < 0)) nx = dx * 0.35; // 边缘橡皮筋
        setDragX(nx);
        setDragging(true);
      }
    };
    const onEnd = (e: TouchEvent) => {
      const s = swipeRef.current;
      if (s.lock !== 'h') {
        setDragging(false);
        setDragX(0);
        return;
      }
      const ch = e.changedTouches[0];
      const dx = ch ? ch.clientX - s.x : 0;
      const dt = Date.now() - s.t || 1;
      const threshold = s.w * 0.22;
      const velocity = dx / dt;
      const idx = activeIdxRef.current;
      const len = tabsLenRef.current;
      let next = idx;
      if ((dx < -threshold || velocity < -0.4) && idx < len - 1) next = idx + 1;
      else if ((dx > threshold || velocity > 0.4) && idx > 0) next = idx - 1;
      const clamped = Math.max(0, Math.min(next, len - 1));
      setActiveTabIdxRaw(clamped);
      const el = colRefs.current[clamped];
      const scroll = el ? el.scrollTop : 0;
      scrollMemory.save(memKeyRef.current, scroll, clamped);
      setDragging(false);
      setDragX(0);
    };
    vp.addEventListener('touchstart', onStart, { passive: true });
    vp.addEventListener('touchmove', onMove, { passive: false });
    vp.addEventListener('touchend', onEnd, { passive: true });
    vp.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      vp.removeEventListener('touchstart', onStart);
      vp.removeEventListener('touchmove', onMove);
      vp.removeEventListener('touchend', onEnd);
      vp.removeEventListener('touchcancel', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* ====== 创建分组入口（仅看板-按分组模式） ====== */}
      {filter.kind === 'category' && groupBy === 'section' && !addingSec && (
        <div className="shrink-0 px-3 pt-2">
          <button onClick={() => setAddingSec(true)} className="text-[12.5px] font-medium text-primary-600 press">
            ＋ 创建分组
          </button>
        </div>
      )}

      {/* 内联新建分组输入 */}
      {filter.kind === 'category' && addingSec && (
        <div className="shrink-0 px-3 pb-1 pt-1">
          <div className="flex items-center gap-2 rounded-xl bg-primary-50 p-2 anim-pop">
            <input
              value={newSecName}
              onChange={(e) => setNewSecName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddSec()}
              placeholder="分组名称"
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-primary-200 bg-white px-2.5 py-1.5 text-[14px] outline-none placeholder:text-neutral-400 focus:border-primary-400"
            />
            <button
              onClick={handleAddSec}
              className="shrink-0 rounded-lg bg-primary-500 px-3 py-1.5 text-[13px] font-medium text-white press active:bg-primary-600"
            >
              加
            </button>
            <button
              onClick={() => {
                setAddingSec(false);
                setNewSecName('');
              }}
              className="shrink-0 text-[13px] text-neutral-400 press"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* ====== 分组标签栏（看板-按分组模式可重命名/拖拽排序） ====== */}
      {sectionBar ? (
        <div className="shrink-0 border-b border-primary-100 px-3 pb-2 pt-2">
          <SectionTabBar
            sections={sectionBar.secs}
            unsectioned={sectionBar.unsectioned}
            activeId={tabs[activeTabIdx]?.id ?? null}
            dropTargetId={dropTargetId}
            onSelect={handleSectionSelect}
            onRename={(id, name) => cat && updateSection(cat.id, id, { name })}
            onDelete={(id) => cat && removeSection(cat.id, id)}
            onReorder={handleSectionReorder}
          />
        </div>
      ) : (
        tabs.length > 1 && (
          <div className="shrink-0 border-b border-primary-100 px-3 pb-2 pt-2">
            <div className="flex gap-2 overflow-x-auto no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
              {tabs.map((tab, i) => (
                <button
                  key={tab.id}
                  onClick={() => commitTab(i)}
                  className={`shrink-0 rounded-full border-2 px-4 py-1.5 text-[13px] font-medium transition-all press ${
                    i === activeTabIdx
                      ? 'border-primary-400 bg-primary-200 text-primary-700'
                      : 'border-transparent bg-neutral-100 text-neutral-500'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1 text-[11px] tabular-nums ${i === activeTabIdx ? 'text-primary-600' : 'text-neutral-400'}`}>
                    {tab.items.length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {/* ====== 任务列表区（跟手横滑 pager） ====== */}
      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: 'pan-y' }}
      >
        <div
          className="flex h-full min-h-0"
          style={{
            transform: `translateX(calc(${-activeTabIdx * 100}% + ${dragX}px))`,
            transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
        >
          {tabs.map((tab, i) => (
            <div
              key={tab.id}
              ref={(el) => (colRefs.current[i] = el)}
              className={`h-full w-full shrink-0 px-4 pb-8 pt-2 ${taskDragging ? 'overflow-hidden' : 'overflow-y-auto'}`}
              style={{ touchAction: 'pan-y', WebkitUserSelect: taskDragging ? 'none' : undefined }}
              onScroll={(e) => scrollMemory.save(memKey, e.currentTarget.scrollTop, activeTabIdx)}
            >
              {tab.items.map((t) => {
                const isCollapse = collapsing.has(t.id);
                return (
                  <div
                    key={t.id}
                    className={`overflow-hidden transition-all duration-300 ease-out ${
                      isCollapse ? 'max-h-0 opacity-0' : 'max-h-40 opacity-100'
                    }`}
                  >
                    <BoardCard
                      t={t}
                      cat={t.categoryId ? catMap.get(t.categoryId) : undefined}
                      isInbox={!t.categoryId || t.categoryId === ''}
                      isOverdueCol={!!tab.isOverdueCol}
                      isDragging={taskDrag?.todo.id === t.id}
                      onOpen={() => openEditor({ todoId: t.id })}
                      onCheck={handleCheck}
                      hideCategory={filter.kind === 'category'}
                      onLongPress={sectionBar ? handleTaskLongPress : undefined}
                    />
                  </div>
                );
              })}

            </div>
          ))}
        </div>
      </div>

      {/* 长按拖拽任务的浮层克隆（pointer-events:none，不挡住下方分组标题的命中检测） */}
      {taskDrag && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[60]"
          style={{
            transform: `translate(${taskDrag.x}px, ${taskDrag.y}px) translate(-50%, -50%) scale(1.05) rotate(-1deg)`,
          }}
        >
          <div className="max-w-[260px] rounded-2xl bg-white px-4 py-3 shadow-[0_16px_40px_rgba(80,120,90,0.42)] ring-[3px] ring-primary-400/80">
            <div className="text-[15px] font-medium leading-snug text-neutral-700">{taskDrag.todo.title || 'No Title'}</div>
            {taskDrag.todo.description && (
              <div className="mt-1 line-clamp-1 text-[12px] text-neutral-400">{taskDrag.todo.description}</div>
            )}
            <div className="mt-1.5 text-[10px] font-medium text-primary-500">拖到分组标题以移动</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 全宽任务卡片 ---------- */

function BoardCard({
  t,
  cat,
  isInbox,
  isOverdueCol,
  isDragging,
  onOpen,
  onCheck,
  hideCategory,
  onLongPress,
}: {
  t: Todo;
  cat?: Category;
  isInbox: boolean;
  isOverdueCol: boolean;
  isDragging?: boolean;
  onOpen: () => void;
  onCheck: (id: string) => void;
  hideCategory?: boolean;
  /** 长按卡片：进入「拖到分组标题」模式（仅看板-按分组模式传入） */
  onLongPress?: (todo: Todo, clientX: number, clientY: number) => void;
}) {
  const hasTime = t.dueDate && !isAllDay(t.dueDate);
  const isCrossDay = !!(t.dueDate && t.endDate && !isSameDay(t.dueDate, t.endDate));

  // 长按 → 拖拽换分组：检测长按（移动/滚动则取消），松手若曾长按则吞掉随后的 click
  const cardRef = useRef<HTMLDivElement>(null);
  const lp = useRef<{ timer: number | null; startX: number; startY: number; moved: boolean; fired: boolean } | null>(null);
  const suppressClick = useRef(false);
  const setSelectLock = (lock: boolean) => {
    const el = cardRef.current;
    if (!el) return;
    const s = el.style as CSSStyleDeclaration & { webkitTouchCallout?: string; WebkitTouchCallout?: string };
    if (lock) {
      s.userSelect = 'none';
      s.webkitUserSelect = 'none';
      s.webkitTouchCallout = 'none';
    } else {
      s.userSelect = '';
      s.webkitUserSelect = '';
      s.webkitTouchCallout = '';
    }
  };
  const clearLp = () => {
    if (lp.current?.timer) {
      window.clearTimeout(lp.current.timer);
      lp.current = null;
    }
    setSelectLock(false);
  };
  const onCardPointerDown = (e: React.PointerEvent) => {
    if (!onLongPress) return;
    setSelectLock(true);
    lp.current = { timer: null, startX: e.clientX, startY: e.clientY, moved: false, fired: false };
    const timer = window.setTimeout(() => {
      if (lp.current && !lp.current.moved && !lp.current.fired) {
        lp.current.fired = true;
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        // 震动反馈（若支持）
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(15);
        onLongPress(t, e.clientX, e.clientY);
      }
    }, 380);
    lp.current.timer = timer;
  };
  const onCardPointerMove = (e: React.PointerEvent) => {
    if (!lp.current) return;
    const dx = e.clientX - lp.current.startX;
    const dy = e.clientY - lp.current.startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      lp.current.moved = true;
      if (!lp.current.fired) clearLp();
    }
  };
  const onCardPointerUp = () => {
    if (lp.current?.fired) suppressClick.current = true;
    clearLp();
  };

  // 时间标签统一成与 TodoCard 一致：未完成主色浅底，已完成中性浅灰底
  const timeChipCls = t.isCompleted
    ? 'bg-neutral-100 text-neutral-400'
    : 'bg-primary-100 text-primary-700';

  return (
    <div
      ref={cardRef}
      onClick={(e) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onOpen();
      }}
      onPointerDown={onCardPointerDown}
      onPointerMove={onCardPointerMove}
      onPointerUp={onCardPointerUp}
      onPointerCancel={onCardPointerUp}
      className={`mb-2 flex items-start gap-3 rounded-xl bg-white p-3 shadow-card-soft press ${
        isOverdueCol && !t.isCompleted ? 'border-l-[3px] border-l-red-300' : ''
      } ${isDragging ? 'opacity-50' : ''}`}
      style={{
        WebkitTouchCallout: 'none',
        userSelect: isDragging ? 'none' : undefined,
        WebkitUserSelect: isDragging ? 'none' : undefined,
      }}
    >
      {/* Checkbox（用 span 镜像 TodoCard，绕开全局 button{border:none} 覆盖；self-start 使其对齐标题首行） */}
      <span
        role="button"
        tabIndex={0}
        aria-label={t.isCompleted ? '标记为未完成' : '标记为已完成'}
        onClick={(e) => {
          e.stopPropagation();
          onCheck(t.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onCheck(t.id);
          }
        }}
        className={`mt-[1px] flex h-[17px] w-[17px] shrink-0 cursor-pointer items-center justify-center self-start rounded-[2px] border-[1.5px] transition-colors ${
          t.isCompleted ? 'border-primary-500 bg-primary-500' : 'border-primary-300 bg-white'
        }`}
      >
        {t.isCompleted && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </span>

      {/* 内容区 */}
      <div className="min-w-0 flex-1">
        <div
          className={`text-[14.5px] leading-snug ${t.isCompleted ? 'text-neutral-400 line-through' : 'text-neutral-700'}`}
        >
          {t.title || 'No Title'}
        </div>
        {t.description ? (
          <div
            className={`mt-1 line-clamp-2 text-[12.5px] leading-snug ${t.isCompleted ? 'text-neutral-300 line-through' : 'text-neutral-400'}`}
          >
            {t.description}
          </div>
        ) : null}
        {t.tags && t.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {t.tags.map((tag) => (
              <span
                key={tag}
                className={`rounded-full px-2 py-[1px] text-[11px] font-medium ${
                  t.isCompleted ? 'bg-neutral-100 text-neutral-400' : 'bg-primary-50 text-primary-600'
                }`}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-1 flex items-center justify-between gap-2">
          {/* 时间标签：与 TodoCard 逻辑保持一致 */}
          {t.dueDate && t.endDate ? (
            isSameDay(t.dueDate, t.endDate) && !hasTime && isAllDay(t.endDate) ? (
              // 同天全天：只显示日期
              <span className={`inline-flex items-center rounded-full px-2 py-[2px] text-[11.5px] font-medium ${timeChipCls}`}>
                {humanDate(t.dueDate)}
              </span>
            ) : (
              // 跨天或带时间：显示起止范围
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11.5px] font-medium ${timeChipCls}`}>
                <span>{humanDate(t.dueDate)}{hasTime ? ` ${fmtTime(t.dueDate)}` : ''}</span>
                <span className="text-primary-300">→</span>
                <span>
                  {isCrossDay
                    ? humanDate(t.endDate) + (!isAllDay(t.endDate) ? ` ${fmtTime(t.endDate)}` : '')
                    : (!isAllDay(t.endDate) ? fmtTime(t.endDate) : '')}
                </span>
              </span>
            )
          ) : (
            t.dueDate && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11.5px] font-medium ${timeChipCls}`}>
                {humanDate(t.dueDate)}
                {hasTime ? ` ${fmtTime(t.dueDate)}` : ''}
              </span>
            )
          )}

          {/* 清单标签 */}
          {!hideCategory && (isInbox ? (
            <span className="shrink-0 rounded-full bg-primary-50 px-2 py-[2px] text-[11.5px] font-medium text-primary-600">Inbox</span>
          ) : cat ? (
            <span className="shrink-0 flex items-center gap-1 rounded-full bg-neutral-50 px-2 py-[2px] text-[11.5px] text-neutral-400">
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
            </span>
          ) : null)}
        </div>
      </div>
    </div>
  );
}

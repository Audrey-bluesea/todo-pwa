import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import type { Todo, DrawerFilter, BoardMode, Category } from '../types';
import { addDays, dayDiff, fmtTime, humanDate, isAllDay, isSameDay, startOfDay } from '../lib/date';
import { scrollMemory } from '../lib/scrollMemory';
import { IconClock } from '../components/Icons';
import EmptyState from '../components/EmptyState';

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

/** 已完成视图排序：按到期时间倒序（最晚到期在最上面），与活动任务正序相反 */
function sortCompletedDesc(a: Todo, b: Todo): number {
  const av = a.dueDate ? +a.dueDate : 0;
  const bv = b.dueDate ? +b.dueDate : 0;
  return bv - av || a.sortOrder - b.sortOrder;
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
  const toggleTodo = useDataStore((s) => s.toggleTodo);
  const openEditor = useUIStore((s) => s.openEditor);
  const showToast = useUIStore((s) => s.showToast);
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

  // 跟手横滑状态
  const viewportRef = useRef<HTMLDivElement>(null);
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touch = useRef({ x: 0, y: 0, t: 0, lock: null as null | 'h' | 'v', w: 0 });

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

  // ---- 跟手横滑 ----
  const onTouchStart = (e: React.TouchEvent) => {
    const w = viewportRef.current?.clientWidth ?? window.innerWidth;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), lock: null, w };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const t = touch.current;
    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;
    const dx = cx - t.x;
    const dy = cy - t.y;
    if (t.lock === null) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) t.lock = 'h';
      else if (Math.abs(dy) > 8) t.lock = 'v';
    }
    if (t.lock === 'h') {
      // 边缘橡皮筋
      let nx = dx;
      if ((activeTabIdx === 0 && dx > 0) || (activeTabIdx === tabs.length - 1 && dx < 0)) nx = dx * 0.35;
      setDragX(nx);
      setDragging(true);
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    if (t.lock === 'h') {
      const dx = e.changedTouches[0].clientX - t.x;
      const dt = Date.now() - t.t || 1;
      const w = t.w;
      const threshold = w * 0.22;
      const velocity = dx / dt;
      let next = activeTabIdx;
      if ((dx < -threshold || velocity < -0.4) && activeTabIdx < tabs.length - 1) next = activeTabIdx + 1;
      else if ((dx > threshold || velocity > 0.4) && activeTabIdx > 0) next = activeTabIdx - 1;
      setDragging(false);
      setDragX(0);
      commitTab(next);
    } else {
      setDragging(false);
      setDragX(0);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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

      {/* ====== 横滑 Tab 栏 ====== */}
      {tabs.length > 1 && (
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
      )}

      {/* ====== 任务列表区（跟手横滑 pager） ====== */}
      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex min-h-0 flex-1"
          style={{
            transform: `translateX(calc(${-activeTabIdx * 100}% + ${dragX}px))`,
            transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}
        >
          {tabs.map((tab, i) => (
            <div
              key={tab.id}
              ref={(el) => (colRefs.current[i] = el)}
              className="h-full w-full shrink-0 overflow-y-auto px-4 pb-[100px] pt-2"
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
                      onOpen={() => openEditor({ todoId: t.id })}
                      onCheck={handleCheck}
                      hideCategory={filter.kind === 'category'}
                    />
                  </div>
                );
              })}

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- 全宽任务卡片 ---------- */

function BoardCard({
  t,
  cat,
  isInbox,
  isOverdueCol,
  onOpen,
  onCheck,
  hideCategory,
}: {
  t: Todo;
  cat?: Category;
  isInbox: boolean;
  isOverdueCol: boolean;
  onOpen: () => void;
  onCheck: (id: string) => void;
  hideCategory?: boolean;
}) {
  const hasTime = t.dueDate && !isAllDay(t.dueDate);

  // 日期 badge 样式：有 endDate 的任务统一显示起止范围，与 TodoCard 保持一致
  const isCrossDay = !!t.endDate && !isSameDay(t.dueDate as Date, t.endDate as Date);
  const hasEndDate = !!t.endDate;
  const dateBadgeStyle = useMemo(() => {
    if (!t.dueDate) return { bg: 'bg-neutral-100', text: 'text-neutral-500', label: '--' };
    // 有 End 的任务：统一显示起止范围；但同天+全天只显示单日期
    if (hasEndDate && t.endDate) {
      const ed = t.endDate as Date;
      const startLabel = `${(t.dueDate as Date).getMonth() + 1}/${(t.dueDate as Date).getDate()}${hasTime ? ` ${fmtTime(t.dueDate)}` : ''}`;
      // 同天 + 全天：不画箭头，只显示单日期
      if (!isCrossDay && !hasTime && isAllDay(ed)) {
        return { bg: 'bg-primary-50', text: 'text-primary-600', label: startLabel };
      }
      const endLabel = isCrossDay
        ? `${ed.getMonth() + 1}/${ed.getDate()}${!isAllDay(ed) ? ` ${fmtTime(ed)}` : ''}`
        : (!isAllDay(ed) ? `${fmtTime(ed)}` : '');
      return { bg: 'bg-primary-50', text: 'text-primary-600', label: `${startLabel} → ${endLabel}` };
    }
    const d = dayDiff(t.dueDate, startOfDay(new Date()));
    if (d < 0) return { bg: 'bg-red-50', text: 'text-red-500', label: humanDate(t.dueDate) };
    if (d === 0)
      return { bg: 'bg-primary-50', text: 'text-primary-700', label: hasTime ? `Today ${fmtTime(t.dueDate)}` : 'Today' };
    return {
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      label: `${humanDate(t.dueDate)}${hasTime ? ` ${fmtTime(t.dueDate)}` : ''}`,
    };
  }, [t.dueDate, t.endDate, hasTime, isCrossDay]);

  return (
    <div
      onClick={onOpen}
      className={`mb-2 flex items-center gap-3 rounded-xl bg-white p-3 shadow-card-soft press ${
        isOverdueCol && !t.isCompleted ? 'border-l-[3px] border-l-red-300' : ''
      }`}
    >
      {/* Checkbox（用 span 镜像 TodoCard，绕开全局 button{border:none} 覆盖） */}
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
        className={`flex h-[17px] w-[17px] shrink-0 cursor-pointer items-center justify-center rounded-[2px] border-[1.5px] transition-colors ${
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
        <div className="mt-1 flex items-center justify-between gap-2">
          {/* 日期 badge（无日期/无时间时不显示） */}
          {t.dueDate && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[11.5px] font-medium ${dateBadgeStyle.bg} ${dateBadgeStyle.text}`}
          >
            {hasTime && <IconClock size={10} />}
            {dateBadgeStyle.label}
          </span>
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

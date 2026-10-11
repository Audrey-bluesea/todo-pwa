import { useMemo, useState, useCallback, useRef, useEffect, Fragment, type ReactNode } from 'react';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import type { Todo } from '../types';
import type { GroupKey } from '../components/ViewSegment';
import { dayDiff, startOfDay } from '../lib/date';
import { effCompletedAt, splitForSort } from '../lib/sort';
import TodoCard from '../components/TodoCard';
import EmptyState from '../components/EmptyState';
import { IconChevronDown, IconChevronRight } from '../components/Icons';

interface Group {
  key: string;
  label: string;
  items: Todo[];
  tone?: 'overdue';
  /** 「按分组 + 按日期」模式下：有日期锁顶的任务（按时间升序） */
  dated?: Todo[];
  /** 「按分组」模式下可拖动重排的任务（手动模式=全部；按日期模式=无日期部分） */
  undated?: Todo[];
}

/**
 * 列表视图：永远按时间正序排列任务（时间分桶），不展示 section 分组。
 * 跨天任务按 dueDate 归桶（只出现一次），持续信息由 TodoCard 的竖色带+起止标签传达。
 */
export default function TodoListView({ todos, query, listGroupKey }: { todos: Todo[]; query?: string; listGroupKey?: GroupKey }) {
  const categories = useDataStore((s) => s.categories);
  const toggleTodo = useDataStore((s) => s.toggleTodo);
  const reorderTodos = useDataStore((s) => s.reorderTodos);
  const filter = useUIStore((s) => s.filter);
  const showToast = useUIStore((s) => s.showToast);
  const sortMode = useUIStore((s) => s.sortMode);
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const isCategoryView = filter.kind === 'category';
  const isSingleCategory = filter.kind === 'category';

  // 当前列表分组模式
  const activeGroup: GroupKey = listGroupKey ?? 'time';

  // 分组折叠状态
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ none: true });
  const toggleGroup = useCallback((key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] })), []);

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

  // —— 长按卡片 → 组内重排（仅「按分组」模式的无日期任务）——
  const [taskDrag, setTaskDrag] = useState<{ todo: Todo; x: number; y: number } | null>(null);
  /** 组内重排插入线：{ 分组 key, 在 undated 列表中的插入索引 }；null=不显示 */
  const [reorderLine, setReorderLine] = useState<{ groupKey: string; index: number } | null>(null);
  const taskTodoRef = useRef<Todo | null>(null);
  /** 被拖动卡片所属分组 key，约束「只能同组内重排」 */
  const dragGroupRef = useRef<string | null>(null);
  const dropKindRef = useRef<'reorder' | null>(null);
  const reorderLineRef = useRef<{ groupKey: string; index: number } | null>(null);
  const groupsRef = useRef<Group[]>([]);
  const taskDragging = !!taskDrag;

  const handleTaskLongPress = useCallback((todo: Todo, x: number, y: number) => {
    const grp = groupsRef.current.find((g) => g.undated && g.undated.some((it) => it.id === todo.id));
    taskTodoRef.current = todo;
    dragGroupRef.current = grp?.key ?? null;
    setTaskDrag({ todo, x, y });
    setReorderLine(null);
    reorderLineRef.current = null;
    dropKindRef.current = null;
  }, []);

  useEffect(() => {
    if (!taskDragging) return;
    const onMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      setTaskDrag((d) => (d ? { ...d, x, y } : d));
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const card = el?.closest('[data-todo-id]') as HTMLElement | null;
      const todo = taskTodoRef.current;
      const groupKey = card?.getAttribute('data-group-key');
      const tid = card?.getAttribute('data-todo-id');
      if (todo && card && groupKey && tid && groupKey === dragGroupRef.current && tid !== todo.id) {
        const rect = card.getBoundingClientRect();
        const before = y < rect.top + rect.height / 2;
        const U = groupsRef.current.find((g) => g.key === groupKey)?.undated ?? [];
        const targetIdx = U.findIndex((t) => t.id === tid);
        if (targetIdx >= 0) {
          const index = before ? targetIdx : targetIdx + 1;
          const line = { groupKey, index };
          dropKindRef.current = 'reorder';
          reorderLineRef.current = line;
          setReorderLine(line);
          return;
        }
      }
      dropKindRef.current = null;
      reorderLineRef.current = null;
      setReorderLine(null);
    };
    const onUp = () => {
      const todo = taskTodoRef.current;
      const line = reorderLineRef.current;
      if (todo && line && line.groupKey === dragGroupRef.current) {
        const U = groupsRef.current.find((g) => g.key === line.groupKey)?.undated ?? [];
        const curIdx = U.findIndex((t) => t.id === todo.id);
        if (curIdx >= 0) {
          let at = line.index;
          if (at > curIdx) at -= 1; // 扣除自身被移除的位移
          const arr = U.slice();
          const [moved] = arr.splice(curIdx, 1);
          arr.splice(at, 0, moved);
          void reorderTodos(arr.map((t, i) => ({ id: t.id, sortOrder: i })));
        }
      }
      setTaskDrag(null);
      setReorderLine(null);
      reorderLineRef.current = null;
      dropKindRef.current = null;
      dragGroupRef.current = null;
      taskTodoRef.current = null;
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
  }, [taskDragging, reorderTodos]);

  const { groups, completed } = useMemo(() => {
    const today = startOfDay(new Date());
    const isExiting = (id: string) => exiting.has(id) || collapsing.has(id);
    const active = todos.filter((t) => !t.isCompleted || isExiting(t.id));
    const done = todos.filter((t) => t.isCompleted);

    // 时间正序排序
    const byDueAsc = (a: Todo, b: Todo) => {
      const av = a.dueDate ? +a.dueDate : Number.MAX_SAFE_INTEGER;
      const bv = b.dueDate ? +b.dueDate : Number.MAX_SAFE_INTEGER;
      return av - bv || a.sortOrder - b.sortOrder;
    };
    // 已完成排序：按「有效完成时间」倒序（见模块级 effCompletedAt，保证刚勾掉的总在最上）
    const byCompletedDesc = (a: Todo, b: Todo) => effCompletedAt(b) - effCompletedAt(a) || a.sortOrder - b.sortOrder;

    // ── 按时间分桶（默认）──
    if (activeGroup === 'time') {
      const buckets: Record<string, Todo[]> = {
        overdue: [], today: [], tomorrow: [], next7: [], later: [], none: [],
      };
      for (const t of active) {
        if (!t.dueDate) { buckets.none.push(t); continue; }
        const d = dayDiff(t.dueDate, today);
        if (d < 0) buckets.overdue.push(t);
        else if (d === 0) buckets.today.push(t);
        else if (d === 1) buckets.tomorrow.push(t);
        else if (d <= 7) buckets.next7.push(t);
        else buckets.later.push(t);
      }
      Object.values(buckets).forEach((b) => b.sort(byDueAsc));
      const gs: Group[] = ([
        { key: 'overdue', label: '已逾期', items: buckets.overdue, tone: 'overdue' },
        { key: 'today', label: '今天', items: buckets.today },
        { key: 'tomorrow', label: '明天', items: buckets.tomorrow },
        { key: 'next7', label: '未来 7 天', items: buckets.next7 },
        { key: 'later', label: '更晚', items: buckets.later },
        { key: 'none', label: '未安排日期', items: buckets.none },
      ] as Group[]).filter((g) => g.items.length > 0);
      return { groups: gs, completed: done.sort(byCompletedDesc) };
    }

    // ── 按清单分桶 ──
    if (activeGroup === 'category') {
      const catBuckets = new Map<string, { label: string; items: Todo[]; color?: string }>();
      // 按清单归类
      for (const t of active) {
        const cid = t.categoryId || '';
        if (!catBuckets.has(cid)) {
          const cat = categories.find((c) => c.id === cid);
          catBuckets.set(cid, { label: cat?.name ?? 'Inbox', items: [], color: cat?.color });
        }
        catBuckets.get(cid)!.items.push(t);
      }
      const gs: Group[] = [];
      // 先排有分类的（按 categories 原序），再 Inbox
      for (const c of categories) {
        const bucket = catBuckets.get(c.id);
        if (bucket && bucket.items.length > 0) {
          bucket.items.sort(byDueAsc);
          gs.push({ key: `cat-${c.id}`, label: bucket.label, items: bucket.items });
        }
      }
      const inboxBucket = catBuckets.get('');
      if (inboxBucket && inboxBucket.items.length > 0) {
        inboxBucket.items.sort(byDueAsc);
        gs.push({ key: 'cat-inbox', label: 'Inbox', items: inboxBucket.items });
      }
      return { groups: gs, completed: done.sort(byCompletedDesc) };
    }

    // ── 按分组（section）分桶 —— 仅单清单模式有效 ──
    if (activeGroup === 'section' && isSingleCategory) {
      const cat = categories.find((c) => c.id === filter.categoryId);
      const secMap = new Map<string, { label: string; items: Todo[] }>();
      const unsectioned: Todo[] = [];
      for (const t of active) {
        if (t.sectionId) {
          const sec = cat?.sections?.find((s) => s.id === t.sectionId);
          if (!secMap.has(t.sectionId)) secMap.set(t.sectionId, { label: sec?.name ?? t.sectionId, items: [] });
          secMap.get(t.sectionId)!.items.push(t);
        } else {
          unsectioned.push(t);
        }
      }
      const gs: Group[] = [];
      // 按 sections 原序排列
      const buildGroup = (key: string, label: string, src: Todo[]): void => {
        const { dated, undated } = splitForSort(src, sortMode);
        if (dated.length === 0 && undated.length === 0) return;
        gs.push({ key, label, items: [...dated, ...undated], dated, undated });
      };
      for (const sec of cat?.sections ?? []) {
        const bucket = secMap.get(sec.id);
        if (bucket && bucket.items.length > 0) buildGroup(`sec-${sec.id}`, bucket.label, bucket.items);
      }
      if (unsectioned.length > 0) buildGroup('sec-none', '未分组', unsectioned);
      return { groups: gs, completed: done.sort(byCompletedDesc) };
    }

    // fallback：按时间
    return { groups: [], completed: done.sort(byCompletedDesc) };
  }, [todos, filter, activeGroup, categories, exiting, collapsing]);
  groupsRef.current = groups;

  // 搜索模式：扁平结果列表，忽略时间分桶与「已完成」专属视图
  if (query !== undefined) {
    if (todos.length === 0) {
      return (
        <EmptyState title="没有找到相关任务" desc="换个关键词试试，比如任务标题或清单名 🍵" />
      );
    }
    return (
      <div className="px-4 pb-40 pt-1">
        <div className="space-y-2.5">
          {todos.map((t) => (
            <TodoCard
              key={t.id}
              todo={t}
              category={catMap.get(t.categoryId)}
              showDate
              query={query}
            />
          ))}
        </div>
      </div>
    );
  }

  // 已完成专属视图：按清单分类，到期时间倒序（最晚到期在最上面，与活动任务正序相反）
  if (filter.kind === 'completed') {
    if (completed.length === 0) {
      return <EmptyState title="还没有已完成的任务" desc="勾掉一件小事，它就会出现在这里 🍵" />;
    }
    // 已完成板块单独排序：按「有效完成时间」倒序（最近勾选的排最上面）
    const byCompletedDesc = (a: Todo, b: Todo) => effCompletedAt(b) - effCompletedAt(a) || a.sortOrder - b.sortOrder;
    // 按清单分桶
    const catBuckets = new Map<string, { label: string; items: Todo[]; icon?: string }>();
    for (const t of [...completed].sort(byCompletedDesc)) {
      const cid = t.categoryId || '';
      if (!catBuckets.has(cid)) {
        const cat = categories.find((c) => c.id === cid);
        catBuckets.set(cid, { label: cat?.name ?? 'Inbox', items: [], icon: cat?.icon });
      }
      catBuckets.get(cid)!.items.push(t);
    }
    const completedGroups: { key: string; label: string; items: Todo[] }[] = [];
    for (const c of categories) {
      const bucket = catBuckets.get(c.id);
      if (bucket && bucket.items.length > 0) {
        completedGroups.push({ key: `cat-${c.id}`, label: `${bucket.icon ? bucket.icon + ' ' : ''}${bucket.label}`, items: bucket.items });
      }
    }
    const inboxBucket = catBuckets.get('');
    if (inboxBucket && inboxBucket.items.length > 0) {
      completedGroups.push({ key: 'cat-inbox', label: '📥 Inbox', items: inboxBucket.items });
    }
    // 区块按「组内最新打卡时间」倒序：最近被勾掉任务的清单排最前，最近打卡的任务自然落在最顶上
    completedGroups.sort((a, b) => {
      const maxAt = (g: { items: Todo[] }) => g.items.reduce((m, t) => Math.max(m, effCompletedAt(t)), 0);
      return maxAt(b) - maxAt(a);
    });

    return (
      <div className="px-4 pb-40 pt-1">
        {completedGroups.length === 0 ? (
          <EmptyState title="还没有已完成的任务" desc="勾掉一件小事，它就会出现在这里 🍵" />
        ) : (
          completedGroups.map((g) => (
            <section key={g.key} className="mb-5">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[13px] font-semibold text-neutral-500">{g.label}</span>
                <span className="text-[11px] text-neutral-400">{g.items.length}</span>
              </div>
              <div className="space-y-2">
                {g.items.map((t) => (
                  <TodoCard key={t.id} todo={t} category={catMap.get(t.categoryId)} showDate />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    );
  }

  if (groups.length === 0) {
    return <EmptyState title="这里空空如也" desc="点右下角的按钮，添加第一件小事 🍵" />;
  }

  return (
    <div className="px-4 pb-40 pt-1">
      {groups.map((g) => {
        const isCollapsed = !!collapsed[g.key];
        return (
          <section key={g.key} className="mb-5">
            {/* 标签行：可点击折叠/展开 */}
            <button
              onClick={() => toggleGroup(g.key)}
              className="mb-2 flex w-full items-center gap-2 press"
            >
              {isCollapsed ? (
                <IconChevronRight size={14} className="text-neutral-400" />
              ) : (
                <IconChevronDown size={14} className="text-neutral-400 transition-transform" />
              )}
              <span
                className={`bucket-label rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${
                  g.tone === 'overdue' ? 'bg-primary-200 text-primary-800' : 'bg-primary-100 text-primary-700'
                }`}
              >
                {g.label}
              </span>
              <span className="text-[12px] text-neutral-400">{g.items.length}</span>
            </button>
            {/* 任务列表（折叠时隐藏） */}
            {!isCollapsed && (() => {
              const dated = g.dated;
              const undated = g.undated;
              // 普通分组（时间 / 清单）或尚未启用排序拆分：原样渲染
              if (dated === undefined || undated === undefined) {
                return (
                  <div className="pl-6">
                    {g.items.map((t) => (
                      <div
                        key={t.id}
                        className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                          collapsing.has(t.id) ? 'grid-rows-[0fr] opacity-0 mb-0' : 'grid-rows-[1fr] opacity-100 mb-2.5'
                        }`}
                      >
                        <div className="overflow-hidden">
                          <TodoCard
                            todo={t}
                            category={catMap.get(t.categoryId)}
                            showDate={g.key !== 'today' && g.key !== 'none'}
                            hideCategory={isCategoryView}
                            onCheck={handleCheck}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }
              // 拆分分组：有日期锁顶、无日期沉底可拖
              const lineIdx = reorderLine && reorderLine.groupKey === g.key ? reorderLine.index : -1;
              const cardWrap = (t: Todo, content: ReactNode) => (
                <div
                  key={t.id}
                  data-todo-id={undated.includes(t) ? t.id : undefined}
                  data-group-key={undated.includes(t) ? g.key : undefined}
                  className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out ${
                    collapsing.has(t.id) ? 'grid-rows-[0fr] opacity-0 mb-0' : 'grid-rows-[1fr] opacity-100 mb-2.5'
                  }`}
                >
                  <div className="overflow-hidden">{content}</div>
                </div>
              );
              return (
                <div className="pl-6">
                  {dated.map((t) =>
                    cardWrap(
                      t,
                      <TodoCard
                        todo={t}
                        category={catMap.get(t.categoryId)}
                        showDate
                        hideCategory={isCategoryView}
                        onCheck={handleCheck}
                      />,
                    ),
                  )}
                  {dated.length > 0 && undated.length > 0 && (
                    <div className="my-2 flex items-center gap-2 px-1">
                      <div className="h-px flex-1 bg-primary-100" />
                      <span className="text-[11px] text-neutral-400">无日期 · 拖动排序</span>
                      <div className="h-px flex-1 bg-primary-100" />
                    </div>
                  )}
                  {undated.map((t, idx) => (
                    <Fragment key={t.id}>
                      {lineIdx === idx && <div className="mx-1 my-1 h-[3px] rounded-full bg-primary-400" />}
                      {cardWrap(
                        t,
                        <TodoCard
                          todo={t}
                          category={catMap.get(t.categoryId)}
                          showDate
                          hideCategory={isCategoryView}
                          onCheck={handleCheck}
                          onLongPress={handleTaskLongPress}
                        />,
                      )}
                    </Fragment>
                  ))}
                  {lineIdx === undated.length && <div className="mx-1 my-1 h-[3px] rounded-full bg-primary-400" />}
                </div>
              );
            })()}
          </section>
        );
      })}
      {/* 长按拖拽任务的浮层克隆（pointer-events:none，不挡住下方卡片的命中检测） */}
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
            <div className="mt-1.5 text-[10px] font-medium text-primary-500">拖动排序</div>
          </div>
        </div>
      )}
    </div>
  );
}

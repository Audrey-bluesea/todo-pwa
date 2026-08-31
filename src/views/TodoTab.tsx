import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import { dayDiff, startOfDay } from '../lib/date';
import { scrollMemory } from '../lib/scrollMemory';
import TodoListView from './TodoListView';
import TodoBoardView from './TodoBoardView';
import ViewSegment, { type GroupKey } from '../components/ViewSegment';
import SearchBar from '../components/SearchBar';
import TimerButton from '../components/TimerButton';
import TimerSearchCard from '../components/TimerSearchCard';
import { IconMenu, IconSearch } from '../components/Icons';
import { buildCatNameMap, searchTodos, searchTimeEntries } from '../lib/search';
import { useTimerStore } from '../store/timerStore';

export default function TodoTab() {
  const todos = useDataStore((s) => s.todos);
  const categories = useDataStore((s) => s.categories);
  const tagPool = useDataStore((s) => s.tagPool);
  const deleteTag = useDataStore((s) => s.deleteTag);
  const filter = useUIStore((s) => s.filter);
  const searchActive = useUIStore((s) => s.searchActive);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const tagFilter = useUIStore((s) => s.tagFilter);
  const toggleTagFilter = useUIStore((s) => s.toggleTagFilter);
  const clearTagFilter = useUIStore((s) => s.clearTagFilter);
  const [tagOpen, setTagOpen] = useState(false);
  const setSearchActive = useUIStore((s) => s.setSearchActive);
  const exitSearch = useUIStore((s) => s.exitSearch);
  const view = useUIStore((s) => s.todoView);
  const boardMode = useUIStore((s) => s.boardMode);
  const groupBy = useUIStore((s) => s.groupBy);
  const completedView = useUIStore((s) => s.completedView);
  const setView = useUIStore((s) => s.setTodoView);
  const setBoardMode = useUIStore((s) => s.setBoardMode);
  const setGroupBy = useUIStore((s) => s.setGroupBy);
  const setCompletedView = useUIStore((s) => s.setCompletedView);
  const setDrawerOpen = useUIStore((s) => s.setDrawerOpen);
  const drawerOpen = useUIStore((s) => s.drawerOpen);
  const setDrawerOffset = useUIStore((s) => s.setDrawerOffset);
  const drawerOffset = useUIStore((s) => s.drawerOffset);

  const title = useMemo(() => {
    switch (filter.kind) {
      case 'all':
        return '全部待办';
      case 'today':
        return '今天';
      case 'next7':
        return '未来 7 天';
      case 'inbox':
        return 'Inbox';
      case 'completed':
        return '已完成';
      case 'category':
        return categories.find((c) => c.id === filter.categoryId)?.name ?? '清单';
    }
  }, [filter, categories]);

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    switch (filter.kind) {
      case 'all':
        return todos;
      case 'today':
        return todos.filter((t) => t.dueDate && dayDiff(t.dueDate, today) <= 0);
      case 'inbox':
        return todos.filter((t) => !t.categoryId || t.categoryId === '');
      case 'next7':
        return todos.filter((t) => {
          if (!t.dueDate) return false;
          const d = dayDiff(t.dueDate, today);
          return d >= 0 && d <= 7;
        });
      case 'completed':
        return todos.filter((t) => t.isCompleted);
      case 'category':
        return todos.filter((t) => t.categoryId === filter.categoryId);
    }
  }, [todos, filter]);

  // 标签筛选：在 filter 结果之上再按标签收敛（OR 逻辑：任一命中即显示）
  const tagFiltered = useMemo(() => {
    if (tagFilter.length === 0) return filtered;
    return filtered.filter((t) => (t.tags ?? []).some((tg) => tagFilter.includes(tg)));
  }, [filtered, tagFilter]);

  // 全局搜索：激活时跨全部任务匹配（忽略预设筛选），否则沿用 filter + 标签筛选结果
  const catNameMap = useMemo(() => buildCatNameMap(categories), [categories]);
  const searched = useMemo(() => {
    if (!searchActive) return tagFiltered;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return todos;
    return searchTodos(todos, q, catNameMap);
  }, [searchActive, searchQuery, tagFiltered, todos, catNameMap]);

  // 全部标签（用于筛选栏）：取「持久化标签池 ∪ 当前任务身上的标签」。
  // 只取标签池，是因为标签一旦用过就应能一直复用，
  // 即使没有任何任务再用它（从任务里删掉标签不会让它消失）。
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const tg of tagPool) if (tg && tg.trim()) set.add(tg.trim());
    for (const t of todos) for (const tg of t.tags ?? []) if (tg && tg.trim()) set.add(tg.trim());
    return Array.from(set);
  }, [tagPool, todos]);

  // 计时记录搜索：激活时跨全部 TimeEntry 匹配标题/备注（含自由计时）
  const timeEntries = useTimerStore((s) => s.timeEntries);
  const matchedEntries = useMemo(
    () => (searchActive ? searchTimeEntries(timeEntries, searchQuery) : []),
    [searchActive, searchQuery, timeEntries],
  );

  // 图标分段控制器：列表 ⇄ 看板（全局统一两项）
  const isCompletedView = filter.kind === 'completed';
  const isSingleCategory = filter.kind === 'category';
  const isInbox = filter.kind === 'inbox';
  // 已完成视图用独立的 completedView，其他视图用 todoView
  const effectiveView = isCompletedView ? completedView : view;
  const isBoardView = effectiveView === 'board';

  // 分组下拉选项：已完成视图只按清单；智能清单→按时间/按分组；其他→按时间/按清单
  const groupOptions = useMemo(
    () =>
      isCompletedView
        ? [{ key: 'category' as GroupKey, label: '按清单' }]
        : isSingleCategory
          ? [
              { key: 'time' as GroupKey, label: '按时间' },
              { key: 'section' as GroupKey, label: '按分组' },
            ]
          : [
              { key: 'time' as GroupKey, label: '按时间' },
              { key: 'category' as GroupKey, label: '按清单' },
            ],
    [isCompletedView, isSingleCategory],
  );

  // 当前分组 key（列表模式直接用 groupBy；看板模式用 boardMode 映射）
  const currentGroup: GroupKey = isBoardView
    ? (boardMode === 'category' ? 'category' : groupBy === 'section' ? 'section' : 'time')
    : groupBy;

  const handleSelectList = () =>
    isCompletedView ? setCompletedView('list') : setView('list');
  const handleSelectBoard = () => {
    if (isCompletedView) {
      setCompletedView('board');
    } else {
      setView('board');
      // 收集箱/智能清单进看板时强制按时间分桶
      if (!isSingleCategory) {
        setBoardMode('time');
        setGroupBy('time');
      }
    }
  };

  // 分组选择：根据当前视图模式分别处理
  const handleSelectGroup = (key: GroupKey) => {
    if (isBoardView) {
      // 看板模式：通过 boardMode + groupBy 组合控制
      setView('board');
      if (key === 'time') { setBoardMode('time'); setGroupBy('time'); }
      else if (key === 'category') { setBoardMode('category'); setGroupBy('time'); }
      else if (key === 'section') { setBoardMode('time'); setGroupBy('section'); }
    } else {
      // 列表模式：只用 groupBy 控制
      setGroupBy(key);
    }
  };

  // 跨重挂载的滚动位置记忆（列表/已完成视图的滚动在包裹层）
  const scrollRef = useRef<HTMLDivElement>(null);
  const mountKey = `${effectiveView}-${isCompletedView ? 'c' : '-'}-${filter.kind}-${
    filter.kind === 'category' ? filter.categoryId : ''
  }-${groupBy}-${boardMode}-${completedView}`;
  const scrollMemKey = `list:${mountKey}`;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = scrollMemory.get(scrollMemKey)?.scroll ?? 0;
  }, [scrollMemKey]);
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    scrollMemory.save(scrollMemKey, e.currentTarget.scrollTop, 0);
  };

  // ---- 边缘右滑打开抽屉手势 ----
  const edgeDragRef = useRef<{ startX: number; startedAtEdge: boolean } | null>(null);
  const EDGE_ZONE = 28; // 触发边缘手势的最大 x 距离

  const handleEdgeTouchStart = useCallback((e: React.TouchEvent) => {
    if (drawerOpen) return; // 已打开不拦截
    const x = e.touches[0].clientX;
    if (x > EDGE_ZONE) return;
    edgeDragRef.current = { startX: x, startedAtEdge: true };
  }, [drawerOpen]);

  const handleEdgeTouchMove = useCallback((e: React.TouchEvent) => {
    if (!edgeDragRef.current?.startedAtEdge || drawerOpen) return;
    const dx = e.touches[0].clientX - edgeDragRef.current.startX;
    if (dx > 0) {
      // 右滑：跟手拖出抽屉（加一点阻尼）
      setDrawerOffset(Math.min(dx * 0.7, 300));
    }
  }, [drawerOpen, setDrawerOffset]);

  const handleEdgeTouchEnd = useCallback(() => {
    if (!edgeDragRef.current?.startedAtEdge) return;
    edgeDragRef.current = null;
    if (drawerOffset > 80) {
      // 超过阈值 → 打开抽屉
      setDrawerOpen(true);
    }
    setDrawerOffset(0);
  }, [drawerOffset, setDrawerOpen, setDrawerOffset]);

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onTouchStart={handleEdgeTouchStart}
      onTouchMove={handleEdgeTouchMove}
      onTouchEnd={handleEdgeTouchEnd}
    >
      <header className="shrink-0 pt-safe z-30">
        <div className="flex items-center gap-1 px-2 pt-1">
          <button
            onClick={() => setDrawerOpen(true)}
            className="hit text-primary-700 press"
            aria-label="打开菜单"
          >
            <IconMenu size={22} />
          </button>

          <div className="flex-1" />

          {/* 列表 / 看板 图标分段控制器 + 搜索/计时按钮。整体 shrink-0，防止看板视图下
              内部横向 pager 把 flex 容器撑宽后，右侧按钮被挤出屏幕右边。 */}
          {!searchActive && (
            <div className="flex shrink-0 items-center gap-1">
              <ViewSegment
                isBoard={isBoardView}
                onSelectList={handleSelectList}
                onSelectBoard={handleSelectBoard}
                groupOptions={groupOptions}
                currentGroup={currentGroup}
                onSelectGroup={handleSelectGroup}
                hideGroupDropdown={isInbox || isCompletedView}
              />
              <TimerButton />
              <button
                onClick={() => setSearchActive(true)}
                className="hit text-primary-700 press"
                aria-label="搜索"
              >
                <IconSearch size={22} />
              </button>
            </div>
          )}

          {/* 搜索态：取消按钮 */}
          {searchActive && (
            <button
              onClick={exitSearch}
              className="press text-[14px] font-medium text-primary-600"
              style={{ minHeight: 32 }}
            >
              取消
            </button>
          )}
        </div>

        {searchActive ? (
          <div className="px-3 pb-2 pt-1.5">
            <SearchBar />
            <div className="mt-1.5 px-1 text-[12px] text-neutral-400">
              找到 {searched.length + matchedEntries.length} 个结果
            </div>
          </div>
        ) : (
          <h1 className="px-4 pb-2 pt-1.5 text-[26px] font-bold leading-tight text-primary-700">
            {title}
          </h1>
        )}
      </header>

      {/* 标签筛选：默认收起为一个紧凑按钮，避免标签多时堆满顶部；点击展开 chip 行；
          已选筛选时自动展开并显示清除。 */}
      {!searchActive && allTags.length > 0 && (
        <div className="shrink-0 px-3 pb-2 pt-0.5">
          <button
            onClick={() => setTagOpen((o) => !o)}
            className={`press inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium ${
              tagFilter.length > 0 ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-700'
            }`}
          >
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M3 5h18l-7 8v6l-4 2v-8z" />
            </svg>
            标签筛选
            {tagFilter.length > 0 && (
              <span className="ml-0.5 rounded-full bg-white/25 px-1.5 text-[11px] tabular-nums">
                {tagFilter.length}
              </span>
            )}
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: tagOpen || tagFilter.length > 0 ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {(tagOpen || tagFilter.length > 0) && (
            <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
              {allTags.map((tg) => {
                const active = tagFilter.includes(tg);
                return (
                  <span
                    key={tg}
                    className={`inline-flex shrink-0 items-center rounded-full ${
                      active ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-700'
                    }`}
                  >
                    <button
                      onClick={() => toggleTagFilter(tg)}
                      className="press rounded-full px-3 py-1 text-[12px] font-medium"
                    >
                      #{tg}
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`删除标签「${tg}」？\n将从标签池及所有用到它的任务上移除。`)) {
                          deleteTag(tg);
                          if (tagFilter.includes(tg)) clearTagFilter();
                        }
                      }}
                      aria-label={`删除标签 ${tg}`}
                      className="press flex h-5 w-5 items-center justify-center rounded-full text-[14px] leading-none opacity-60 hover:opacity-100"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {tagFilter.length > 0 && (
                <button
                  onClick={clearTagFilter}
                  className="press shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-[12px] text-neutral-500"
                >
                  清除
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div
        key={mountKey}
        ref={scrollRef}
        onScroll={onScroll}
        className="scroll-y min-h-0 flex-1 anim-fade pb-8"
      >
        {searchActive ? (
          <div>
            {matchedEntries.length > 0 && (
              <section className="px-3 pt-2">
                <div className="px-1 pb-1.5 text-[12px] font-medium text-neutral-400">
                  计时记录 · {matchedEntries.length}
                </div>
                <div className="flex flex-col gap-2">
                  {matchedEntries.map((e) => (
                    <TimerSearchCard key={e.id} entry={e} query={searchQuery} />
                  ))}
                </div>
              </section>
            )}
            <TodoListView todos={searched} query={searchQuery} />
          </div>
        ) : effectiveView === 'list' ? (
          <TodoListView todos={searched} listGroupKey={isCompletedView ? 'category' : groupBy} />
        ) : (
          <TodoBoardView todos={searched} mode={isCompletedView ? 'category' : boardMode} filter={filter} />
        )}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import { addDays, addMonths, startOfDay } from '../lib/date';
import CalendarListView from './CalendarListView';
import CalendarDayView from './CalendarDayView';
import CalendarWeekCards from './CalendarWeekCards';
import CalendarWeekTimelineView from './CalendarWeekTimelineView';
import CalendarMonthGrid from './CalendarMonthGrid';
import TodoListView from './TodoListView';
import SearchBar from '../components/SearchBar';
import TimerSearchCard from '../components/TimerSearchCard';
import { IconCalendar, IconChevronLeft, IconChevronRight, IconGrid, IconList, IconSearch, IconSun, IconTimeline, IconWeek } from '../components/Icons';
import ViewDropdown from '../components/ViewDropdown';
import type { CalendarViewMode } from '../types';
import { buildCatNameMap, searchTodos, searchTimeEntries } from '../lib/search';
import { useTimerStore } from '../store/timerStore';

const MONTH_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const CAL_VIEW_OPTIONS = [
  { key: 'list', label: '列表', icon: <IconList size={16} /> },
  { key: 'day', label: '日', icon: <IconSun size={16} /> },
  { key: 'week', label: '周', icon: <IconWeek size={16} /> },
  { key: 'month', label: '月', icon: <IconGrid size={16} /> },
];

export default function CalendarTab() {
  const view = useUIStore((s) => s.calendarView);
  const setView = useUIStore((s) => s.setCalendarView);
  const weekMode = useUIStore((s) => s.calendarWeekMode);
  const setWeekMode = useUIStore((s) => s.setCalendarWeekMode);
  const date = useUIStore((s) => s.viewDate);
  const setDate = useUIStore((s) => s.setViewDate);
  const setSelectedDate = useUIStore((s) => s.setSelectedDate);
  const searchActive = useUIStore((s) => s.searchActive);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchActive = useUIStore((s) => s.setSearchActive);
  const exitSearch = useUIStore((s) => s.exitSearch);

  const todos = useDataStore((s) => s.todos);
  const categories = useDataStore((s) => s.categories);

  // 全局搜索：跨全部任务匹配，忽略当前日历视图与日期范围
  const catNameMap = useMemo(() => buildCatNameMap(categories), [categories]);
  const searched = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return todos;
    return searchTodos(todos, q, catNameMap);
  }, [searchQuery, todos, catNameMap]);

  // 计时记录搜索：激活时跨全部 TimeEntry 匹配标题/备注（含自由计时）
  const timeEntries = useTimerStore((s) => s.timeEntries);
  const matchedEntries = useMemo(
    () => (searchActive ? searchTimeEntries(timeEntries, searchQuery) : []),
    [searchActive, searchQuery, timeEntries],
  );

  // 所有视图统一：大字英文月份 + 小字年份
  const title = MONTH_EN[date.getMonth()];

  const step = (dir: number) => {
    if (view === 'day') setDate(addDays(date, dir));
    else if (view === 'week') setDate(addDays(date, dir * 7));
    else {
      const m = addMonths(date, dir);
      // 保持日期在有效范围内
      const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
      setDate(new Date(m.getFullYear(), m.getMonth(), Math.min(date.getDate(), days)));
    }
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 pt-safe z-30">
        {searchActive ? (
          <div className="flex items-center gap-2 px-3 pb-2 pt-2">
            <div className="min-w-0 flex-1">
              <SearchBar />
            </div>
            <button
              onClick={exitSearch}
              className="press text-[14px] font-medium text-primary-600"
              style={{ minHeight: 32 }}
            >
              取消
            </button>
          </div>
        ) : (
          <>
            {/* 第一行：视图切换 + 标题 + 操作按钮 */}
            <div className="flex items-center gap-1 px-2 pt-1.5">
              {/* 左上角：视图切换下拉 */}
              <ViewDropdown
                options={CAL_VIEW_OPTIONS}
                value={view}
                onChange={(v) => setView(v as CalendarViewMode)}
              />

              <button onClick={() => step(-1)} className="hit text-primary-500 press" aria-label="上一页">
                <IconChevronLeft size={20} />
              </button>
              <div className="min-w-0 flex-1 text-center">
                <div className="truncate text-[15px] font-bold leading-tight text-primary-700">{title}</div>
                <div className="truncate text-[11px] text-neutral-400">
                  {date.getFullYear()}
                </div>
              </div>
              <button onClick={() => step(1)} className="hit text-primary-500 press" aria-label="下一页">
                <IconChevronRight size={20} />
              </button>
              <button
                onClick={() => {
                  const t = startOfDay(new Date());
                  setDate(t);
                  setSelectedDate(t);
                }}
                className="mr-1 flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1.5 text-[12px] font-medium text-primary-700 press active:bg-primary-200"
                style={{ minHeight: 32 }}
              >
                <IconCalendar size={13} />
                今天
              </button>
              {/* 周视图内部子模式切换：单图标，点当前视图图标即切到另一视图 */}
              {view === 'week' && (
                <button
                  onClick={() => setWeekMode(weekMode === 'cards' ? 'timeline' : 'cards')}
                  className="mr-1 flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 press active:bg-primary-200"
                  aria-label={weekMode === 'cards' ? '切换到时间轴' : '切换到卡片'}
                  title={weekMode === 'cards' ? '时间轴' : '卡片'}
                >
                  {weekMode === 'cards' ? <IconTimeline size={16} /> : <IconGrid size={16} />}
                </button>
              )}
              {/* 周视图头部不放搜索，避免拥挤；其它视图保留 */}
              {view !== 'week' && (
                <button
                  onClick={() => setSearchActive(true)}
                  className="hit text-primary-700 press"
                  aria-label="搜索"
                >
                  <IconSearch size={20} />
                </button>
              )}
            </div>
          </>
        )}
        {searchActive && (
          <div className="px-4 pt-1 text-[12px] text-neutral-400">
            找到 {searched.length + matchedEntries.length} 个结果
          </div>
        )}
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {searchActive ? (
          <div className="scroll-y h-full pb-[100px]">
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
        ) : view === 'list' ? (
          <CalendarListView />
        ) : view === 'day' ? (
          <CalendarDayView />
        ) : view === 'week' ? (
          weekMode === 'timeline' ? <CalendarWeekTimelineView /> : <CalendarWeekCards />
        ) : (
          <CalendarMonthGrid />
        )}
      </div>
    </div>
  );
}

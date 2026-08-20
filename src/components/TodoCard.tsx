import { useRef, useState } from 'react';
import type { Category, Todo } from '../types';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import { useTimerStore } from '../store/timerStore';
import { fmtTime, humanDate, isAllDay, isSameDay } from '../lib/date';
import { IconChevronDown, IconClock, IconTrash } from './Icons';
import Highlight from './Highlight';

interface Props {
  todo: Todo;
  category?: Category;
  showDate?: boolean;
  /** 自定义清单内已由页面标题表明分类，卡片不再重复显示 */
  hideCategory?: boolean;
  /** 全局搜索查询词，非空时高亮命中片段 */
  query?: string;
  /** 打卡瞬间回调（父视图用于触发退场动画 / 撤销 toast） */
  onCheck?: (id: string) => void;
}

export default function TodoCard({ todo, category, showDate, hideCategory, query = '', onCheck }: Props) {
  const toggleTodo = useDataStore((s) => s.toggleTodo);
  const toggleSubTask = useDataStore((s) => s.toggleSubTask);
  const removeTodo = useDataStore((s) => s.removeTodo);
  const openEditor = useUIStore((s) => s.openEditor);
  const showToast = useUIStore((s) => s.showToast);
  const startTimer = useTimerStore((s) => s.startTimer);

  const [expanded, setExpanded] = useState(false);
  const [offset, setOffset] = useState(0);
  const startX = useRef<number | null>(null);
  const startY = useRef(0);
  const axis = useRef<'x' | 'y' | null>(null);
  const moved = useRef(false);

  const barColor = category?.color ?? '#A8D5BA'; // 默认主色-300
  const subDone = todo.subTasks.filter((s) => s.isCompleted).length;
  const hasTime = todo.dueDate && !isAllDay(todo.dueDate);

  // 跨天任务标识
  const isCrossDay = !!(todo.dueDate && todo.endDate && !isSameDay(todo.dueDate, todo.endDate));

  // 时间标签统一底色：非完成用主色浅底，已完成用中性浅灰底；消除 primary-50/100/200 混用导致的“时有时无”观感
  const timeChipCls = todo.isCompleted
    ? 'bg-neutral-100 text-neutral-400'
    : 'bg-primary-100 text-primary-700';

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    axis.current = null;
    moved.current = false;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!axis.current) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
    }
    if (axis.current === 'x') {
      moved.current = true;
      const next = Math.max(-88, Math.min(0, (offset < 0 ? -88 : 0) + dx));
      setOffset(next);
    }
  };

  const onTouchEnd = () => {
    if (axis.current === 'x') setOffset(offset < -44 ? -88 : 0);
    startX.current = null;
    axis.current = null;
  };

  return (
    <div className="todo-card relative overflow-hidden rounded-card">
      {/* 滑动露出的删除区 */}
      <button
        onClick={async () => {
          await removeTodo(todo.id);
          showToast('已删除');
        }}
        className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center bg-primary-600 text-white"
        aria-label="删除待办"
      >
        <IconTrash size={19} />
      </button>

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative rounded-card bg-white shadow-card-soft"
        style={{
          transform: `translate3d(${offset}px,0,0)`,
          transition: startX.current === null ? 'transform 220ms cubic-bezier(0.32,0.72,0,1)' : 'none',
        }}
      >
        <div className="flex items-stretch">
          {/* 左侧分类色条（跨天任务加宽强调） */}
          <span
            className="todo-bar shrink-0 rounded-l-card"
            style={{
              width: isCrossDay ? 5 : 4,
              backgroundColor: barColor,
            }}
          />

          {/* 勾选热区 ≥44px */}
          <button
            onClick={() => {
              toggleTodo(todo.id);
              onCheck?.(todo.id);
            }}
            className="flex w-11 shrink-0 items-center justify-center self-start"
            style={{ minHeight: 44 }}
            aria-label={todo.isCompleted ? '标记未完成' : '标记完成'}
          >
            <span
              className={`flex h-[17px] w-[17px] items-center justify-center rounded-[2px] border-[1.5px] transition-colors ${
                todo.isCompleted
                  ? 'border-primary-500 bg-primary-500'
                  : 'border-primary-300 bg-white'
              }`}
            >
              {todo.isCompleted && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
              )}
            </span>
          </button>

          <div
            className="min-w-0 flex-1 py-3 pr-3"
            onClick={() => {
              if (moved.current) {
                moved.current = false;
                return;
              }
              if (offset < 0) {
                setOffset(0);
                return;
              }
              openEditor({ todoId: todo.id });
            }}
          >
            <div
              className={`text-[15px] leading-snug ${
                todo.isCompleted ? 'text-neutral-700 line-through' : 'text-neutral-600'
              }`}
            >
              <Highlight text={todo.title} query={query} />
            </div>

            {todo.description && (
              <div className="mt-1 text-[12.5px] leading-snug text-neutral-400">
                <Highlight text={todo.description} query={query} />
              </div>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {!hideCategory && category && (
                <span className="flex items-center gap-1 text-[11.5px] text-neutral-400">
                  <span className="text-[12px] leading-none">{category.icon}</span>
                  {category.name}
                </span>
              )}
              {/* 有 End 的任务：显示起止范围；但同天+全天只显示单日期，不画箭头 */}
              {todo.dueDate && todo.endDate ? (
                isSameDay(todo.dueDate, todo.endDate) && !hasTime && isAllDay(todo.endDate) ? (
                  // 同天全天：只显示日期，不画箭头
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-[1px] text-[11.5px] font-medium ${timeChipCls}`}
                  >
                    {humanDate(todo.dueDate)}
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[11.5px] font-medium ${timeChipCls}`}
                  >
                    <span>{humanDate(todo.dueDate)}{hasTime ? ` ${fmtTime(todo.dueDate)}` : ''}</span>
                    <span className="text-primary-300">→</span>
                    <span>{isCrossDay ? humanDate(todo.endDate) + (!isAllDay(todo.endDate) ? ` ${fmtTime(todo.endDate)}` : '') : (!isAllDay(todo.endDate) ? fmtTime(todo.endDate) : '')}</span>
                  </span>
                )
              ) : (
                /* 无 End 的普通任务：只显示日期/时间 */
                <>
                  {todo.dueDate && (
                    <span
                      className={`flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[11.5px] font-medium ${timeChipCls}`}
                    >
                      {hasTime && <IconClock size={11} />}
                      {showDate && `${humanDate(todo.dueDate)} `}
                      {hasTime ? fmtTime(todo.dueDate) : '全天'}
                    </span>
                  )}
                </>
              )}
              {todo.subTasks.length > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((v) => !v);
                  }}
                  className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[11.5px] text-primary-600 press"
                  style={{ minHeight: 32 }}
                >
                  子任务 {subDone}/{todo.subTasks.length}
                  <IconChevronDown
                    size={13}
                    className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
              )}

              {!todo.isCompleted && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startTimer({ todoId: todo.id, title: todo.title, categoryId: category?.id ?? null });
                    showToast(`开始计时：${todo.title}`);
                  }}
                  className="flex items-center gap-0.5 rounded-full px-2 py-1 text-[11.5px] font-medium text-primary-600 press active:bg-primary-100"
                  style={{ minHeight: 32 }}
                  aria-label="开始计时"
                >
                  <IconClock size={13} />
                  计时
                </button>
              )}
            </div>

            {expanded && todo.subTasks.length > 0 && (
              <div className="mt-2 space-y-1.5 border-t border-primary-100 pt-2 anim-pop">
                {todo.subTasks.map((s) => (
                  <button
                    key={s.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSubTask(todo.id, s.id);
                    }}
                    className="flex w-full items-center gap-2 text-left"
                    style={{ minHeight: 36 }}
                  >
                    <span
                      className={`flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[2px] border-[1.4px] ${
                        s.isCompleted ? 'border-primary-400 bg-primary-400' : 'border-primary-300'
                      }`}
                    >
                      {s.isCompleted && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7" />
                        </svg>
                      )}
                    </span>
                    <span
                      className={`truncate text-[13px] ${
                        s.isCompleted ? 'text-neutral-400 line-through' : 'text-neutral-600'
                      }`}
                    >
                      {s.content}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

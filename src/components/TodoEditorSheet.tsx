import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDataStore } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import type { SubTask } from '../types';
import { scheduleReminder, cancelReminder } from '../lib/push';
import {
  fmtTime,
  fmtDateFriendly,
  isAllDay,
  isSameDay,
  startOfDay,
  MONTH_EN,
  WEEK_EN_SHORT,
} from '../lib/date';
import { IconChevronDown, IconClose, IconClock, IconInbox, IconPlus, IconTrash } from './Icons';

const QUICK_DATES = [
  { label: '今天', offset: 0 },
  { label: '明天', offset: 1 },
  { label: '后天', offset: 2 },
  { label: '下周', offset: 7 },
];

/* ================================================================
 *   DateTimePicker — Apple Calendar 风格日期时间选择器
 *   Cancel | Date & Time | Done
 *   All day toggle + Start / End rows (+ inline calendar / time input)
 * ================================================================ */

type EditingField = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null;

function DateTimePicker({
  open,
  initialDueDate,
  initialEndDate,
  onClose,
  onDone,
}: {
  open: boolean;
  initialDueDate: Date | null;
  initialEndDate: Date | null;
  onClose: () => void;
  onDone: (dueDate: Date | null, endDate: Date | null) => void;
}) {
  // ── State ──
  const [allDay, setAllDay] = useState(() =>
    initialDueDate ? isAllDay(initialDueDate) : false
  );
  const [startDate, setStartDate] = useState<Date>(() =>
    initialDueDate ? new Date(initialDueDate) : startOfDay(new Date())
  );
  const [startTime, setStartTime] = useState(() =>
    (initialDueDate && !isAllDay(initialDueDate)) ? fmtTime(initialDueDate) : ''
  );
  const [endDate, setEndDateState] = useState<Date>(() =>
    initialEndDate ? new Date(initialEndDate) : (initialDueDate ? new Date(initialDueDate) : startOfDay(new Date()))
  );
  const [endTime, setEndTime] = useState(() =>
    (initialEndDate && !isAllDay(initialEndDate)) ? fmtTime(initialEndDate) : ''
  );
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [calYear, setCalYear] = useState(() =>
    (initialDueDate ?? new Date()).getFullYear()
  );
  const [calMonth, setCalMonth] = useState(() =>
    (initialDueDate ?? new Date()).getMonth()
  );
  const closing = useRef(false);

  // Reset when opened
  useEffect(() => {
    if (!open) return;
    closing.current = false;
    setEditingField(null);
    const sd = initialDueDate ? new Date(initialDueDate) : startOfDay(new Date());
    setAllDay(initialDueDate ? isAllDay(initialDueDate) : false);
    setStartDate(sd);
    setStartTime(initialDueDate && !isAllDay(initialDueDate) ? fmtTime(initialDueDate) : '');
    setEndDateState(initialEndDate ? new Date(initialEndDate) : new Date(sd));
    setEndTime(initialEndDate && !isAllDay(initialEndDate) ? fmtTime(initialEndDate) : '');
    setCalYear(sd.getFullYear());
    setCalMonth(sd.getMonth());
  }, [open, initialDueDate, initialEndDate]);

  // Sync end date when start date changes (keep end >= start)
  const syncEndDate = (newStart: Date) => {
    setEndDateState((prev) => {
      if (prev.getTime() < newStart.getTime()) return new Date(newStart);
      return prev;
    });
  };

  if (!open) return null;

  const handleClose = () => {
    closing.current = true;
    setTimeout(onClose, 240);
  };

  const handleDone = () => {
    let due: Date | null = null;
    let end: Date | null = null;

    if (allDay) {
      due = startOfDay(startDate);
      end = startOfDay(endDate);
      // 用户显式选择的起止日期，原样保存；不自动顺延
    } else if (startTime) {
      const [hh, mm] = startTime.split(':').map(Number);
      due = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), hh, mm, 0, 0);
      if (endTime) {
        const [eh, em] = endTime.split(':').map(Number);
        end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), eh, em, 0, 0);
        // 用户显式选择的起止时间，原样保存；不自动顺延
      }
    } else {
      due = startOfDay(startDate);
    }

    onDone(due, end);
    handleClose();
  };

  // ── Inline calendar helpers ──
  const calFirstDay = new Date(calYear, calMonth, 1).getDay();
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = startOfDay(new Date());
  const calCells: (number | null)[] = [];
  for (let i = 0; i < calFirstDay; i++) calCells.push(null);
  for (let d = 1; d <= calDaysInMonth; d++) calCells.push(d);

  const pickDate = (d: Date) => {
    if (editingField === 'startDate') {
      setStartDate(d);
      syncEndDate(d);
    } else {
      setEndDateState(d);
    }
    setEditingField(null);
  };

  const formatDateShort = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${dd}`;
  };

  // ── Render ──
  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-end justify-center ${!open ? 'pointer-events-none' : ''}`}>
      <div
        className={closing.current ? '' : 'anim-fade'}
        style={{
          position: 'absolute', inset: 0,
          backgroundColor: 'rgba(62,122,78,0.4)',
          WebkitBackdropFilter: 'blur(20px)', backdropFilter: 'blur(20px)',
          opacity: closing.current ? 0 : 1, transition: 'opacity 240ms ease',
        }}
        onClick={handleClose}
      />

      <div
        className={`relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-xl ${
          closing.current ? '' : 'anim-sheet'
        }`}
        style={{
          maxHeight: '90dvh',
          transform: closing.current ? 'translate3d(0,100%,0)' : 'translate3d(0,0,0)',
          transition: 'transform 260ms cubic-bezier(0.32,0.72,0,1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-1">
          <button onClick={handleClose} className="-ml-2 px-2 text-[15px] text-primary-600 press" style={{ minHeight: 44 }}>
            Cancel
          </button>
          <span className="text-[16px] font-semibold text-neutral-800">Date &amp; Time</span>
          <button onClick={handleDone} className="-mr-2 px-2 text-[15px] font-semibold text-primary-700 press" style={{ minHeight: 44 }}>
            Done
          </button>
        </div>

        {/* Body scroll area */}
        <div className="scroll-y px-5 pb-8" style={{ maxHeight: 'calc(90dvh - 120px)' }}>
          {/* All-day toggle */}
          <div className="flex items-center justify-between py-3">
            <span className="text-[15px] text-neutral-700">All day</span>
            <button
              onClick={() => { setAllDay((v) => !v); if (!allDay) { setStartTime(''); setEndTime(''); } }}
              className={`relative h-[30px] w-[52px] rounded-full transition-colors press ${
                allDay ? 'bg-primary-500' : 'bg-neutral-200'
              }`}
              aria-label="Toggle all-day"
            >
              <span
                className={`absolute top-[3px] h-[24px] w-[24px] rounded-full bg-white shadow transition-transform ${
                  allDay ? 'left-[25px]' : 'left-[3px]'
                }`}
                style={{ transition: 'transform 200ms ease', transform: allDay ? 'translateX(0)' : 'translateX(0)' }}
              />
            </button>
          </div>

          <div className="h-px bg-neutral-100" />

          {/* Start row */}
          <div className="flex items-center py-3">
            <span className="w-14 shrink-0 text-[15px] text-neutral-400">Start</span>
            <div className="flex flex-1 items-center justify-end gap-3">
              <button
                onClick={() => { setEditingField(editingField === 'startDate' ? null : 'startDate'); setCalYear(startDate.getFullYear()); setCalMonth(startDate.getMonth()); }}
                className={`rounded-lg px-2.5 py-1.5 text-[15px] tabular-nums press ${
                  editingField === 'startDate' ? 'bg-primary-500 text-white font-medium' : 'text-primary-600 font-medium'
                }`}
              >
                {formatDateShort(startDate)}
              </button>
              {!allDay && (
                <button
                  onClick={() => setEditingField(editingField === 'startTime' ? null : 'startTime')}
                  className={`min-w-[56px] rounded-lg px-2.5 py-1.5 text-[15px] tabular-nums press ${
                    editingField === 'startTime' ? 'bg-primary-500 text-white font-medium' : 'text-primary-600 font-medium'
                  }`}
                >
                  {startTime || '--:--'}
                </button>
              )}
            </div>
          </div>

          {/* End row */}
          <div className="flex items-center py-3">
            <span className="w-14 shrink-0 text-[15px] text-neutral-400">End</span>
            <div className="flex flex-1 items-center justify-end gap-3">
              <button
                onClick={() => { setEditingField(editingField === 'endDate' ? null : 'endDate'); setCalYear(endDate.getFullYear()); setCalMonth(endDate.getMonth()); }}
                className={`rounded-lg px-2.5 py-1.5 text-[15px] tabular-nums press ${
                  editingField === 'endDate' ? 'bg-primary-500 text-white font-medium' : 'text-primary-600 font-medium'
                }`}
              >
                {formatDateShort(endDate)}
              </button>
              {!allDay && (
                <button
                  onClick={() => setEditingField(editingField === 'endTime' ? null : 'endTime')}
                  className={`min-w-[56px] rounded-lg px-2.5 py-1.5 text-[15px] tabular-nums press ${
                    editingField === 'endTime' ? 'bg-primary-500 text-white font-medium' : 'text-primary-600 font-medium'
                  }`}
                >
                  {endTime || '--:--'}
                </button>
              )}
            </div>
          </div>

          {/* ── Inline editor: calendar or time input ── */}
          {(editingField === 'startDate' || editingField === 'endDate') && (
            <div className="anim-pop -mx-2 border-t border-primary-100 pt-3">
              {/* Month nav */}
              <div className="flex items-center justify-center gap-5 pb-2">
                <button onClick={() => {
                  setCalMonth((m) => m === 0 ? 11 : m - 1);
                  if (calMonth === 0) setCalYear((y) => y - 1);
                }}
                  className="hit p-1 text-neutral-400 text-[18px]"
                >‹</button>
                <span className="text-[16px] font-semibold text-neutral-800">
                  {MONTH_EN[calMonth]} {calYear}
                </span>
                <button onClick={() => {
                  setCalMonth((m) => m === 11 ? 0 : m + 1);
                  if (calMonth === 11) setCalYear((y) => y + 1);
                }}
                  className="hit p-1 text-neutral-400 text-[18px]"
                >›</button>
              </div>

              {/* Weekday headers */}
              <div className="grid grid-cols-7 pb-1">
                {WEEK_EN_SHORT.map((w) => (
                  <div key={w} className="text-center text-[11px] font-medium text-neutral-400">{w}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-0.5 pb-2">
                {calCells.map((d, i) => {
                  if (d === null) return <div key={`e-${i}`} className="h-8" />;
                  const dateObj = new Date(calYear, calMonth, d);
                  const isSelected =
                    (editingField === 'startDate' && dateObj.getTime() === startOfDay(startDate).getTime()) ||
                    (editingField === 'endDate' && dateObj.getTime() === startOfDay(endDate).getTime());
                  const isTodayCell = dateObj.getTime() === today.getTime();

                  return (
                    <button
                      key={d}
                      onClick={() => pickDate(dateObj)}
                      className={`flex h-8 flex-col items-center justify-center rounded-full press ${
                        isSelected ? 'bg-primary-500' : isTodayCell ? 'ring-1 ring-primary-300' : ''
                      }`}
                    >
                      <span className={`text-[12.5px] leading-none tabular-nums ${
                        isSelected ? 'font-bold text-white' : 'text-neutral-700'
                      } ${isTodayCell && !isSelected ? 'text-primary-600 font-semibold' : ''}`}>
                        {d}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Today shortcut */}
              <button
                onClick={() => pickDate(today)}
                className="w-full rounded-xl bg-primary-50 py-2 text-[13px] font-medium text-primary-700 press active:bg-primary-100"
              >
                Today
              </button>
            </div>
          )}

          {/* Time input editors */}
          {(editingField === 'startTime' || editingField === 'endTime') && (
            <div className="anim-pop -mx-2 border-t border-primary-100 pt-4 pb-2">
              <div className="mb-3 text-center text-[13px] font-medium text-neutral-500">
                {editingField === 'startTime' ? 'Start time' : 'End time'}
              </div>
              <div className="flex items-center justify-center gap-4">
                <input
                  type="time"
                  value={editingField === 'startTime' ? startTime : endTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (editingField === 'startTime') setStartTime(v);
                    else setEndTime(v);
                  }}
                  className="rounded-xl border border-primary-200 bg-primary-50/50 px-4 py-3 text-[18px] text-neutral-700 outline-none focus:border-primary-400 tabular-nums"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (editingField === 'startTime') setStartTime('');
                    else setEndTime('');
                  }}
                  className="rounded-xl px-3 py-3 text-[13px] text-neutral-400 press active:bg-neutral-100"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ================================================================
 *   TodoEditorSheet — 编辑器主组件
 *   布局：清单 → ☐+时间行 → 标题 → 描述 → 子任务
 * ================================================================ */

export default function TodoEditorSheet() {
  const open = useUIStore((s) => s.editorOpen);
  const editingId = useUIStore((s) => s.editingTodoId);
  const presetDate = useUIStore((s) => s.presetDate);
  const presetCategoryId = useUIStore((s) => s.presetCategoryId);
  const presetSectionId = useUIStore((s) => s.presetSectionId);
  const close = useUIStore((s) => s.closeEditor);
  const showToast = useUIStore((s) => s.showToast);

  const categories = useDataStore((s) => s.categories);
  const todos = useDataStore((s) => s.todos);
  const addTodo = useDataStore((s) => s.addTodo);
  const updateTodo = useDataStore((s) => s.updateTodo);
  const removeTodo = useDataStore((s) => s.removeTodo);

  const editing = useMemo(
    () => (editingId ? todos.find((t) => t.id === editingId) ?? null : null),
    [editingId, todos],
  );

  const [categoryId, setCategoryId] = useState('');
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [completed, setCompleted] = useState(false);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [subOpen, setSubOpen] = useState(false);
  // 提醒（Web Push）：仅对带 dueDate 的任务生效
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderLead, setReminderLead] = useState(10);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showSecPicker, setShowSecPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!open) return;
    setClosing(false);
    setDragY(0);
    setShowCatPicker(false);
    setShowSecPicker(false);
    setShowDatePicker(false);
    if (editing) {
      setCategoryId(editing.categoryId);
      setSectionId(editing.sectionId ?? null);
      setTitle(editing.title);
      setDescription(editing.description || '');
      setCompleted(editing.isCompleted);
      setDueDate(editing.dueDate ? new Date(editing.dueDate) : null);
      setEndDate(editing.endDate ? new Date(editing.endDate) : null);
      setSubTasks(editing.subTasks);
      setSubOpen(editing.subTasks.length > 0);
      setReminderEnabled(editing.reminder?.enabled ?? false);
      setReminderLead(editing.reminder?.leadMin ?? 10);
    } else {
      setCategoryId(presetCategoryId ?? '');
      setSectionId(presetSectionId ?? null);
      setTitle('');
      setDescription('');
      setCompleted(false);
      setDueDate(presetDate ? new Date(presetDate) : null);
      setEndDate(null);
      setSubTasks([]);
      setSubOpen(false);
      setReminderEnabled(false);
      setReminderLead(10);
    }
  }, [open, editing, presetDate, presetCategoryId, presetSectionId, categories]);

  if (!open) return null;

  const handleClose = () => {
    setClosing(true);
    setTimeout(close, 240);
  };

  const submit = async () => {
    if (!title.trim()) {
      showToast('先写点什么吧 🍃');
      return;
    }
    const cleanSubs = subTasks.filter((s) => s.content.trim());
    const reminder = reminderEnabled && dueDate ? { enabled: true, leadMin: reminderLead } : null;

    let savedId: string | null = null;
    try {
      if (editing) {
        await updateTodo(editing.id, {
          categoryId,
          sectionId,
          title: title.trim(),
          description: description.trim(),
          dueDate,
          endDate,
          subTasks: cleanSubs,
          isCompleted: completed,
          reminder,
        });
        savedId = editing.id;
        showToast('已保存');
      } else {
        const created = await addTodo({
          categoryId: categoryId || '',
          sectionId,
          title: title.trim(),
          description: description.trim(),
          dueDate,
          endDate,
          subTasks: cleanSubs,
          isCompleted: completed,
          reminder,
        });
        savedId = created.id;
        showToast('已添加 ✓');
      }
    } catch (e) {
      console.error('[TodoEditor] submit error:', e);
      showToast('保存失败，请重试');
      return; // 数据都没存成功，不关闭让用户重试
    }

    // 提醒排程（失败不影响主流程）：有提醒就排程，否则取消旧提醒
    if (savedId && reminder) {
      void scheduleReminder({ id: savedId, title: title.trim(), dueDate: dueDate!, reminder });
    } else if (savedId) {
      void cancelReminder(savedId);
    }

    // 数据保存成功 → 立刻关闭（提醒排程在后台异步进行）
    handleClose();
  };

  // 当前选中的分类对象
  const cat = categories.find((c) => c.id === categoryId);
  // 当前清单的 sections（用于显示分组选择器）
  const catSections = cat?.sections && cat.sections.length > 0 ? cat.sections : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* 遮罩 */}
      <div
        onClick={handleClose}
        className={closing ? '' : 'anim-fade'}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(62, 122, 78, 0.4)',
          WebkitBackdropFilter: 'blur(20px)',
          backdropFilter: 'blur(20px)',
          opacity: closing ? 0 : 1,
          transition: 'opacity 240ms ease',
        }}
      />

      <div
        ref={sheetRef}
        className={`relative max-h-[90dvh] w-full overflow-hidden rounded-t-[24px] bg-white shadow-sheet ${
          closing ? '' : 'anim-sheet'
        }`}
        style={{
          transform: closing ? 'translate3d(0,100%,0)' : `translate3d(0, ${dragY}px, 0)`,
          transition: closing || dragStart.current === null ? 'transform 260ms cubic-bezier(0.32,0.72,0,1)' : 'none',
        }}
      >
        {/* 拖拽把手 */}
        <div
          className="flex h-8 w-full items-center justify-center"
          onTouchStart={(e) => { dragStart.current = e.touches[0].clientY; }}
          onTouchMove={(e) => {
            if (dragStart.current === null) return;
            const dy = e.touches[0].clientY - dragStart.current;
            if (dy > 0) setDragY(dy);
          }}
          onTouchEnd={() => {
            const should = dragY > 90;
            dragStart.current = null;
            setDragY(0);
            if (should) handleClose();
          }}
        >
          <span className="h-[5px] w-10 rounded-full bg-primary-200" />
        </div>

        {/* 头部栏 */}
        <div className="flex items-center justify-between px-5 pb-2">
          <button onClick={handleClose} className="-ml-2 px-2 text-[15px] text-neutral-500 press" style={{ minHeight: 44 }}>
            取消
          </button>
          <span className="text-[16px] font-semibold text-primary-700">
            {editing ? '编辑待办' : '新建待办'}
          </span>
          {editing ? (
            <button onClick={async () => { await removeTodo(editing.id); void cancelReminder(editing.id); showToast('已删除'); handleClose(); }} className="hit -mr-2 text-neutral-400 active:text-primary-600" aria-label="删除">
              <IconTrash size={18} />
            </button>
          ) : (
            <span className="w-11" />
          )}
        </div>

        <div className="scroll-y max-h-[calc(90dvh-150px)] px-5 pb-3">
          {/* ① 清单选择：emoji + name + chevron */}
          <button
            onClick={() => setShowCatPicker(!showCatPicker)}
            className="mb-4 flex w-full items-center gap-2.5 rounded-2xl px-1 py-3 text-left press active:bg-primary-50"
            style={{ minHeight: 48 }}
          >
            {cat ? (
              <span className="text-[22px] leading-none">{cat.icon}</span>
            ) : (
              <IconInbox size={22} className="text-primary-500" />
            )}
            <span className="flex-1 text-[16px] font-medium text-neutral-700">{cat?.name ?? 'Inbox'}</span>
            <IconChevronDown size={18} className={`text-neutral-400 transition-transform duration-200 ${showCatPicker ? 'rotate-180' : ''}`} />
          </button>

          {/* 清单下拉面板 */}
          {showCatPicker && (
            <div className="mb-4 anim-pop -mt-2 space-y-0.5 rounded-2xl bg-primary-50/80 p-2">
              {/* 不分类（收集箱）选项 */}
              <button
                onClick={() => { setCategoryId(''); setSectionId(null); setShowCatPicker(false); }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left press ${
                  !categoryId ? 'bg-white shadow-sm' : ''
                }`}
                style={{ minHeight: 42 }}
              >
                <IconInbox size={18} className="text-primary-500 shrink-0" />
                <span className={`flex-1 text-[14] ${!categoryId ? 'font-semibold text-primary-700' : 'text-neutral-600'}`}>Inbox（未分类）</span>
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setCategoryId(c.id); setSectionId(null); setShowCatPicker(false); }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left press ${
                    c.id === categoryId ? 'bg-white shadow-sm' : ''
                  }`}
                  style={{ minHeight: 42 }}
                >
                  <span className="text-[18px]">{c.icon}</span>
                  <span className={`flex-1 text-[14px] ${c.id === categoryId ? 'font-semibold text-primary-700' : 'text-neutral-600'}`}>{c.name}</span>
                  {c.color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />}
                </button>
              ))}
            </div>
          )}

          {/* 分组选择器（仅当所选清单有 sections 时显示） */}
          {catSections && categoryId && (
            <>
              <button
                onClick={() => setShowSecPicker(!showSecPicker)}
                className="mb-4 flex w-full items-center gap-2.5 rounded-2xl px-1 py-3 text-left press active:bg-primary-50"
                style={{ minHeight: 48 }}
              >
                <span className="text-[20px] leading-none">📁</span>
                <span className="flex-1 text-[16px] font-medium text-neutral-700">
                  {sectionId ? catSections.find((s) => s.id === sectionId)?.name ?? '选择分组' : '未分组'}
                </span>
                <IconChevronDown size={18} className={`text-neutral-400 transition-transform duration-200 ${showSecPicker ? 'rotate-180' : ''}`} />
              </button>

              {showSecPicker && (
                <div className="mb-4 anim-pop -mt-2 space-y-0.5 rounded-2xl bg-primary-50/80 p-2">
                  {/* 未分组选项 */}
                  <button
                    onClick={() => { setSectionId(null); setShowSecPicker(false); }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left press ${
                      !sectionId ? 'bg-white shadow-sm' : ''
                    }`}
                    style={{ minHeight: 42 }}
                  >
                    <span className="text-[16px]">📂</span>
                    <span className={`flex-1 text-[14px] ${!sectionId ? 'font-semibold text-primary-700' : 'text-neutral-600'}`}>未分组</span>
                  </button>
                  {catSections.map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => { setSectionId(sec.id); setShowSecPicker(false); }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left press ${
                        sec.id === sectionId ? 'bg-white shadow-sm' : ''
                      }`}
                      style={{ minHeight: 42 }}
                    >
                      <span className="text-[16px]">🏷️</span>
                      <span className={`flex-1 text-[14px] ${sec.id === sectionId ? 'font-semibold text-primary-700' : 'text-neutral-600'}`}>{sec.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ② 时间行：☐ + 结构化日期时间 → 点击弹 DateTimePicker */}
          <div
            className="mb-4 flex w-full items-start gap-3 rounded-2xl px-1 py-2 active:bg-primary-50"
            style={{ minHeight: 48 }}
          >
            {/* 打卡框 */}
            <button
              onClick={() => setCompleted((v) => !v)}
              aria-label={completed ? 'Mark incomplete' : 'Mark complete'}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md press"
            >
              <span
                className={`flex h-[17px] w-[17px] items-center justify-center rounded-[2px] border-[1.4px] ${
                  completed ? 'border-primary-500 bg-primary-500' : 'border-primary-300 bg-white'
                }`}
              >
                {completed && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                )}
              </span>
            </button>

            {/* 日期时间触发区 — Apple Calendar 风格结构化展示 */}
            <button
              onClick={() => setShowDatePicker(true)}
              className="flex min-w-0 flex-1 flex-col items-start gap-0.5 self-stretch py-1 text-left press"
              style={{ minHeight: 40 }}
            >
              {dueDate ? (
                <>
                  {/* All day badge */}
                  {isAllDay(dueDate) && (
                    <span className="inline-block rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                      All day
                    </span>
                  )}
                  {/* Start line */}
                  <div className="flex items-center gap-2 text-[14.5px]">
                    <span className="text-neutral-400 w-10 shrink-0">Start</span>
                    <span className="text-primary-600 font-medium tabular-nums">{fmtDateFriendly(dueDate)}</span>
                    {!isAllDay(dueDate) && (
                      <span className="text-primary-600 font-medium tabular-nums">{fmtTime(dueDate)}</span>
                    )}
                  </div>
                  {/* End line (only if endDate exists) */}
                  {(endDate || (!isAllDay(dueDate))) && (
                    <div className="flex items-center gap-2 text-[14.5px]">
                      <span className="text-neutral-400 w-10 shrink-0">End</span>
                      {endDate ? (
                        <>
                          <span className="font-medium tabular-nums" style={{ color: isSameDay(dueDate, endDate) ? '#639922' : '#639922' }}>
                            {isSameDay(dueDate, endDate) ? '' : fmtDateFriendly(endDate)}
                          </span>
                          {!isAllDay(endDate) && (
                            <span className="font-medium tabular-nums text-primary-600">{fmtTime(endDate)}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-neutral-300 text-[13px]">Add end time</span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <span className="text-[15px] text-neutral-300 leading-relaxed">Select date &amp; time</span>
              )}
            </button>
          </div>

          {/* 快捷日期按钮（无选中日期时显示） */}
          {!dueDate && (
            <div className="mb-4 flex flex-wrap gap-2">
              {QUICK_DATES.map((q) => (
                <button
                  key={q.label}
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() + q.offset);
                    setDueDate(startOfDay(d));
                  }}
                  className="rounded-full bg-primary-100 px-3 py-1.5 text-[13px] text-primary-700 press active:bg-primary-200"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* 已选日期时的清除按钮 */}
          {dueDate && (
            <div className="mb-4">
              <button
                onClick={() => { setDueDate(null); setEndDate(null); }}
                className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1.5 text-[13px] text-neutral-500 press"
              >
                <IconClose size={12} /> 清除日期
              </button>
            </div>
          )}

          {/* ③ 提醒（仅当选了日期才出现） */}
          {dueDate && (
            <div className="mb-4 rounded-2xl bg-primary-50 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[15px] font-medium text-neutral-700">
                  <IconClock size={18} className="text-primary-500" />
                  提醒我
                </span>
                <button
                  onClick={() => setReminderEnabled((v) => !v)}
                  className={`relative h-[30px] w-[52px] rounded-full transition-colors press ${
                    reminderEnabled ? 'bg-primary-500' : 'bg-neutral-200'
                  }`}
                  aria-label="切换提醒"
                >
                  <span
                    className={`absolute top-[3px] h-[24px] w-[24px] rounded-full bg-white shadow transition-transform ${
                      reminderEnabled ? 'left-[25px]' : 'left-[3px]'
                    }`}
                  />
                </button>
              </div>
              {reminderEnabled && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { label: '准点', v: 0 },
                    { label: '提前 1 分', v: 1 },
                    { label: '提前 5 分', v: 5 },
                    { label: '提前 10 分', v: 10 },
                    { label: '提前 15 分', v: 15 },
                    { label: '提前 30 分', v: 30 },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => setReminderLead(opt.v)}
                      className={`rounded-full px-3 py-1.5 text-[13px] press active:opacity-80 ${
                        reminderLead === opt.v
                          ? 'bg-primary-500 font-medium text-white'
                          : 'bg-white text-primary-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ④ 事项标题 */}
          <div className="mb-4">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={2}
              placeholder="What would you like to do?"
              className="w-full resize-none rounded-2xl border border-primary-200 bg-primary-50/50 px-4 py-3 text-[16px] leading-relaxed text-neutral-700 outline-none placeholder:text-neutral-350 focus:border-primary-400"
            />
          </div>

          {/* ④ 补充说明（Description） */}
          <div className="mb-4">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="添加补充说明…"
              className="w-full resize-none rounded-2xl border border-primary-200 bg-white px-4 py-3 text-[14px] leading-relaxed text-neutral-600 outline-none placeholder:text-neutral-350 focus:border-primary-400"
            />
          </div>

          {/* ⑤ 子任务（可折叠） */}
          <div className="mb-2 mt-2">
            <button onClick={() => setSubOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-2xl bg-primary-50 px-4 press" style={{ minHeight: 48 }}
            >
              <span className="flex items-center gap-2 text-[14px] font-medium text-primary-700">
                子任务
                {subTasks.length > 0 && (
                  <span className="rounded-full bg-primary-200 px-2 py-0.5 text-[11px] text-primary-800">
                    {subTasks.filter((s) => s.isCompleted).length}/{subTasks.length}
                  </span>
                )}
              </span>
              <IconChevronDown size={18} className={`text-primary-400 transition-transform duration-200 ${subOpen ? 'rotate-180' : ''}`} />
            </button>

            {subOpen && (
              <div className="mt-2 space-y-2 anim-pop">
                {subTasks.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <button onClick={() => setSubTasks((list) => list.map((x) => (x.id === s.id ? { ...x, isCompleted: !x.isCompleted } : x)))}
                      className="flex h-11 w-11 shrink-0 items-center justify-center" aria-label="切换子任务"
                    >
                      <span className={`flex h-[15px] w-[15px] items-center justify-center rounded-[2px] border-[1.4px] ${
                        s.isCompleted ? 'border-primary-500 bg-primary-500' : 'border-primary-300 bg-white'
                      }`}>
                        {s.isCompleted && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                        )}
                      </span>
                    </button>
                    <input value={s.content} autoFocus={i === subTasks.length - 1 && !s.content}
                      onChange={(e) => setSubTasks((list) => list.map((x) => (x.id === s.id ? { ...x, content: e.target.value } : x)))}
                      placeholder="子任务内容"
                      className={`min-w-0 flex-1 rounded-xl border border-primary-200 bg-white px-3 py-2 text-[14px] outline-none placeholder:text-neutral-400 focus:border-primary-400 ${
                        s.isCompleted ? 'text-neutral-400 line-through' : 'text-neutral-600'
                      }`}
                    />
                    <button onClick={() => setSubTasks((list) => list.filter((x) => x.id !== s.id))}
                      className="flex h-11 w-9 shrink-0 items-center justify-center text-neutral-300 active:text-primary-600" aria-label="移除子任务"
                    >
                      <IconClose size={16} />
                    </button>
                  </div>
                ))}
                <button onClick={() => setSubTasks((list) => [...list, { id: Math.random().toString(36).slice(2), content: '', isCompleted: false }])}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary-300 py-2.5 text-[14px] text-primary-600 press active:bg-primary-50"
                >
                  <IconPlus size={15} /> 添加子任务
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 操作区 */}
        <div className="border-t border-primary-100 bg-white px-5 pt-3 pb-safe">
          <button onClick={submit}
            className="mb-3 w-full rounded-2xl bg-primary-500 py-3.5 text-[16px] font-semibold text-white press active:bg-primary-600"
            style={{ minHeight: 48 }}
          >
            {editing ? '保存修改' : '确认添加'}
          </button>
        </div>
      </div>

      {/* DateTimePicker 弹窗 */}
      <DateTimePicker
        open={showDatePicker}
        initialDueDate={dueDate}
        initialEndDate={endDate}
        onClose={() => setShowDatePicker(false)}
        onDone={(d, e) => {
          setDueDate(d);
          setEndDate(e);
          setShowDatePicker(false);
        }}
      />
    </div>
  );
}

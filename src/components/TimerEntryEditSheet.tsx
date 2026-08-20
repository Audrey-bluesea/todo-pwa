import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../store/uiStore';
import { useTimerStore, fmtDuration } from '../store/timerStore';
import { useDataStore } from '../store/dataStore';
import { fmtTime, fmtDateFriendly, pad } from '../lib/date';
import { IconClose, IconTrash } from './Icons';
import TimePicker from './TimePicker';

/** 把 Date 转为 YYYY-MM-DD（供 input type="date" 使用） */
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function TimerEntryEditSheet() {
  const id = useUIStore((s) => s.editingTimeEntryId);
  const setEditing = useUIStore((s) => s.setEditingTimeEntry);
  const showToast = useUIStore((s) => s.showToast);

  const timeEntries = useTimerStore((s) => s.timeEntries);
  const running = useTimerStore((s) => s.running);
  const updateTimeEntry = useTimerStore((s) => s.updateTimeEntry);
  const updateRunning = useTimerStore((s) => s.updateRunning);
  const removeTimeEntry = useTimerStore((s) => s.removeTimeEntry);
  const cancelTimer = useTimerStore((s) => s.cancelTimer);

  const categories = useDataStore((s) => s.categories);

  const liveTimer = running.find((r) => r.id === id) ?? null;
  const isLive = !!liveTimer;
  const entry = timeEntries.find((e) => e.id === id) ?? null;
  const source = entry ?? (liveTimer ? { id: liveTimer.id, title: liveTimer.title, categoryId: liveTimer.categoryId } : null);

  const [title, setTitle] = useState('');
  const [cat, setCat] = useState('');
  const [pickerFor, setPickerFor] = useState<'start' | 'end' | null>(null);
  const [pickerInitial, setPickerInitial] = useState({ h: 0, m: 0 });

  useEffect(() => {
    if (!source) return;
    setTitle(source.title);
    setCat(source.categoryId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!id || !source) return null;

  const close = () => setEditing(null);

  const apply = (patch: { title?: string; categoryId?: string | null }) => {
    if (isLive && liveTimer) updateRunning(liveTimer.id, patch as any);
    else if (entry) updateTimeEntry(entry.id, patch);
  };

  const handleTitle = (v: string) => {
    setTitle(v);
    apply({ title: v });
  };

  const handleCat = (v: string) => {
    setCat(v);
    apply({ categoryId: v || null });
  };

  const handleDelete = async () => {
    if (isLive && liveTimer) {
      await cancelTimer(liveTimer.id);
      showToast('已取消计时');
    } else if (entry) {
      await removeTimeEntry(entry.id);
      showToast('已删除记录');
    }
    close();
  };

  const start = liveTimer ? new Date(liveTimer.start) : (entry ? entry.start : new Date());
  const end = entry ? entry.end : null;
  const durMs = end ? +end - +start : 0;

  /** 日期选择器值变化 → 写回 */
  const handleDateChange = (which: 'start' | 'end', val: string) => {
    if (!val) return;
    const [y, mo, d] = val.split('-').map(Number);
    if (which === 'start') {
      const newDate = new Date(start);
      newDate.setFullYear(y, mo - 1, d);
      if (end && newDate.getTime() > +end) {
        showToast('开始日期不能晚于结束日期');
        return;
      }
      if (isLive && liveTimer) updateRunning(liveTimer.id, { start: newDate.getTime() });
      else if (entry) updateTimeEntry(entry.id, { start: newDate });
    } else if (end) {
      const newDate = new Date(end);
      newDate.setFullYear(y, mo - 1, d);
      if (newDate.getTime() < +start) {
        showToast('结束日期不能早于开始日期');
        return;
      }
      if (entry) updateTimeEntry(entry.id, { end: newDate });
    }
  };

  // 打开时间滚轮：以被点字段为准，预填当前时/分
  const openPicker = (which: 'start' | 'end') => {
    const base = which === 'start' ? start : end ?? new Date();
    setPickerInitial({ h: base.getHours(), m: base.getMinutes() });
    setPickerFor(which);
  };

  const confirmPicker = (h: number, m: number) => {
    if (pickerFor === 'start') {
      const newDate = new Date(start);
      newDate.setHours(h, m, 0, 0);
      if (end && newDate.getTime() > +end) {
        showToast('开始时间不能晚于结束时间');
        return;
      }
      if (isLive && liveTimer) updateRunning(liveTimer.id, { start: newDate.getTime() });
      else if (entry) updateTimeEntry(entry.id, { start: newDate });
    } else if (pickerFor === 'end' && end) {
      const newDate = new Date(end);
      newDate.setHours(h, m, 0, 0);
      if (newDate.getTime() < +start) {
        showToast('结束时间不能早于开始时间');
        return;
      }
      if (entry) updateTimeEntry(entry.id, { end: newDate });
    }
    setPickerFor(null);
  };

  return createPortal(
    <div className="fixed inset-0 z-[56]">
      <div
        className="absolute inset-0 anim-fade"
        style={{ backgroundColor: 'rgba(30, 43, 60, 0.4)' }}
        onClick={close}
      />
      <div className="absolute inset-x-0 bottom-0 anim-sheet max-h-[82vh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-8 pt-3 px-surface">
        <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-primary-200" />

        <div className="mb-3 flex items-center justify-between">
          <span className="text-[17px] font-bold text-primary-700">编辑计时记录</span>
          <button onClick={close} className="hit text-neutral-400 press" aria-label="关闭">
            <IconClose size={20} />
          </button>
        </div>

        {/* 时间范围：每行分「日期」和「时间」两段，各自可点编辑 */}
        <div className="mb-4 overflow-hidden rounded-xl bg-primary-50">
          {/* 开始行 */}
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="shrink-0 text-[12px] text-neutral-400">开始</span>
            <div className="relative flex items-center gap-2">
              {/* 日期：原生 input 覆盖在文字上，iOS 直接触发系统日历 */}
              <div className="relative">
                <span className="block px-1 py-0.5 text-[14px] font-medium text-primary-600">
                  {fmtDateFriendly(start)}
                </span>
                <input
                  type="date"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={toISODate(start)}
                  onChange={(e) => handleDateChange('start', e.target.value)}
                />
              </div>
              <button
                onClick={() => openPicker('start')}
                className="press rounded-md px-1 py-0.5 text-[14px] font-medium text-neutral-700 active:bg-primary-100"
              >
                {fmtTime(start)}
              </button>
            </div>
          </div>

          <div className="h-px bg-primary-100" />

          {/* 结束行 */}
          <div className={`flex items-center justify-between px-3.5 py-2.5 ${!end ? 'opacity-60' : ''}`}>
            <span className="shrink-0 text-[12px] text-neutral-400">结束</span>
            {end ? (
              <div className="relative flex items-center gap-2">
                <div className="relative">
                  <span className="block px-1 py-0.5 text-[14px] font-medium text-primary-600">
                    {fmtDateFriendly(end)}
                  </span>
                  <input
                    type="date"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    value={toISODate(end)}
                    onChange={(e) => handleDateChange('end', e.target.value)}
                  />
                </div>
                <button
                  onClick={() => openPicker('end')}
                  className="press rounded-md px-1 py-0.5 text-[14px] font-medium text-neutral-700 active:bg-primary-100"
                >
                  {fmtTime(end)}
                </button>
              </div>
            ) : (
              <span className="text-[14px] font-medium text-neutral-400">进行中（不可编辑）</span>
            )}
          </div>

          {end && (
            <div className="flex items-center justify-end px-3.5 pb-2.5">
              <span className="text-[13px] font-medium text-primary-600">{fmtDuration(durMs)}</span>
            </div>
          )}
        </div>

        {/* 任务名 */}
        <div className="mb-1.5 text-[13px] font-semibold text-neutral-500">任务名</div>
        <input
          value={title}
          onChange={(e) => handleTitle(e.target.value)}
          placeholder="记录名称"
          className="mb-4 w-full rounded-xl border border-primary-100 bg-primary-50 px-3.5 py-3 text-[15px] text-neutral-700 outline-none placeholder:text-neutral-400 focus:border-primary-300"
          style={{ minHeight: 46 }}
        />

        {/* 清单 */}
        <div className="mb-1.5 text-[13px] font-semibold text-neutral-500">清单</div>
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => handleCat('')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] press ${
              cat === '' ? 'bg-primary-500 text-white' : 'border border-primary-100 bg-white text-neutral-600'
            }`}
            style={{ minHeight: 34 }}
          >
            收集箱
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => handleCat(c.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] press ${
                cat === c.id ? 'bg-primary-500 text-white' : 'border border-primary-100 bg-white text-neutral-600'
              }`}
              style={{ minHeight: 34 }}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* 删除 */}
        <button
          onClick={handleDelete}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 py-3 text-[15px] font-medium text-red-500 press active:bg-red-100"
        >
          <IconTrash size={18} />
          删除记录
        </button>
      </div>

      {/* 滚轮时间选择器（覆盖在编辑面板之上） */}
      {pickerFor && (
        <TimePicker
          title={pickerFor === 'start' ? '选择开始时间' : '选择结束时间'}
          initialHour={pickerInitial.h}
          initialMinute={pickerInitial.m}
          onConfirm={confirmPicker}
          onCancel={() => setPickerFor(null)}
        />
      )}
    </div>,
    document.body,
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { QuickTimerPreset } from '../types';
import { useUIStore } from '../store/uiStore';
import { useTimerStore, fmtElapsed, fmtDuration } from '../store/timerStore';
import { useDataStore } from '../store/dataStore';
import { IconClose, IconTimer } from './Icons';

export default function TimerStartSheet() {
  const open = useUIStore((s) => s.timerSheetOpen);
  const setOpen = useUIStore((s) => s.setTimerSheetOpen);
  const showToast = useUIStore((s) => s.showToast);

  const running = useTimerStore((s) => s.running);
  const startTimer = useTimerStore((s) => s.startTimer);
  const stopTimer = useTimerStore((s) => s.stopTimer);
  const quickPresets = useTimerStore((s) => s.quickPresets);
  const addQuickPreset = useTimerStore((s) => s.addQuickPreset);
  const updateQuickPreset = useTimerStore((s) => s.updateQuickPreset);
  const removeQuickPreset = useTimerStore((s) => s.removeQuickPreset);

  const categories = useDataStore((s) => s.categories);

  const [label, setLabel] = useState('');
  const [freeCat, setFreeCat] = useState(''); // '' = 收集箱（未分类）
  const [presetMode, setPresetMode] = useState<'view' | 'edit'>('view');
  const [draftPreset, setDraftPreset] = useState<QuickTimerPreset | null>(null);
  const [, setTick] = useState(0);

  // 运行中：实时刷新已用时长
  useEffect(() => {
    if (running.length === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running.length]);

  if (!open) return null;

  const close = () => setOpen(false);

  const handleStartFree = async () => {
    await startTimer({ title: label.trim() || '自由计时', categoryId: freeCat || null });
    setLabel('');
    setFreeCat('');
    showToast('开始计时');
    close();
  };

  const handleStop = async (id: string) => {
    const entry = await stopTimer(id);
    if (entry?.end) {
      showToast(`已记录 ${fmtDuration(+entry.end - +entry.start)}`);
    }
  };

  const startPreset = async (preset: QuickTimerPreset) => {
    await startTimer({ title: preset.title, categoryId: preset.categoryId });
    showToast('开始计时');
    close();
  };

  const saveDraftPreset = async () => {
    if (!draftPreset?.title.trim()) {
      showToast('先写个名称吧');
      return;
    }
    if (draftPreset.id) {
      await updateQuickPreset(draftPreset.id, {
        title: draftPreset.title.trim(),
        categoryId: draftPreset.categoryId || null,
      });
    } else {
      await addQuickPreset({
        title: draftPreset.title.trim(),
        categoryId: draftPreset.categoryId || null,
      });
    }
    setDraftPreset(null);
  };

  const deletePreset = async (id: string, title: string) => {
    if (typeof window !== 'undefined' && window.confirm(`确定删除快捷计时「${title}」？`)) {
      await removeQuickPreset(id);
    }
  };

  const openPresetDraft = (preset?: QuickTimerPreset) => {
    setPresetMode('edit');
    setDraftPreset(
      preset ?? {
        id: '',
        title: '',
        categoryId: '',
        createdAt: new Date(),
        sortOrder: quickPresets.length,
      },
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[55]">
      <div
        className="absolute inset-0 anim-fade"
        style={{ backgroundColor: 'rgba(30, 43, 60, 0.4)' }}
        onClick={close}
      />
      <div className="absolute inset-x-0 bottom-0 anim-sheet max-h-[82vh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-8 pt-3 px-surface">
        <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-primary-200" />

        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconTimer size={20} className="text-primary-500" />
            <span className="text-[17px] font-bold text-primary-700">计时</span>
          </div>
          <button onClick={close} className="hit text-neutral-400 press" aria-label="关闭">
            <IconClose size={20} />
          </button>
        </div>

        {/* 进行中 */}
        {running.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-neutral-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              进行中 · {running.length}
            </div>
            {[...running]
              .sort((a, b) => a.start - b.start)
              .map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-100/60 px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-neutral-700">{r.title}</div>
                    <div className="font-mono text-[13px] tabular-nums text-primary-600">
                      {fmtElapsed(Date.now() - r.start)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleStop(r.id)}
                    className="rounded-full bg-primary-500 px-4 py-2 text-[13px] font-semibold text-white press active:bg-primary-600"
                    style={{ minHeight: 38 }}
                  >
                    结束
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* 开始新计时 */}
        <div className="mb-2 text-[13px] font-semibold text-neutral-500">开始计时</div>

        {/* 选择清单（仅自由计时） */}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFreeCat('')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] press ${
              freeCat === '' ? 'bg-primary-500 text-white' : 'border border-primary-100 bg-white text-neutral-600'
            }`}
            style={{ minHeight: 34 }}
          >
            收集箱
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setFreeCat(c.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] press ${
                freeCat === c.id ? 'bg-primary-500 text-white' : 'border border-primary-100 bg-white text-neutral-600'
              }`}
              style={{ minHeight: 34 }}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="记录名称（如：写周报）"
            className="min-w-0 flex-1 rounded-xl border border-primary-100 bg-primary-50 px-3.5 py-3 text-[15px] text-neutral-700 outline-none placeholder:text-neutral-400 focus:border-primary-300"
            style={{ minHeight: 46 }}
          />
          <button
            onClick={handleStartFree}
            className="shrink-0 rounded-xl bg-primary-500 px-5 py-3 text-[15px] font-semibold text-white press active:bg-primary-600"
            style={{ minHeight: 46 }}
          >
            开始
          </button>
        </div>

        {/* 快捷计时 */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-semibold text-neutral-500">快捷计时</span>
            {quickPresets.length > 0 && (
              <button
                onClick={() => {
                  setPresetMode((m) => (m === 'edit' ? 'view' : 'edit'));
                  setDraftPreset(null);
                }}
                className="text-[12px] text-primary-600 press"
              >
                {presetMode === 'edit' ? '完成' : '管理'}
              </button>
            )}
          </div>

          {draftPreset && (
            <div className="anim-pop mb-3 rounded-2xl bg-primary-50 p-3">
              <input
                value={draftPreset.title}
                onChange={(e) => setDraftPreset((d) => (d ? { ...d, title: e.target.value } : d))}
                placeholder="快捷任务名称（如：洗澡）"
                className="mb-2 w-full rounded-xl border border-primary-100 bg-white px-3 py-2 text-[14px] text-neutral-700 outline-none placeholder:text-neutral-400 focus:border-primary-300"
              />
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setDraftPreset((d) => (d ? { ...d, categoryId: '' } : d))}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] press ${
                    draftPreset.categoryId === ''
                      ? 'bg-primary-500 text-white'
                      : 'border border-primary-100 bg-white text-neutral-600'
                  }`}
                  style={{ minHeight: 30 }}
                >
                  收集箱
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setDraftPreset((d) => (d ? { ...d, categoryId: c.id } : d))}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] press ${
                      draftPreset.categoryId === c.id
                        ? 'bg-primary-500 text-white'
                        : 'border border-primary-100 bg-white text-neutral-600'
                    }`}
                    style={{ minHeight: 30 }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDraftPreset(null)}
                  className="flex-1 rounded-xl bg-white py-2 text-[13px] text-neutral-500 press active:bg-neutral-50"
                >
                  取消
                </button>
                <button
                  onClick={() => void saveDraftPreset()}
                  className="flex-1 rounded-xl bg-primary-500 py-2 text-[13px] font-semibold text-white press active:bg-primary-600"
                >
                  保存
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {quickPresets.map((preset) => {
              const cat = categories.find((c) => c.id === preset.categoryId);
              return (
                <div key={preset.id} className="relative shrink-0">
                  {presetMode === 'edit' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void deletePreset(preset.id, preset.title);
                      }}
                      className="absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-neutral-400 text-white"
                      aria-label="删除"
                    >
                      <IconClose size={10} className="stroke-white" strokeWidth={2.5} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (presetMode === 'edit') {
                        setDraftPreset({ ...preset });
                      } else {
                        void startPreset(preset);
                      }
                    }}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] press ${
                      presetMode === 'edit'
                        ? 'border border-dashed border-primary-300 bg-white text-neutral-600'
                        : 'border border-primary-100 bg-white text-neutral-700'
                    }`}
                    style={{ minHeight: 34 }}
                  >
                    {cat?.color && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                    <span>{preset.title}</span>
                  </button>
                </div>
              );
            })}
            <button
              onClick={() => openPresetDraft()}
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-dashed border-primary-300 text-[18px] text-primary-500 press active:bg-primary-50"
              aria-label="添加快捷计时"
            >
              +
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body,
  );
}

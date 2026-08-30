import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDataStore, randomCategoryColor, CATEGORY_COLORS } from '../store/dataStore';
import { useUIStore } from '../store/uiStore';
import type { Category, DrawerFilter } from '../types';
import { dayDiff, startOfDay } from '../lib/date';
import { IconCheck, IconChecklist, IconGrid, IconInbox, IconPlus, IconSun } from './Icons';
import SettingsSheet from './SettingsSheet';
import { downloadBackup, parseBackupFile, restoreBackup, type BackupData } from '../lib/backup';

/* ---------- 我的清单：左滑操作 + 长按拖拽排序 ---------- */
const ROW_H = 52;
const SWIPE_WIDTH = 116;
const LONG_PRESS_MS = 320;

function CategoryRow({
  cat,
  active,
  count,
  draggingId,
  dragOffsetY,
  onSelect,
  onEdit,
  onGripLongPress,
}: {
  cat: Category;
  active: boolean;
  count: number;
  draggingId: string | null;
  dragOffsetY: number;
  onSelect: () => void;
  onEdit: () => void;
  onGripLongPress: (id: string, clientY: number) => void;
}) {
  const [swipe, setSwipe] = useState(0);
  const startX = useRef(0);
  const touching = useRef(false);
  const isDragging = draggingId === cat.id;

  const setSwipeSafe = (v: number) => setSwipe(v);

  // ---- 左滑（仅水平滑动，阻止冒泡到抽屉面板的关闭手势）----
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isDragging) return; // 拖拽中禁用左滑
    e.stopPropagation(); // 阻止冒泡到 Drawer aside 的左滑关闭手势
    touching.current = true;
    startX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touching.current || isDragging) return;
    e.stopPropagation();
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) {
      setSwipeSafe(Math.max(dx, -SWIPE_WIDTH));
    } else if (swipe < 0) {
      setSwipeSafe(Math.min(0, swipe + dx));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    touching.current = false;
    if (isDragging) return; // 拖拽由 document 级事件处理
    if (swipe < -SWIPE_WIDTH * 0.4) setSwipeSafe(-SWIPE_WIDTH);
    else setSwipeSafe(0);
  };

  // ---- 拖拽手柄：只上报 touchstart ----
  const handleGripTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onGripLongPress(cat.id, e.touches[0].clientY);
  };

  const removeCategory = useDataStore((s) => s.removeCategory);
  const setFilter = useUIStore((s) => s.setFilter);
  const filter = useUIStore((s) => s.filter);

  const handleDelete = async () => {
    if (confirm(`删除清单「${cat.name}」及其下所有待办？`)) {
      await removeCategory(cat.id);
      if (filter.kind === 'category' && filter.categoryId === cat.id) {
        setFilter({ kind: 'all' });
      }
    }
    setSwipeSafe(0);
  };

  // 计算 translateY：拖拽行跟随手指位移
  let ty = 0;
  if (isDragging) {
    ty = dragOffsetY;
  }

  return (
    <div
      className={`relative ${isDragging ? '' : 'overflow-hidden'}`}
      style={{ height: ROW_H, borderRadius: 12 }}
      data-category-row={cat.id}
    >
      {/* 行主体（可点击进入筛选） —— 占满整行 */}
      <button
        onClick={() => {
          if (swipe !== 0 || isDragging) return;
          onSelect();
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`absolute inset-0 flex items-center gap-3 rounded-xl px-3 pr-10 text-left press ${
          active ? 'bg-primary-100/70' : 'active:bg-primary-50'
        }`}
        style={{
          height: ROW_H,
          transform: `translateX(${swipe}px)${ty ? ` translateY(${ty}px)` : ''}`,
          transition: isDragging ? 'none' : 'transform .18s ease',
          zIndex: isDragging ? 30 : 1,
          boxShadow: isDragging ? '0 6px 16px rgba(74,110,84,0.22)' : 'none',
          opacity: isDragging ? 0.96 : 1,
          // 拖拽中让本行不接收指针事件，使 elementFromPoint 能命中下方目标行
          pointerEvents: isDragging ? 'none' : 'auto',
        }}
      >
        <span
          className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary-400 transition-opacity ${
            active ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <span className={active ? 'text-primary-700' : 'text-primary-400'}>
          <span className="text-[17px] leading-none">{cat.icon}</span>
        </span>
        <span
          className={`flex-1 truncate text-[15px] ${
            active ? 'font-bold text-primary-700' : 'text-neutral-600'
          }`}
        >
          {cat.name}
        </span>
        <span className={`text-[12px] tabular-nums ${active ? 'text-primary-600' : 'text-neutral-400'}`}>
          {count || ''}
        </span>
        {cat.color && (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
        )}
      </button>

      {/* 拖拽手柄 —— 同级绝对定位（避免 button 嵌套导致 iOS 触摸失效），长按触发排序 */}
      <div
        onTouchStart={handleGripTouchStart}
        role="button"
        aria-label="长按拖拽排序"
        className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md p-1 select-none"
        style={{ width: 30, height: 30, minHeight: 30, zIndex: 20, color: isDragging ? '#3E7A4E' : '#C8D5CA', touchAction: 'none', pointerEvents: isDragging ? 'none' : 'auto' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="2" /><circle cx="15" cy="6" r="2" />
          <circle cx="9" cy="12" r="2" /><circle cx="15" cy="12" r="2" />
          <circle cx="9" cy="18" r="2" /><circle cx="15" cy="18" r="2" />
        </svg>
      </div>

      {/* 左滑操作区 */}
      {swipe < -1 && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center gap-1.5 pr-10"
          style={{
            width: SWIPE_WIDTH,
            transform: `translateX(${Math.max(0, swipe + SWIPE_WIDTH)}px)`,
            pointerEvents: swipe > -SWIPE_WIDTH * 0.6 ? 'none' : 'auto',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="flex h-8 items-center justify-center rounded-lg bg-primary-100 px-2 text-[12px] font-medium text-primary-700"
          >
            编辑
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            className="flex h-8 items-center justify-center rounded-lg bg-red-50 px-2 text-[12px] font-medium text-red-500"
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}

function CategoryList({
  categories,
  getCount,
  isActive,
  onSelect,
}: {
  categories: Category[];
  getCount: (id: string) => number;
  isActive: (id: string) => boolean;
  onSelect: (id: string) => void;
}) {
  const reorder = useDataStore((s) => s.reorderCategories);
  const [order, setOrder] = useState<string[]>(() => categories.map((c) => c.id));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  const orderRef = useRef(order);
  orderRef.current = order;

  // 拖拽相关 ref
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartYRef = useRef(0);
  const dragLastYRef = useRef(0);
  const dragAccumRef = useRef(0);
  // document 级事件处理器引用（用于 cleanup）
  const docMoveRef = useRef<((e: TouchEvent) => void) | null>(null);
  const docEndRef = useRef<(() => void) | null>(null);

  // 基础顺序映射（必须按 sortOrder 排序，否则拖拽持久化后顺序不刷新）
  useEffect(() => {
    if (draggingId) return;
    const sorted = [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    setOrder(sorted.map((c) => c.id));
  }, [categories, draggingId]);

  // 清理：组件卸载时移除 document 监听器（防止内存泄漏）
  useEffect(() => {
    return () => {
      if (docMoveRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        document.removeEventListener('touchmove', docMoveRef.current, { passive: false } as any);
        docMoveRef.current = null;
      }
      if (docEndRef.current) {
        document.removeEventListener('touchend', docEndRef.current);
        document.removeEventListener('touchcancel', docEndRef.current);
        docEndRef.current = null;
      }
      if (pressTimer.current) {
        clearTimeout(pressTimer.current);
        pressTimer.current = null;
      }
    };
  }, []);

  /**
   * 拖拽排序 —— 第7次重写
   * 方案：document 级 touchmove + elementFromPoint 检测手指下方的目标行
   * 不再用累积距离+阈值计算，改为直接检测"手指在哪一行上方"
   */
  const onGripLongPress = useCallback((_id: string, _startY: number) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);

    pressTimer.current = setTimeout(() => {
      // 进入拖拽模式
      setDraggingId(_id);
      setDragOffsetY(0);
      if (navigator.vibrate) navigator.vibrate(15);

      // 记录拖拽项的初始 Y（用于计算视觉偏移）
      dragStartYRef.current = _startY;
      dragLastYRef.current = _startY;
      dragAccumRef.current = 0;

      // ===== document 级 touchmove：用 elementFromPoint 找目标行 =====
      const onDocMove = (e: TouchEvent) => {
        e.preventDefault(); // 阻止 iOS 滚动
        if (!e.touches || !e.touches[0]) return;

        const y = e.touches[0].clientY;
        const dy = y - dragLastYRef.current;
        dragLastYRef.current = y;
        dragAccumRef.current += dy;

        // 更新视觉偏移（让拖拽行跟随手指）
        setDragOffsetY(dragAccumRef.current);

        // 用 elementFromPoint 检测手指当前在哪个行的上方
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const targetEl = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY) as any;
        if (!targetEl) return;

        // 向上查找最近的 [data-category-row] 元素
        const rowEl = targetEl.closest('[data-category-row]');
        if (!rowEl) return;

        const targetId = rowEl.getAttribute('data-category-row');
        if (!targetId || targetId === _id) return; // 不在自己身上

        // 在 order 数组中移动 _id 到 targetId 的位置
        setOrder((prev) => {
          const next = [...prev];
          const fromIdx = next.indexOf(_id);
          const toIdx = next.indexOf(targetId);
          if (fromIdx < 0 || toIdx < 0) return prev;

          // 移动到新位置
          const [item] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, item);
          orderRef.current = next;
          return next;
        });
      };

      // ===== document 级 touchend：清理 + 持久化 =====
      const onDocEnd = () => {
        // 移除监听器
        document.removeEventListener('touchmove', onDocMove);
        document.removeEventListener('touchend', onDocEnd);
        document.removeEventListener('touchcancel', onDocEnd);
        docMoveRef.current = null;
        docEndRef.current = null;

        // 持久化排序到 IndexedDB
        const updates = orderRef.current.map((id, i) => ({ id, sortOrder: i }));
        reorder(updates);

        // 退出拖拽模式
        setDraggingId(null);
        setDragOffsetY(0);
        dragAccumRef.current = 0;
        if (pressTimer.current) {
          clearTimeout(pressTimer.current);
          pressTimer.current = null;
        }
      };

      // 注册监听器（passive: false 是 preventDefault 生效的前提）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      document.addEventListener('touchmove', onDocMove, { passive: false } as any);
      document.addEventListener('touchend', onDocEnd);
      document.addEventListener('touchcancel', onDocEnd);
      docMoveRef.current = onDocMove;
      docEndRef.current = onDocEnd;
    }, LONG_PRESS_MS);
  }, [reorder]);

  return (
    <>
      <div>
        {order.map((id) => {
          const cat = categories.find((c) => c.id === id);
          if (!cat) return null;
          return (
            <CategoryRow
              key={id}
              cat={cat}
              active={isActive(id)}
              count={getCount(id)}
              draggingId={draggingId}
              dragOffsetY={draggingId === id ? dragOffsetY : 0}
              onSelect={() => onSelect(id)}
              onEdit={() => setEditingCat(cat)}
              onGripLongPress={onGripLongPress}
            />
          );
        })}
      </div>

      {editingCat && (
        <CategoryEditSheet category={editingCat} onClose={() => setEditingCat(null)} />
      )}
    </>
  );
}

/* ---------- 编辑清单（改名+图标+颜色+分组）---------- */
function CategoryEditSheet({
  category,
  onClose,
}: {
  category: { id: string; name: string; icon: string; color?: string };
  onClose: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon);
  const [color, setColor] = useState(category.color ?? '#6BAA7A');

  const updateCategory = useDataStore((s) => s.updateCategory);

  // 分组管理已收敛到清单/看板界面（双击改名、长按拖拽排序、删除按钮），
  // 此处不再重复提供，避免重复区块与「点不动的排序箭头」造成的困惑。
  const save = async () => {
    if (!name.trim()) return;
    await updateCategory(category.id, { name: name.trim(), icon, color });
    onClose();
  };

  // 抽屉 aside 带 backdrop-filter，会成为 fixed 的包含块 → 必须 Portal 到 body
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div
        className="absolute inset-0 anim-fade"
        style={{ backgroundColor: 'rgba(62, 122, 78, 0.4)' }}
        onClick={onClose}
      />
      <div
        className="anim-sheet relative flex w-full max-w-lg flex-col rounded-t-3xl shadow-xl"
        style={{
          background: 'rgba(255,255,255,0.96)',
          WebkitBackdropFilter: 'blur(20px)',
          backdropFilter: 'blur(20px)',
          maxHeight: 'calc(100dvh - 60px)',
        }}
      >
        <h3 className="shrink-0 px-5 pb-3 pt-5 text-[17px] font-bold text-primary-700">编辑清单</h3>

        <div className="scroll-y min-h-0 flex-1 px-5">
          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] text-neutral-400">名称</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-[15px] outline-none placeholder:text-neutral-400 focus:border-primary-400"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] text-neutral-400">图标</label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              maxLength={4}
              className="w-full rounded-xl border border-primary-200 bg-white px-3 py-2.5 text-[15px] outline-none placeholder:text-neutral-400 focus:border-primary-400"
            />
          </div>

          <div className="mb-5">
            <label className="mb-2 block text-[12px] text-neutral-400">颜色</label>
            <div className="grid grid-cols-5 gap-2.5">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="relative flex items-center justify-center rounded-full"
                  style={{
                    height: 40,
                    width: 40,
                    backgroundColor: c,
                    boxShadow: color === c ? '0 0 0 2.5px #fff, 0 0 0 5px #6BAA7A' : 'none',
                  }}
                  aria-label={`颜色 ${c}`}
                >
                  {color === c && (
                    <IconCheck size={18} className="text-white drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          </div>

        </div>

        <div className="shrink-0 px-5 pb-safe pt-2">
          <div className="flex gap-3 pb-4">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl bg-primary-50 py-2.5 text-[14px] font-medium text-neutral-500 press"
              style={{ minHeight: 44 }}
            >
              取消
            </button>
            <button
              onClick={save}
              className="flex-1 rounded-xl bg-primary-500 py-2.5 text-[14px] font-medium text-white press active:bg-primary-600"
              style={{ minHeight: 44 }}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ---------- Drawer 主组件（支持右滑打开/左滑关闭跟手动画）---------- */
export default function Drawer() {
  const open = useUIStore((s) => s.drawerOpen);
  const offset = useUIStore((s) => s.drawerOffset);
  const setOpen = useUIStore((s) => s.setDrawerOpen);
  const setOffset = useUIStore((s) => s.setDrawerOffset);
  const filter = useUIStore((s) => s.filter);
  const setFilter = useUIStore((s) => s.setFilter);

  const categories = useDataStore((s) => s.categories);
  const todos = useDataStore((s) => s.todos);
  const addCategory = useDataStore((s) => s.addCategory);

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('🍵');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 备份：导入流程的本地状态
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<BackupData | null>(null);
  const [importError, setImportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选同一文件
    if (!file) return;
    setImportError('');
    try {
      const data = await parseBackupFile(file);
      setPendingImport(data);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败');
    }
  };

  const confirmImport = async () => {
    if (!pendingImport) return;
    setImportBusy(true);
    try {
      await restoreBackup(pendingImport);
      setPendingImport(null);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '恢复失败');
    } finally {
      setImportBusy(false);
    }
  };

  // 拖拽手势 ref
  const dragRef = useRef<{ startX: number; openAtStart: boolean } | null>(null);

  const counts = useMemo(() => {
    const today = startOfDay(new Date());
    const active = todos.filter((t) => !t.isCompleted);
    const byCat = new Map<string, number>();
    for (const t of active) byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + 1);
    return {
      all: active.length,
      today: active.filter((t) => t.dueDate && dayDiff(t.dueDate, today) <= 0).length,
      inbox: active.filter((t) => !t.categoryId || t.categoryId === '').length,
      next7: active.filter((t) => {
        if (!t.dueDate) return false;
        const d = dayDiff(t.dueDate, today);
        return d >= 0 && d <= 7;
      }).length,
      completed: todos.filter((t) => t.isCompleted).length,
      byCat,
    };
  }, [todos]);

  // 抽屉面板的 transform：open 时从 offset 偏移，closed 时从 -width+offset 偏移
  const drawerTransform = () => {
    if (offset !== 0) {
      // 跟手拖拽中
      return open
        ? `translateX(${Math.max(offset, -300)}px)`
        : `translateX(${Math.min(offset, 0)}px)`;
    }
    return open ? 'translateX(0)' : 'translateX(-100%)';
  };

  // 面板触摸开始（用于左滑关闭）
  const handlePanelTouchStart = (e: React.TouchEvent) => {
    dragRef.current = { startX: e.touches[0].clientX, openAtStart: open };
  };

  const handlePanelTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const dx = e.touches[0].clientX - dragRef.current.startX;
    if (dragRef.current.openAtStart) {
      // 已打开：只允许左滑关闭
      if (dx < 0) setOffset(dx);
    }
    // 未打开时不处理（由内容区边缘手势负责打开）
  };

  const handlePanelTouchEnd = () => {
    if (!dragRef.current) return;
    const { openAtStart } = dragRef.current;
    dragRef.current = null;

    if (openAtStart && offset !== 0) {
      // 左滑超过阈值 → 关闭；否则弹回
      if (offset < -80) {
        setOpen(false);
      }
      setOffset(0);
    }
  };

  // 背景点击关闭（带偏移归零）
  const handleClose = () => {
    setOffset(0);
    setOpen(false);
  };

  // 始终渲染（CSS transform 控制显隐，支持跟手动画）
  const visible = open || offset < 0;

  const smart: { f: DrawerFilter; label: string; Icon: typeof IconInbox; count: number }[] = [
    { f: { kind: 'all' }, label: '全部待办', Icon: IconGrid, count: counts.all },
    { f: { kind: 'today' }, label: '今天', Icon: IconSun, count: counts.today },
    { f: { kind: 'next7' }, label: '未来 7 天', Icon: IconChecklist, count: counts.next7 },
    { f: { kind: 'inbox' }, label: 'Inbox', Icon: IconInbox, count: counts.inbox },
  ];

  const isActive = (f: DrawerFilter) =>
    f.kind === filter.kind &&
    (f.kind !== 'category' ||
      (filter.kind === 'category' && f.categoryId === filter.categoryId));

  const submitCategory = async () => {
    if (!newName.trim()) return;
    await addCategory(newName, newIcon, randomCategoryColor());
    setNewName('');
    setNewIcon('🍵');
    setAdding(false);
  };

  return (
    <div className={`fixed inset-0 z-40 ${visible ? '' : 'pointer-events-none'}`}>
      {/* 遮罩：仅在打开或拖拽中显示 */}
      {(open || offset > -300) && (
        <div
          className="absolute inset-0 anim-fade"
          style={{
            backgroundColor: open ? 'rgba(62, 122, 78, 0.4)' : 'rgba(62, 122, 78, 0)',
            transition: offset === 0 ? 'background-color 0.25s ease' : 'none',
            opacity: open ? 1 : 0,
          }}
          onClick={handleClose}
        />
      )}

      {/* 抽屉面板 */}
      <aside
        className="absolute inset-y-0 left-0 flex w-[80%] max-w-[300px] flex-col shadow-drawer"
        style={{
          background: 'rgba(255,255,255,0.85)',
          WebkitBackdropFilter: 'blur(20px)',
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid #E6F2E8',
          transform: drawerTransform(),
          transition: offset === 0 ? 'transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none',
          visibility: visible ? 'visible' : 'hidden',
        }}
        onTouchStart={handlePanelTouchStart}
        onTouchMove={handlePanelTouchMove}
        onTouchEnd={handlePanelTouchEnd}
      >
        <div className="pt-safe">
          <div className="flex items-start justify-between px-5 pb-3 pt-4">
            <div>
              <div className="text-[22px] font-bold leading-tight text-primary-700">行时录</div>
              <div className="mt-0.5 text-[12px] text-neutral-400">
                {counts.all} 项进行中 · {counts.completed} 项已完成
              </div>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="hit -mr-2 mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl text-primary-500 press active:bg-primary-50"
              aria-label="外观设置"
            >
              <span className="text-[19px] leading-none">⚙️</span>
            </button>
          </div>
        </div>

        <div className="scroll-y no-scrollbar flex-1 pb-6">
          <div className="px-3">
            {smart.map(({ f, label, Icon, count }) => (
              <div key={label} className="group relative mb-0.5">
                <button
                  onClick={() => setFilter(f)}
                  className={`relative flex w-full items-center gap-3 rounded-xl px-3 text-left press ${
                    isActive(f) ? 'bg-primary-100/70' : 'active:bg-primary-50'
                  }`}
                  style={{ minHeight: 44 }}
                >
                  <span
                    className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary-400 transition-opacity ${
                      isActive(f) ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <span className={isActive(f) ? 'text-primary-700' : 'text-primary-400'}>
                    <Icon size={19} />
                  </span>
                  <span
                    className={`flex-1 truncate text-[15px] ${
                      isActive(f) ? 'font-bold text-primary-700' : 'text-neutral-600'
                    }`}
                  >
                    {label}
                  </span>
                  <span className={`text-[12px] tabular-nums ${isActive(f) ? 'text-primary-600' : 'text-neutral-400'}`}>
                    {count || ''}
                  </span>
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between px-5 pb-1">
            <span className="text-[12px] font-semibold tracking-wide text-neutral-400">我的清单</span>
            <button
              className="hit -mr-2 text-primary-500"
              onClick={() => setAdding((v) => !v)}
              aria-label="新建清单"
            >
              <IconPlus size={18} />
            </button>
          </div>

          {adding && (
            <div className="mx-3 mb-2 flex items-center gap-2 rounded-2xl bg-primary-50 p-3 anim-pop">
              <input
                autoFocus
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                placeholder="图标"
                className="w-14 shrink-0 rounded-lg border border-primary-200 bg-white px-1.5 py-1.5 text-center text-[18px] outline-none placeholder:text-[11px] placeholder:text-neutral-400 focus:border-primary-400"
                maxLength={4}
              />
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitCategory()}
                placeholder="清单名称"
                className="min-w-0 flex-1 rounded-xl border border-primary-200 bg-white px-3 py-2 text-[14px] outline-none placeholder:text-neutral-400 focus:border-primary-400"
              />
              <button
                onClick={submitCategory}
                className="shrink-0 rounded-xl bg-primary-500 px-3 text-[14px] font-medium text-white press active:bg-primary-600"
                style={{ minHeight: 40 }}
              >
                添加
              </button>
            </div>
          )}

          <div className="px-3">
            <CategoryList
              categories={categories}
              getCount={(id) => counts.byCat.get(id) ?? 0}
              isActive={(id) => isActive({ kind: 'category', categoryId: id })}
              onSelect={(id) => setFilter({ kind: 'category', categoryId: id })}
            />
          </div>

          {/* 已完成 —— 独立栏，放在自定义清单下方 */}
          <div className="mt-4 px-3">
            <div className="group relative mb-0.5">
              <button
                onClick={() => setFilter({ kind: 'completed' })}
                className={`relative flex w-full items-center gap-3 rounded-xl px-3 text-left press ${
                  isActive({ kind: 'completed' }) ? 'bg-primary-100/70' : 'active:bg-primary-50'
                }`}
                style={{ minHeight: 44 }}
              >
                <span
                  className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary-400 transition-opacity ${
                    isActive({ kind: 'completed' }) ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                <span className={isActive({ kind: 'completed' }) ? 'text-primary-700' : 'text-primary-400'}>
                  <IconCheck size={19} />
                </span>
                <span
                  className={`flex-1 truncate text-[15px] ${
                    isActive({ kind: 'completed' }) ? 'font-bold text-primary-700' : 'text-neutral-600'
                  }`}
                >
                  已完成
                </span>
                <span className={`text-[12px] tabular-nums ${isActive({ kind: 'completed' }) ? 'text-primary-600' : 'text-neutral-400'}`}>
                  {counts.completed || ''}
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-primary-100 px-5 py-3 pb-safe">
          <div className="mb-2.5 grid grid-cols-2 gap-2.5">
            <button
              onClick={downloadBackup}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-primary-200 bg-white py-2.5 text-[13px] font-medium text-primary-700 press active:bg-primary-50"
            >
              <span className="text-[15px]">⬇️</span> 导出备份
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-primary-200 bg-white py-2.5 text-[13px] font-medium text-primary-700 press active:bg-primary-50"
            >
              <span className="text-[15px]">⬆️</span> 导入备份
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onPickFile}
          />
          {importError && (
            <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600">
              {importError}
            </div>
          )}
          <div className="text-[11px] text-neutral-400">数据保存在本机 IndexedDB · 离线可用</div>
        </div>

        {/* 导入确认弹层 */}
        {pendingImport && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center">
            <div
              className="absolute inset-0 anim-fade"
              style={{ backgroundColor: 'rgba(30, 43, 60, 0.45)' }}
              onClick={() => setPendingImport(null)}
            />
            <div className="absolute inset-x-0 bottom-0 anim-sheet rounded-t-2xl bg-white px-5 pb-8 pt-4">
              <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-primary-200" />
              <div className="mb-1 text-center text-[16px] font-bold text-neutral-700">导入备份？</div>
              <p className="mb-4 text-center text-[12.5px] leading-relaxed text-neutral-500">
                将用备份文件<strong className="text-neutral-700">覆盖当前全部数据</strong>（清单、任务、计时记录）。建议先导出当前备份。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingImport(null)}
                  className="flex-1 rounded-xl border border-primary-200 bg-white py-3 text-[14px] font-medium text-neutral-500 press active:bg-primary-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmImport}
                  disabled={importBusy}
                  className="flex-1 rounded-xl bg-primary-500 py-3 text-[14px] font-medium text-white press active:bg-primary-600 disabled:opacity-60"
                >
                  {importBusy ? '恢复中…' : '确定导入'}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

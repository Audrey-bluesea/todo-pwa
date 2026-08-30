import { Fragment, useEffect, useRef, useState } from 'react';
import { IconClose } from './Icons';

export interface SectionTabItem {
  /** 真实 section id（非 'sec-' 前缀）；未分组项用 '__unsec__' */
  id: string;
  label: string;
  count: number;
  /** 是否可编辑/拖拽（未分组为 false） */
  editable: boolean;
}

interface Props {
  /** 可编辑的真实分组（已按 sortOrder 排好序） */
  sections: SectionTabItem[];
  /** 末尾的「未分组」占位（不参与拖拽/编辑），无则传 null */
  unsectioned?: { label: string; count: number } | null;
  /** 当前激活 tab 的完整 id（'sec-<id>' 或 'sec-none'） */
  activeId: string | null;
  onSelect: (fullId: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** 拖拽落定后的真实 section id 新顺序 */
  onReorder: (orderedIds: string[]) => void;
  /** 当前长按拖拽任务时，手指悬停的目标分组 id（用于高亮），null 表示无 */
  dropTargetId?: string | null;
}

const FULL = (id: string) => (id === '__unsec__' ? 'sec-none' : `sec-${id}`);

/**
 * 看板-按分组模式下的分组标签栏：
 * - 点击 → 切换当前分组
 * - 双击 → 内联重命名
 * - 长按 → 进入拖拽排序，松手落定（落点以竖线提示）
 *
 * 为了同时保留「横向滑动滚动标签栏」：
 *  1. pill 默认 touch-action:auto，让短促横滑交给浏览器去滚标签栏；
 *  2. 只有长按 380ms 后才进入拖拽模式，之后 preventDefault 阻止滚动，改由 JS 平移 pill。
 */
export default function SectionTabBar({
  sections,
  unsectioned,
  activeId,
  onSelect,
  onRename,
  onDelete,
  onReorder,
  dropTargetId,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragX, setDragX] = useState(0);
  const [overIdx, setOverIdx] = useState(-1);

  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const rectsRef = useRef<{ id: string; centerX: number }[]>([]);
  const press = useRef<{
    id: string;
    startX: number;
    startY: number;
    longTimer: number | null;
    moved: boolean;
    dragging: boolean;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 用 ref 镜像 dragId / overIdx：window 监听器在 onPointerDown 时挂载，闭包会捕获到旧值，
  // 若直接读 state 则 finishDrag 永远拿不到最新的 dragId / overIdx（导致排序失效）。
  const dragIdRef = useRef<string | null>(null);
  const overIdxRef = useRef(-1);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  useEffect(
    () => () => {
      if (press.current?.longTimer) window.clearTimeout(press.current.longTimer);
      window.removeEventListener('pointermove', handleWindowMove);
      window.removeEventListener('pointerup', handleWindowUp);
      window.removeEventListener('pointercancel', handleWindowUp);
    },
    [],
  );

  const startDrag = (id: string) => {
    dragIdRef.current = id;
    setDragId(id);
    rectsRef.current = sections.map((s) => {
      const el = itemRefs.current.get(s.id);
      const r = el ? el.getBoundingClientRect() : { left: 0, width: 0 };
      return { id: s.id, centerX: r.left + r.width / 2 };
    });
  };

  const finishDrag = () => {
    const dragId = dragIdRef.current;
    const overIdx = overIdxRef.current;
    if (dragId) {
      const order = sections.map((s) => s.id);
      const from = order.indexOf(dragId);
      if (from !== -1) {
        order.splice(from, 1);
        let insertAt = overIdx === -1 ? order.length : overIdx;
        insertAt = Math.max(0, Math.min(insertAt, order.length));
        order.splice(insertAt, 0, dragId);
        onReorder(order);
      }
    }
    cleanupDrag();
  };

  const cleanupDrag = () => {
    if (press.current?.longTimer) {
      window.clearTimeout(press.current.longTimer);
      press.current.longTimer = null;
    }
    dragIdRef.current = null;
    overIdxRef.current = -1;
    setDragId(null);
    setDragX(0);
    setOverIdx(-1);
    press.current = null;
  };

  const handleWindowMove = (e: PointerEvent) => {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;

    if (!p.dragging) {
      if (!p.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        p.moved = true;
        // 用户提前滑动 → 把动作交还给浏览器（横向滚动标签栏）
        if (p.longTimer) {
          window.clearTimeout(p.longTimer);
          p.longTimer = null;
        }
      }
      return;
    }

    // 拖拽模式下阻止浏览器滚动，改由 JS 移动 pill
    e.preventDefault();
    setDragX(dx);
    const px = e.clientX;
    let over = rectsRef.current.length;
    for (let i = 0; i < rectsRef.current.length; i++) {
      if (px < rectsRef.current[i].centerX) {
        over = i;
        break;
      }
    }
    const dragVisualIdx = sections.findIndex((s) => s.id === dragIdRef.current);
    if (dragVisualIdx !== -1 && over > dragVisualIdx) over -= 1;
    overIdxRef.current = over;
    setOverIdx(over);
  };

  const handleWindowUp = () => {
    const p = press.current;
    if (!p) return;
    if (p.dragging) {
      finishDrag();
      return;
    }
    if (p.longTimer) {
      window.clearTimeout(p.longTimer);
      p.longTimer = null;
    }
    if (!p.moved) onSelect(FULL(p.id));
    cleanupDrag();
  };

  const onPointerDown = (e: React.PointerEvent, it: SectionTabItem) => {
    if (editingId || !it.editable) return;
    press.current = {
      id: it.id,
      startX: e.clientX,
      startY: e.clientY,
      longTimer: null,
      moved: false,
      dragging: false,
    };

    window.addEventListener('pointermove', handleWindowMove);
    window.addEventListener('pointerup', handleWindowUp, { once: true });
    window.addEventListener('pointercancel', handleWindowUp, { once: true });

    const t = window.setTimeout(() => {
      if (press.current && press.current.id === it.id && !press.current.moved && !press.current.dragging) {
        press.current.dragging = true;
        if ('vibrate' in navigator) navigator.vibrate(12);
        startDrag(it.id);
      }
    }, 380);
    press.current.longTimer = t;
  };

  const commitRename = () => {
    const id = editingId;
    const name = editValue.trim();
    setEditingId(null);
    if (id && name) onRename(id, name);
  };

  const cancelRename = () => setEditingId(null);

  const handleDelete = (id: string) => {
    setEditingId(null);
    if (window.confirm('删除该分组？分组内的任务会移到「未分组」。')) onDelete(id);
  };

  const renderPill = (it: SectionTabItem, isActive: boolean, isDragging: boolean) => {
    const dropId = it.id === '__unsec__' ? 'none' : it.id;
    const isDrop = dropTargetId != null && dropTargetId === dropId;
    return (
      <button
        key={it.id}
        ref={(el) => {
          if (el) itemRefs.current.set(it.id, el);
          else itemRefs.current.delete(it.id);
        }}
        data-section-id={dropId}
        onPointerDown={(e) => onPointerDown(e, it)}
        onDoubleClick={() => {
          if (it.editable && !editingId) {
            setEditingId(it.id);
            setEditValue(sections.find((s) => s.id === it.id)?.label ?? '');
          }
        }}
        className={`relative shrink-0 rounded-full border-2 px-4 py-1.5 text-[13px] font-medium transition-colors press ${
          isDrop
            ? 'border-primary-500 bg-primary-500 text-white ring-2 ring-primary-300'
            : isActive
              ? 'border-primary-400 bg-primary-200 text-primary-700'
              : 'border-transparent bg-neutral-100 text-neutral-500'
        }`}
        style={{
          transform: isDragging ? `translateX(${dragX}px) scale(1.05)` : undefined,
          transition: isDragging ? 'none' : undefined,
          zIndex: isDragging ? 50 : undefined,
          boxShadow: isDragging ? '0 8px 20px rgba(80,120,90,0.3)' : undefined,
          opacity: isDragging ? 0.98 : 1,
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      >
        {editingId === it.id ? (
          <span className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelRename();
                }
              }}
              onBlur={commitRename}
              className="w-16 bg-transparent text-center text-[13px] font-medium text-primary-700 outline-none"
            />
            <span
              role="button"
              aria-label="删除分组"
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(it.id);
              }}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-neutral-300 text-white active:bg-red-400"
            >
              <IconClose size={11} />
            </span>
          </span>
        ) : (
          <>
            {it.label}
            <span
              className={`ml-1 text-[11px] tabular-nums ${isActive ? 'text-primary-600' : 'text-neutral-400'}`}
            >
              {it.count}
            </span>
          </>
        )}
      </button>
    );
  };

  return (
    <div
      className={`flex items-center gap-2 no-scrollbar ${dragId ? 'overflow-x-hidden' : 'overflow-x-auto'}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {sections.map((s, i) => (
        <Fragment key={s.id}>
          {dragId && overIdx === i && <div className="mx-0.5 w-[3px] self-stretch rounded bg-primary-500" />}
          {renderPill(s, FULL(s.id) === activeId, dragId === s.id)}
        </Fragment>
      ))}
      {dragId && overIdx === sections.length && <div className="mx-0.5 w-[3px] self-stretch rounded bg-primary-500" />}
      {unsectioned &&
        renderPill(
          { id: '__unsec__', label: unsectioned.label, count: unsectioned.count, editable: false },
          activeId === 'sec-none',
          false,
        )}
    </div>
  );
}

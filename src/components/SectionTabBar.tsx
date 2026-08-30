import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
const GAP = 8; // 与 className 中的 gap-2 对应（0.5rem）
const BODY_CLASS = 'section-reordering';

/**
 * 看板-按分组模式下的分组标签栏：
 * - 点击 → 切换当前分组
 * - 双击 → 内联重命名
 * - 长按 → 进入拖拽排序（实时让位式：其余 pill 跟随手指方向被挤开、留出空位，松手嵌入）
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
  const [dragY, setDragY] = useState(0);
  const [originRect, setOriginRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const [dragW, setDragW] = useState(0);
  // 拖拽时，被拖动项在「其余项数组」中的插入位置（落点）；-1 表示尚未进入拖拽
  const [ins, setIns] = useState(-1);

  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const press = useRef<{
    id: string;
    startX: number;
    startY: number;
    longTimer: number | null;
    moved: boolean;
    dragging: boolean;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // ref 镜像，供 window 监听器读取最新值（避免闭包捕获旧 state）
  const dragIdRef = useRef<string | null>(null);
  const insRef = useRef(-1);
  const scrollRafRef = useRef<number | null>(null);
  const pointerXRef = useRef<number | null>(null);

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
      document.body.classList.remove(BODY_CLASS);
    },
    [],
  );

  // 当前激活分组若靠近可视区边缘（含被切掉一部分），选中后自动滚入中间，露出其前后的分组
  useEffect(() => {
    if (!activeId) return;
    const id = activeId === 'sec-none' ? '__unsec__' : activeId.replace('sec-', '');
    const el = itemRefs.current.get(id);
    const container = containerRef.current;
    if (!el || !container) return;
    const cr = container.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const edge = 24; // 距边缘 24px 内即视为「靠边」，需要滚出来
    // 在边缘（被切到或贴近边缘）时才滚动；整排能放下时不滚
    if (er.right > cr.right - edge || er.left < cr.left + edge) {
      el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
  }, [activeId]);

  const startDrag = (id: string) => {
    const el = itemRefs.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragIdRef.current = id;
    setDragId(id);
    setOriginRect({ left: r.left, top: r.top, width: r.width });
    setDragW(r.width + GAP);
    const originIdx = sections.findIndex((s) => s.id === id);
    insRef.current = originIdx; // 起始时插回原处 → 不产生位移
    setIns(originIdx);
    // 分组多时容器会 overflow-x-auto；进入拖拽后必须立即禁用浏览器原生滚动，
    // 否则 iOS Safari 会把手指移动解释为「滚标签栏」而不是拖拽。
    if (containerRef.current) containerRef.current.style.touchAction = 'none';
  };

  const finishDrag = () => {
    const dragId = dragIdRef.current;
    if (dragId) {
      const rem = sections.filter((s) => s.id !== dragId);
      let at = insRef.current;
      at = Math.max(0, Math.min(at < 0 ? rem.length : at, rem.length));
      const order = [...rem.slice(0, at).map((s) => s.id), dragId, ...rem.slice(at).map((s) => s.id)];
      onReorder(order);
    }
    cleanupDrag();
  };

  const cleanupDrag = () => {
    if (press.current?.longTimer) {
      window.clearTimeout(press.current.longTimer);
      press.current.longTimer = null;
    }
    document.body.classList.remove(BODY_CLASS);
    if (containerRef.current) containerRef.current.style.touchAction = '';
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    pointerXRef.current = null;
    dragIdRef.current = null;
    insRef.current = -1;
    setDragId(null);
    setDragX(0);
    setDragY(0);
    setOriginRect(null);
    setDragW(0);
    setIns(-1);
    press.current = null;
  };

  const tickAutoScroll = () => {
    const container = containerRef.current;
    const x = pointerXRef.current;
    if (!container || !dragIdRef.current || x == null) {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      return;
    }
    const cr = container.getBoundingClientRect();
    const threshold = 48; // 距离边缘多远开始自动滚
    const distLeft = x - cr.left;
    const distRight = cr.right - x;
    if (distLeft < threshold) {
      container.scrollLeft -= Math.max(2, (threshold - distLeft) * 0.25);
    } else if (distRight < threshold) {
      container.scrollLeft += Math.max(2, (threshold - distRight) * 0.25);
    }
    scrollRafRef.current = requestAnimationFrame(tickAutoScroll);
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

    // 拖拽模式下阻止浏览器滚动，由 JS 控制 pill 让位 + 边缘自动滚动
    e.preventDefault();
    setDragX(dx);
    setDragY(dy);
    pointerXRef.current = e.clientX;
    if (!scrollRafRef.current) {
      scrollRafRef.current = requestAnimationFrame(tickAutoScroll);
    }

    const dragId = dragIdRef.current;
    if (!dragId) return;
    const rem = sections.filter((s) => s.id !== dragId);
    // 用其余 pill 的实时位置判断落点（已含让位产生的位移，手指跟手更准确）
    let at = rem.length;
    for (let i = 0; i < rem.length; i++) {
      const el = itemRefs.current.get(rem[i].id);
      if (!el) continue;
      const c = el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2;
      if (e.clientX < c) {
        at = i;
        break;
      }
    }
    insRef.current = at;
    setIns(at);
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

    // 按下瞬间即全局禁止选中，阻止 iOS 长按选中附近任务卡片文字
    document.body.classList.add(BODY_CLASS);

    // 捕获指针，防止手指滑出 pill 或被浏览器滚动打断
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

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

  // 计算某个 pill（基础索引 baseIdx）在拖拽时的水平位移
  const shiftFor = (baseIdx: number): number => {
    if (!dragId || ins < 0) return 0;
    const originIdx = sections.findIndex((s) => s.id === dragId);
    if (baseIdx === originIdx) return 0;
    const r = baseIdx < originIdx ? baseIdx : baseIdx - 1; // 在「其余项数组」中的位置
    return r >= ins ? dragW : 0;
  };

  const renderPill = (it: SectionTabItem, isActive: boolean) => {
    const dropId = it.id === '__unsec__' ? 'none' : it.id;
    const isDrop = dropTargetId != null && dropTargetId === dropId;
    const isDragging = dragId === it.id;
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
          transform: isDragging ? undefined : `translateX(${shiftFor(sections.findIndex((s) => s.id === it.id))}px)`,
          transition: dragId && !isDragging ? 'transform .18s ease' : undefined,
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
      ref={containerRef}
      data-section-bar
      className={`flex items-center gap-2 no-scrollbar overflow-x-auto ${dragId ? 'touch-none' : ''}`}
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {sections.map((s) => (
        // 拖拽中的项从流中移除（用 portal 浮层代替），让其余 pill 自然左移补位
        dragId === s.id ? (
          <span key={s.id} className="hidden" aria-hidden />
        ) : (
          <Fragment key={s.id}>{renderPill(s, FULL(s.id) === activeId)}</Fragment>
        )
      ))}
      {unsectioned &&
        (dragId === '__unsec__' ? (
          <span key="__unsec__" className="hidden" aria-hidden />
        ) : (
          renderPill(
            { id: '__unsec__', label: unsectioned.label, count: unsectioned.count, editable: false },
            activeId === 'sec-none',
          )
        ))}

      {/* 被拖动的 pill：用 portal 浮在视口上跟随手指，避免被父级 overflow 裁剪 */}
      {dragId &&
        originRect &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[60] rounded-full border-2 border-primary-400 bg-white px-4 py-1.5 text-[13px] font-medium text-primary-700"
            style={{
              left: originRect.left,
              top: originRect.top,
              width: originRect.width,
              transform: `translate(${dragX}px, ${dragY}px) scale(1.05)`,
              boxShadow: '0 12px 26px rgba(80,120,90,0.38)',
              opacity: 0.98,
            }}
          >
            {sections.find((s) => s.id === dragId)?.label}
            <span className="ml-1 text-[11px] tabular-nums text-primary-500">
              {sections.find((s) => s.id === dragId)?.count}
            </span>
          </div>,
          document.body,
        )}
    </div>
  );
}

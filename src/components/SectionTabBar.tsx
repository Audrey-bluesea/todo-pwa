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
const LONG_PRESS = 380; // 长按触发拖拽的毫秒数
const MOVE_TOLERANCE = 6; // 超过该位移视为「滑动」而非长按
const DOUBLE_TAP = 300; // 双击改名间隔

/**
 * 看板-按分组模式下的分组标签栏：
 * - 单击 → 切换当前分组
 * - 双击 → 内联重命名
 * - 长按 → 进入拖拽排序（实时让位式：其余 pill 跟随手指方向被挤开、留出空位，松手嵌入）
 *
 * iOS 手势的关键约束：
 *  - 浏览器在 touchstart 时就决定了手势类型，事后设置 touch-action 已无效；
 *  - 一旦 iOS 进入「滚动」，touchmove 的 e.cancelable 变 false，preventDefault 再也拦不住。
 * 因此本组件：
 *  1. 容器静态 touch-action: pan-y —— 横向手势从落下起就不归浏览器，事件能完整派发；
 *  2. 横滑浏览改为 JS 1:1 跟手滚动（scrollLeft -= dx）；
 *  3. 长按进入拖拽时，touchmove 里 e.preventDefault() 真正掐断竖向滚动，纯 JS 接管让位重排；
 *  4. 桌面无触摸时回退到 Pointer 事件（桌面无滚动 cancel 问题）。
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
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // ref 镜像，供原生监听器读取最新值（避免闭包捕获旧 props）
  const dragIdRef = useRef<string | null>(null);
  const insRef = useRef(-1);
  const scrollRafRef = useRef<number | null>(null);
  const pointerXRef = useRef<number | null>(null);
  const pressRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    longTimer: number | null;
    moved: boolean;
    dragging: boolean;
    startTime: number;
  } | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const sectionsRef = useRef(sections);
  const onSelectRef = useRef(onSelect);
  const onRenameRef = useRef(onRename);
  const onDeleteRef = useRef(onDelete);
  const lastTapIdRef = useRef('');
  const lastTapTimeRef = useRef(0);

  // 同步最新 props/state 到 ref
  sectionsRef.current = sections;
  editingIdRef.current = editingId;
  onSelectRef.current = onSelect;
  onRenameRef.current = onRename;
  onDeleteRef.current = onDelete;

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

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
    const originIdx = sectionsRef.current.findIndex((s) => s.id === id);
    insRef.current = originIdx; // 起始时插回原处 → 不产生位移
    setIns(originIdx);
  };

  const finishDrag = () => {
    const dragId = dragIdRef.current;
    if (dragId) {
      const rem = sectionsRef.current.filter((s) => s.id !== dragId);
      let at = insRef.current;
      at = Math.max(0, Math.min(at < 0 ? rem.length : at, rem.length));
      const order = [...rem.slice(0, at).map((s) => s.id), dragId, ...rem.slice(at).map((s) => s.id)];
      onReorder(order);
    }
    cleanupDrag();
  };

  const cleanupDrag = () => {
    const p = pressRef.current;
    if (p?.longTimer) {
      window.clearTimeout(p.longTimer);
    }
    document.body.classList.remove(BODY_CLASS);
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
    pressRef.current = null;
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

  // —— 核心交互逻辑（触摸 / 指针通用）——
  const coreStart = (x: number, y: number, id: string) => {
    if (editingIdRef.current) return; // 编辑状态不响应拖拽/选择
    const now = Date.now();
    pressRef.current = {
      id,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      longTimer: null,
      moved: false,
      dragging: false,
      startTime: now,
    };
    // 按下瞬间即全局禁止选中，阻止 iOS 长按选中附近任务卡片文字
    document.body.classList.add(BODY_CLASS);
    pressRef.current.longTimer = window.setTimeout(() => {
      const p = pressRef.current;
      if (p && p.id === id && !p.moved && !p.dragging) {
        p.dragging = true;
        if ('vibrate' in navigator) navigator.vibrate(12);
        startDrag(id);
      }
    }, LONG_PRESS);
  };

  const coreMove = (x: number, y: number) => {
    const p = pressRef.current;
    if (!p) return;
    const dx = x - p.startX;
    const dy = y - p.startY;
    if (!p.dragging) {
      // 横滑浏览：JS 1:1 跟手滚动（pan-y 下横向手势归我们）
      const container = containerRef.current;
      if (container) {
        const movedX = x - p.lastX;
        if (movedX !== 0) container.scrollLeft -= movedX;
      }
      p.lastX = x;
      p.lastY = y;
      if (Math.abs(dx) > MOVE_TOLERANCE || Math.abs(dy) > MOVE_TOLERANCE) {
        p.moved = true;
        if (p.longTimer) {
          window.clearTimeout(p.longTimer);
          p.longTimer = null;
        }
      }
      return;
    }
    // 拖拽模式：纯 JS 接管让位重排 + 边缘自动滚动
    setDragX(dx);
    setDragY(dy);
    pointerXRef.current = x;
    if (!scrollRafRef.current) {
      scrollRafRef.current = requestAnimationFrame(tickAutoScroll);
    }
    const dragId = dragIdRef.current;
    if (!dragId) return;
    const rem = sectionsRef.current.filter((s) => s.id !== dragId);
    let at = rem.length;
    for (let i = 0; i < rem.length; i++) {
      const el = itemRefs.current.get(rem[i].id);
      if (!el) continue;
      const c = el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2;
      if (x < c) {
        at = i;
        break;
      }
    }
    insRef.current = at;
    setIns(at);
  };

  const coreEnd = () => {
    const p = pressRef.current;
    if (!p) return;
    if (p.dragging) {
      finishDrag();
      return;
    }
    if (p.longTimer) {
      window.clearTimeout(p.longTimer);
      p.longTimer = null;
    }
    if (!p.moved) {
      // 单击 → 选中；两次快速单击 → 改名
      const now = Date.now();
      if (lastTapIdRef.current === p.id && now - lastTapTimeRef.current < DOUBLE_TAP) {
        lastTapIdRef.current = '';
        lastTapTimeRef.current = 0;
        const it = sectionsRef.current.find((s) => s.id === p.id);
        if (it && it.editable) {
          setEditingId(p.id);
          setEditValue(it.label);
        }
      } else {
        lastTapIdRef.current = p.id;
        lastTapTimeRef.current = now;
        onSelectRef.current(FULL(p.id));
      }
    }
    cleanupDrag();
  };

  // —— 原生事件绑定（触摸优先，桌面回退指针）——
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isTouch = 'ontouchstart' in window || (navigator as any).maxTouchPoints > 0;

    if (isTouch) {
      const onTouchStart = (e: TouchEvent) => {
        const target = e.target as HTMLElement;
        const pill = target.closest('button[data-section-id]') as HTMLButtonElement | null;
        if (!pill || pill.dataset.sectionId === '__unsec__') {
          // 未分组项仅响应单击选中，不走长按/拖拽
          if (pill) {
            pressRef.current = {
              id: '__unsec__',
              startX: e.touches[0].clientX,
              startY: e.touches[0].clientY,
              lastX: e.touches[0].clientX,
              lastY: e.touches[0].clientY,
              longTimer: null,
              moved: false,
              dragging: false,
              startTime: Date.now(),
            };
            document.body.classList.add(BODY_CLASS);
          }
          return;
        }
        if (editingIdRef.current) return;
        coreStart(e.touches[0].clientX, e.touches[0].clientY, pill.dataset.sectionId!);
      };
      const onTouchMove = (e: TouchEvent) => {
        const p = pressRef.current;
        if (!p || p.id === '__unsec__') return;
        if (p.dragging && e.cancelable) e.preventDefault(); // 掐断竖向滚动
        coreMove(e.touches[0].clientX, e.touches[0].clientY);
      };
      const onTouchEnd = () => coreEnd();
      container.addEventListener('touchstart', onTouchStart, { passive: true });
      container.addEventListener('touchmove', onTouchMove, { passive: false });
      container.addEventListener('touchend', onTouchEnd, { passive: true });
      container.addEventListener('touchcancel', onTouchEnd, { passive: true });
      return () => {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', onTouchEnd);
        container.removeEventListener('touchcancel', onTouchEnd);
        cleanupDrag();
      };
    }

    // 桌面回退：Pointer 事件（桌面无滚动 cancel 问题，preventDefault 有效）
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const pill = target.closest('button[data-section-id]') as HTMLButtonElement | null;
      if (!pill) return;
      if (editingIdRef.current) return;
      // 未分组项不给 pointercapture 复杂化，直接走单击
      coreStart(e.clientX, e.clientY, pill.dataset.sectionId!);
    };
    const onPointerMove = (e: PointerEvent) => {
      const p = pressRef.current;
      if (!p) return;
      if (p.dragging) e.preventDefault();
      coreMove(e.clientX, e.clientY);
    };
    const onPointerUp = () => coreEnd();
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      cleanupDrag();
    };
  }, []);

  const commitRename = () => {
    const id = editingId;
    const name = editValue.trim();
    setEditingId(null);
    if (id && name) onRenameRef.current(id, name);
  };

  const cancelRename = () => setEditingId(null);

  const handleDelete = (id: string) => {
    setEditingId(null);
    if (window.confirm('删除该分组？分组内的任务会移到「未分组」。')) onDeleteRef.current(id);
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
              data-no-drag
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
      className="flex items-center gap-2 no-scrollbar overflow-x-auto touch-pan-y"
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

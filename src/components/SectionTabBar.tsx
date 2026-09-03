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
/** 长按「等待期」内，横向移动超过此值（且大于纵向）→ 判定用户想浏览，取消长按 */
const SCROLL_CANCEL = 14;
/** 超过该位移视为「已移动」，抬手时不再算单击 */
const TAP_MOVE = 8;
const DOUBLE_TAP = 300; // 双击改名间隔

/**
 * 看板-按分组模式下的分组标签栏：
 * - 单击 → 切换当前分组
 * - 双击 → 内联重命名
 * - 长按 → 进入拖拽排序（实时让位式：其余 pill 跟随手指方向被挤开、留出空位，松手嵌入）
 *
 * 交互策略（iOS/安卓 用原生 Touch，桌面回退 Pointer）：
 *
 *   iOS 的关键事实：
 *   - 容器是 overflow-x-auto；一旦 iOS 判定为「滚动」，会派发 pointercancel 并且
 *     之后 touchmove 的 cancelable 变 false —— Pointer 事件在这种容器里做长按拖拽必死。
 *   - 但只要手指「按住不动」，浏览器就还没开始滚动，此时 touchmove 仍然 cancelable，
 *     preventDefault() 才能真正掐断滚动。
 *
 *   因此：
 *   1. touchstart 时立刻挂上 touchmove 监听（passive:false），保证第一个 move 就被我们拿到；
 *   2. 手指按住不动满 LONG_PRESS → 进入拖拽；之后每个 touchmove 都 preventDefault，
 *      原生滚动被掐断，纯 JS 接管让位式重排；
 *   3. 等待期内若发生明显横滑（>SCROLL_CANCEL 且横向大于纵向）→ 判定用户想浏览，
 *      取消长按且不 preventDefault，原生顺滑横滑照常发生；
 *   4. 桌面无滚动 cancel 问题，用 Pointer 事件回退即可。
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

  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
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
    longTimer: number | null;
    moved: boolean;
    dragging: boolean;
    el: HTMLElement | null;
    pointerId: number | null;
  } | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const sectionsRef = useRef(sections);
  const onSelectRef = useRef(onSelect);
  const onRenameRef = useRef(onRename);
  const onDeleteRef = useRef(onDelete);
  const onReorderRef = useRef(onReorder);
  const lastTapIdRef = useRef('');
  const lastTapTimeRef = useRef(0);

  // 同步最新 props/state 到 ref
  sectionsRef.current = sections;
  editingIdRef.current = editingId;
  onSelectRef.current = onSelect;
  onRenameRef.current = onRename;
  onDeleteRef.current = onDelete;
  onReorderRef.current = onReorder;

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // 当前激活分组若被左右边缘切掉一部分（部分不可见），选中后自动滚入中间，露出其前后的分组。
  // 注意：仅「真被切到」时才滚；完全可见时不滚，避免点一下就无谓晃动的观感。
  useEffect(() => {
    if (!activeId) return;
    const id = activeId === 'sec-none' ? '__unsec__' : activeId.replace('sec-', '');
    const el = itemRefs.current.get(id);
    const container = containerRef.current;
    if (!el || !container) return;
    const cr = container.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    if (er.left < cr.left - 0.5 || er.right > cr.right + 0.5) {
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
    // 进入拖拽：捕获指针（桌面）；iOS 端靠 touchmove 的 preventDefault 掐断原生滚动
    const p = pressRef.current;
    if (p?.el && p.pointerId != null) {
      try {
        p.el.setPointerCapture(p.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const finishDrag = () => {
    const dragId = dragIdRef.current;
    if (dragId) {
      const rem = sectionsRef.current.filter((s) => s.id !== dragId);
      let at = insRef.current;
      at = Math.max(0, Math.min(at < 0 ? rem.length : at, rem.length));
      const order = [...rem.slice(0, at).map((s) => s.id), dragId, ...rem.slice(at).map((s) => s.id)];
      onReorderRef.current(order);
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
  const coreMove = (x: number, y: number) => {
    const p = pressRef.current;
    if (!p || !p.dragging) return;
    const dx = x - p.startX;
    const dy = y - p.startY;
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

  // —— 交互绑定 ——
  // 触摸设备：原生 Touch 事件（touchmove 用 passive:false 挂上）。
  // 桌面：Pointer 事件回退（无滚动 cancel 问题）。
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isTouch = 'ontouchstart' in window || (navigator as any).maxTouchPoints > 0;

    /** 启动长按计时：手指按住不动满 LONG_PRESS 才进入拖拽 */
    const armLongPress = (id: string) => {
      const p = pressRef.current;
      if (!p) return;
      p.longTimer = window.setTimeout(() => {
        const cur = pressRef.current;
        if (!cur || cur.id !== id || cur.dragging) return;
        const it = sectionsRef.current.find((s) => s.id === id);
        if (!it || !it.editable) return; // 未分组等不可拖拽项不进入拖拽
        cur.dragging = true;
        if ('vibrate' in navigator) navigator.vibrate(12);
        startDrag(id);
      }, LONG_PRESS);
    };

    /** 抬手收尾：拖拽落定 / 单击选中 / 双击改名 */
    const handleRelease = () => {
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

    /** 手势被打断（touchcancel / pointercancel） */
    const cancelPress = () => {
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
      cleanupDrag();
    };

    // ---------- 触摸设备（iOS / 安卓）----------
    if (isTouch) {
      const onTouchStart = (e: TouchEvent) => {
        if (editingIdRef.current) return; // 编辑状态不响应拖拽/选择
        const target = e.target as HTMLElement;
        const pill = target.closest('[data-section-id]') as HTMLElement | null;
        if (!pill) return;
        const id = pill.dataset.sectionId!;
        const t = e.touches[0];
        // 按下瞬间即全局禁止选中，阻止 iOS 长按选中附近任务卡片文字
        document.body.classList.add(BODY_CLASS);
        pressRef.current = {
          id,
          startX: t.clientX,
          startY: t.clientY,
          longTimer: null,
          moved: false,
          dragging: false,
          el: pill,
          pointerId: null,
        };
        armLongPress(id);
      };
      const onTouchMove = (e: TouchEvent) => {
        const p = pressRef.current;
        if (!p) return;
        const t = e.touches[0];
        const dx = t.clientX - p.startX;
        const dy = t.clientY - p.startY;
        if (p.dragging) {
          // 拖拽中：掐断原生滚动，纯 JS 接管让位重排
          // （手指按住不动期间浏览器尚未开始滚动，此刻 preventDefault 才真正有效）
          if (e.cancelable) e.preventDefault();
          coreMove(t.clientX, t.clientY);
          return;
        }
        // 等待期内：记录是否已移动（用于单击判定）
        if (Math.abs(dx) > TAP_MOVE || Math.abs(dy) > TAP_MOVE) p.moved = true;
        // 明显横向滑动 → 用户在浏览，取消长按；
        // 此处不 preventDefault，原生顺滑横滑照常发生（不卡顿）。
        if (Math.abs(dx) > SCROLL_CANCEL && Math.abs(dx) > Math.abs(dy)) {
          if (p.longTimer) {
            window.clearTimeout(p.longTimer);
            p.longTimer = null;
          }
        }
      };

      container.addEventListener('touchstart', onTouchStart, { passive: true });
      container.addEventListener('touchmove', onTouchMove, { passive: false });
      container.addEventListener('touchend', handleRelease, { passive: true });
      container.addEventListener('touchcancel', cancelPress, { passive: true });
      return () => {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', handleRelease);
        container.removeEventListener('touchcancel', cancelPress);
        cleanupDrag();
      };
    }

    // ---------- 桌面（Pointer 事件回退）----------
    const onPointerDown = (e: PointerEvent) => {
      if (editingIdRef.current) return;
      const target = e.target as HTMLElement;
      const pill = target.closest('[data-section-id]') as HTMLElement | null;
      if (!pill) return;
      const id = pill.dataset.sectionId!;
      document.body.classList.add(BODY_CLASS);
      pressRef.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        longTimer: null,
        moved: false,
        dragging: false,
        el: pill,
        pointerId: e.pointerId,
      };
      armLongPress(id);
    };
    const onPointerMove = (e: PointerEvent) => {
      const p = pressRef.current;
      if (!p) return;
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      if (p.dragging) {
        e.preventDefault();
        coreMove(e.clientX, e.clientY);
        return;
      }
      if (Math.abs(dx) > TAP_MOVE || Math.abs(dy) > TAP_MOVE) p.moved = true;
    };

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', handleRelease);
    window.addEventListener('pointercancel', cancelPress);
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', handleRelease);
      window.removeEventListener('pointercancel', cancelPress);
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

  /**
   * 渲染单个 pill。
   * ghost=true 表示「正在被拖动的那一项」：
   *  —— 必须保留 DOM 节点！它是这次触摸序列的原始 target，一旦卸载，
   *     iOS 就不再给它派发 touchmove/touchend（表现为「长按后卡住、拖不动」）。
   *     因此这里不卸载，而是用 CSS 让它脱离布局流（absolute）+ 完全透明，
   *     这样其余 pill 的让位几何效果与「卸载」时完全一致，但触摸链路不断。
   */
  const renderPill = (it: SectionTabItem, isActive: boolean, ghost = false) => {
    const dropId = it.id === '__unsec__' ? 'none' : it.id;
    const isDrop = dropTargetId != null && dropTargetId === dropId;
    const isDragging = dragId === it.id;
    return (
      <div
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
          ...(ghost
            ? { position: 'absolute' as const, left: 0, top: 0, opacity: 0, pointerEvents: 'none' as const }
            : null),
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
            <button
              type="button"
              aria-label="删除分组"
              data-no-drag
              onPointerDown={(e) => {
                // 在 input 失焦（onBlur 会卸载整个编辑态）之前触发删除，
                // 否则点击落在已卸载的节点上，handleDelete 永远不执行。
                e.preventDefault();
                e.stopPropagation();
                handleDelete(it.id);
              }}
              className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-neutral-300 text-white active:bg-red-400"
            >
              <IconClose size={11} />
            </button>
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
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      data-section-bar
      className="relative flex items-center gap-2 no-scrollbar overflow-x-auto"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {sections.map((s) => (
        // 注意：正在拖拽的项也必须保留节点（ghost），否则 iOS 会中断触摸事件序列
        <Fragment key={s.id}>{renderPill(s, FULL(s.id) === activeId, dragId === s.id)}</Fragment>
      ))}
      {unsectioned &&
        renderPill(
          { id: '__unsec__', label: unsectioned.label, count: unsectioned.count, editable: false },
          activeId === 'sec-none',
          dragId === '__unsec__',
        )}

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

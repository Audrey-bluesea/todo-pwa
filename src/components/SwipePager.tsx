import { useRef, useState, useCallback, type ReactNode, type TouchEvent } from 'react';

interface SwipePagerProps {
  /** 当前中心页对应的日期（来自 store，commit 后由 onCommit 更新） */
  current: Date;
  /** 相邻页日期计算：stepFn(date, -1)=上一页, stepFn(date, +1)=下一页 */
  stepFn: (d: Date, n: number) => Date;
  /** 提交时真正切换数据：dir=-1 上一页 / +1 下一页 */
  onCommit: (dir: number) => void;
  /** 渲染某一页的内容（传该页日期） */
  renderPane: (date: Date, key: string) => ReactNode;
  threshold?: number;
  duration?: number;
  className?: string;
}

/**
 * 三格轮播轨道：prev | center | next，每个占满视口宽。
 * 静止时轨道 translateX(-100%) 显示 center，跟手 1:1（calc(-100% + dx)）。
 * 松手越过阈值：整轨平移正好一页（0% 或 -200%），**用 transitionend 事件精确捕获动画结束**，
 * 那一刻才切数据 + 瞬时归位（-100%，无过渡）——无任何回弹。
 */
export default function SwipePager({
  current,
  stepFn,
  onCommit,
  renderPane,
  threshold = 45,
  duration = 280,
  className,
}: SwipePagerProps) {
  const ref = useRef<{ x: number; y: number; t: number; dir: 'x' | 'y' | null; dx: number; moved: boolean }>({
    x: 0, y: 0, t: 0, dir: null, dx: 0, moved: false,
  });
  const animatingRef = useRef(false);
  // 镜像当前渲染的横向位移，用于判断回弹时是否真有动画可触发 transitionend
  const dragXRef = useRef(0);
  const [dragX, setDragX] = useState(0);
  // 'idle' = 静止；'drag' = 跟手；'animating' = 提交滑出或回弹中
  const [state, setState] = useState<'idle' | 'drag' | 'animating'>('idle');
  // 切数据时关闭过渡，避免归位过程被动画化（这是回弹的根因）
  const [noTransition, setNoTransition] = useState(false);
  // 提交方向：0=回弹(未越过阈值)，-1=上一页，+1=下一页
  const [target, setTarget] = useState(0);

  const fullPage = () => (typeof window !== 'undefined' ? window.innerWidth : 0);

  const onTouchStart = (e: TouchEvent) => {
    if (animatingRef.current) return;
    const t = e.touches[0];
    if (!t) return;
    ref.current = { x: t.clientX, y: t.clientY, t: Date.now(), dir: null, dx: 0, moved: false };
    setNoTransition(true); // 触摸期间禁用过渡，纯跟手
    setState('drag');
    setDragX(0);
    dragXRef.current = 0;
  };

  const onTouchMove = (e: TouchEvent) => {
    const r = ref.current;
    if (!r || r.dir === 'y') return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - r.x;
    const dy = t.clientY - r.y;
    if (r.dir === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      r.dir = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (r.dir === 'x') {
      r.dx = dx;
      r.moved = true;
      dragXRef.current = dx;
      setDragX(dx);
    }
  };

  const onTouchEnd = () => {
    const r = ref.current;
    if (!r) return;
    if (r.dir === 'x' && r.moved) {
      const dt = (Date.now() - r.t) / 1000;
      const velocity = dt > 0 ? Math.abs(r.dx) / dt : 0;
      if (Math.abs(r.dx) > threshold || velocity > 300) {
        const dir = r.dx < 0 ? 1 : -1; // 1=下一页(右格 -200%) / -1=上一页(左格 0%)
        setTarget(dir);
        animatingRef.current = true;
        setState('animating');
        setNoTransition(false); // 开启滑出动画
        setDragX(dir > 0 ? -fullPage() : fullPage());
        ref.current = { x: 0, y: 0, t: 0, dir: null, dx: 0, moved: false };
        // 兜底：万一 transitionend 未触发，超时强制完成切换并复位
        setTimeout(() => {
          if (!animatingRef.current) return;
          onCommit(dir);
          setNoTransition(true);
          setDragX(0);
          setTarget(0);
          animatingRef.current = false;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setNoTransition(false);
              setState('idle');
            });
          });
        }, duration + 120);
        return;
      }
    }
    // 未越过阈值：平滑回弹到 center
    if (dragXRef.current === 0) {
      // 没有任何横向位移（如竖直滚动、点按），transform 并未改变，
      // 不会触发 transitionend——必须直接复位 idle，否则 animatingRef 永久为 true，
      // 会导致之后的滑动全部被 onTouchStart 的早返回吞掉（滑动“假死”）。
      animatingRef.current = false;
      setState('idle');
      setNoTransition(false);
      setDragX(0);
      dragXRef.current = 0;
      ref.current = { x: 0, y: 0, t: 0, dir: null, dx: 0, moved: false };
      return;
    }
    animatingRef.current = true;
    setState('animating');
    setNoTransition(false);
    setDragX(0);
    dragXRef.current = 0;
    ref.current = { x: 0, y: 0, t: 0, dir: null, dx: 0, moved: false };
    // 兜底：万一 transitionend 未触发（如 prefers-reduced-motion / 元素重挂载），
    // 超时强制复位，绝不让 animatingRef 永久卡死导致滑动失效。
    setTimeout(() => {
      if (!animatingRef.current) return;
      animatingRef.current = false;
      setState('idle');
      setNoTransition(false);
    }, duration + 120);
  };

  const onTransitionEnd = useCallback(() => {
    if (state !== 'animating') return;
    if (target !== 0) {
      // 滑到相邻页动画结束 —— 此刻才切数据，并瞬时归位（无过渡）
      onCommit(target);
      setNoTransition(true);
      setDragX(0);
      setTarget(0);
      animatingRef.current = false;
      // 等两帧确保浏览器已绘制瞬时归位，再恢复过渡与静止态
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setNoTransition(false);
          setState('idle');
        });
      });
    } else {
      // 回弹动画结束
      animatingRef.current = false;
      setState('idle');
    }
  }, [state, target, onCommit]);

  const transform = dragX === 0 ? 'translateX(-100%)' : `translateX(calc(-100% + ${dragX}px))`;
  const transition = noTransition ? 'none' : `transform ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;

  return (
    <div
      className={className}
      style={{ overflow: 'hidden', height: '100%', width: '100%', touchAction: 'pan-y' }}
      {...{ onTouchStart, onTouchMove, onTouchEnd }}
    >
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          transform,
          transition,
          willChange: 'transform',
        }}
        onTransitionEnd={onTransitionEnd}
      >
        <div style={{ flex: '0 0 100%', width: '100%', height: '100%', overflow: 'hidden' }}>
          {renderPane(stepFn(current, -1), 'prev')}
        </div>
        <div style={{ flex: '0 0 100%', width: '100%', height: '100%', overflow: 'hidden' }}>
          {renderPane(current, 'cur')}
        </div>
        <div style={{ flex: '0 0 100%', width: '100%', height: '100%', overflow: 'hidden' }}>
          {renderPane(stepFn(current, 1), 'next')}
        </div>
      </div>
    </div>
  );
}

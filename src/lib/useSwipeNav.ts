import { useRef, useState, useCallback, type TouchEvent } from 'react';

interface SwipeOptions {
  /** 手指向左滑（内容前进）→ 下一页 / 后一天 / 下一月 */
  onLeft?: () => void;
  /** 手指向右滑（内容后退）→ 上一页 / 前一天 / 上一月 */
  onRight?: () => void;
  /** 触发切换的最小位移(px)，默认 45 */
  threshold?: number;
  /** 提交滑出动画时长(ms)，默认 280 */
  duration?: number;
  /** 拖拽跟手系数，默认 1（完全跟手），<1 有阻尼感 */
  follow?: number;
}

/**
 * 通用水平滑动手势（轮播式丝滑体验）。
 * - 方向锁定：|dx| 明显大于 |dy| 才判为水平，避免与垂直滚动冲突
 * - 跟手：拖拽时内容 1:1 跟随手指
 * - 提交动画：松手越过阈值后，整页沿滑动方向丝滑滑出（translateX ±100%），
 *   动画结束再真正切换数据并归位，避免「硬切」的突兀感
 * 直接返回 transform / transition，调用方 spread handlers 并套用即可。
 */
export function useSwipeNav({
  onLeft,
  onRight,
  threshold = 45,
  duration = 280,
  follow = 1,
}: SwipeOptions) {
  const ref = useRef<{ x: number; y: number; t: number; dir: 'x' | 'y' | null; dx: number }>({
    x: 0,
    y: 0,
    t: 0,
    dir: null,
    dx: 0,
  });
  const [dragX, setDragX] = useState(0);
  // phase: 'drag' 拖拽中 | 'commit' 提交滑出中 | 'idle' 静止
  const [phase, setPhase] = useState<'idle' | 'drag' | 'commit'>('idle');
  const [commitDir, setCommitDir] = useState(0); // -1 左滑 / 1 右滑

  const reset = useCallback(() => {
    ref.current = { x: 0, y: 0, t: 0, dir: null, dx: 0 };
  }, []);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    ref.current = { x: t.clientX, y: t.clientY, t: Date.now(), dir: null, dx: 0 };
    setPhase('drag');
    setDragX(0);
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    const r = ref.current;
    if (!r || r.dir === 'y') return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - r.x;
    const dy = t.clientY - r.y;
    if (r.dir === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        r.dir = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
    }
    if (r.dir === 'x') {
      r.dx = dx;
      setDragX(dx * follow);
    }
  }, [follow]);

  const onTouchEnd = useCallback(() => {
    const r = ref.current;
    if (!r) return;
    if (r.dir === 'x') {
      const v = (Date.now() - r.t) / 1000;
      const velocity = v > 0 ? Math.abs(r.dx) / v : 0;
      if (Math.abs(r.dx) > threshold || velocity > 350) {
        const dir = r.dx < 0 ? -1 : 1;
        setCommitDir(dir);
        setPhase('commit');
        // 滑出动画结束后真正切换数据并归位（无过渡，新内容已在位）
        window.setTimeout(() => {
          if (dir < 0) onLeft?.();
          else onRight?.();
          setDragX(0);
          setPhase('idle');
        }, duration);
        reset();
        return;
      }
    }
    setDragX(0);
    setPhase('idle');
    reset();
  }, [onLeft, onRight, threshold, duration, reset]);

  let transform: string | undefined;
  let transition: string;
  if (phase === 'commit') {
    // 整页沿滑动方向滑出视口
    transform = `translateX(${commitDir * 100}%)`;
    transition = `transform ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
  } else if (phase === 'drag' && dragX !== 0) {
    transform = `translateX(${dragX}px)`;
    transition = 'none';
  } else {
    // idle：归位（若上一帧在 commit，会平滑滑回 0 形成「滑入」收尾）
    transform = undefined;
    transition = `transform ${Math.min(duration, 240)}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
  }

  return { handlers: { onTouchStart, onTouchMove, onTouchEnd }, transform, transition };
}

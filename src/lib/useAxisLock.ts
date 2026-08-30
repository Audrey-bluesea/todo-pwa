import { useEffect, useRef } from 'react';

/**
 * 横滑手势锁（微信 / 小红书列表那种手感）
 *
 * 解决的问题：
 *   左滑卡片露出操作按钮时，页面/列表会「同时」跟着上下滚动，手感很别扭。
 *
 * 原理：
 *   手势开始后先不干预；一旦位移超过阈值就判定主轴——
 *     · 判定为横向 → 后续每个 touchmove 都 preventDefault()，纵向滚动被掐断，只剩横滑；
 *     · 判定为纵向 → 一个都不拦，列表正常上下滚。
 *
 * 关键实现约束（踩过坑，别改回去）：
 *   1. 必须用**原生** touchmove 监听且 `{ passive: false }`；
 *      React 的合成 onTouchMove 是 passive 的，里面调 preventDefault() 无效。
 *   2. 监听要常驻（mount 时挂好），不能等到判定为横向才挂——那时浏览器可能已经开始滚动了。
 *   3. 阈值取 8px 左右：足够过滤手指抖动，又远小于浏览器开始滚动的判定距离。
 */
export function useAxisLock<T extends HTMLElement>(threshold = 8) {
  const ref = useRef<T | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);
  /** 本次手势的主轴：'x' 横向 / 'y' 纵向 / null 尚未判定 */
  const axis = useRef<'x' | 'y' | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      axis.current = null;
      active.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current) return;
      const t = e.touches[0];
      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;
      if (!axis.current && (Math.abs(dx) > threshold || Math.abs(dy) > threshold)) {
        axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      // 锁定横向后掐断纵向滚动
      if (axis.current === 'x' && e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      active.current = false;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [threshold]);

  return { ref, axis, startX };
}

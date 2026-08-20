import { useRef, useState, useEffect } from 'react';
import { IconList, IconBoard, IconChevronDown, IconCheck } from './Icons';

export type GroupKey = 'time' | 'category' | 'section';

export interface GroupOption {
  key: GroupKey;
  label: string;
}

interface Props {
  isBoard: boolean;
  /** 点击「列表」按钮（非列表模式时切换到列表） */
  onSelectList: () => void;
  /** 点击「看板」按钮（非看板模式时切换到看板） */
  onSelectBoard: () => void;
  /** 分组选项（由上下文决定：智能清单→按时间/按清单；自定义清单→按时间/按分组） */
  groupOptions: GroupOption[];
  /** 当前分组 key */
  currentGroup: GroupKey;
  /** 选择分组 */
  onSelectGroup: (key: GroupKey) => void;
  /** 是否隐藏分组下拉（如收集箱，只做纯列表/看板切换） */
  hideGroupDropdown?: boolean;
}

/**
 * 图标分段控制器：列表 ⇄ 看板（带分组下拉）
 * - 活跃按钮右侧显示 ∨，点击展开分组菜单
 * - 非活跃按钮点击切换视图
 * - 列表和看板模式下都支持分组下拉（选项因上下文而异）
 */
export default function ViewSegment({
  isBoard,
  onSelectList,
  onSelectBoard,
  groupOptions,
  currentGroup,
  onSelectGroup,
  hideGroupDropdown = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 切换视图时收起下拉
  useEffect(() => {
    setOpen(false);
  }, [isBoard]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // 点击当前活跃按钮 → 切换分组下拉
  const handleActiveClick = () => {
    if (!hideGroupDropdown) setOpen((v) => !v);
  };

  // 点击非活跃按钮 → 切换视图（关闭下拉）
  const handleInactiveClick = () => {
    setOpen(false);
    if (isBoard) onSelectList();
    else onSelectBoard();
  };

  return (
    <div ref={ref} className="relative flex items-center">
      {/* 分段：列表 / 看板 */}
      <div className="flex items-center rounded-full bg-neutral-100/60 p-[3px]">
        <button
          onClick={isBoard ? handleInactiveClick : handleActiveClick}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-all press ${
            !isBoard ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-400'
          }`}
        >
          <IconList size={15} />
          <span className="hidden sm:inline">列表</span>
          {!isBoard && !hideGroupDropdown && (
            <IconChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          )}
        </button>
        <button
          onClick={isBoard ? handleActiveClick : handleInactiveClick}
          className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-all press ${
            isBoard ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-400'
          }`}
          aria-label={`${isBoard ? '列表' : '看板'}视图（点击选择分组）`}
        >
          <IconBoard size={15} />
          <span className="hidden sm:inline">看板</span>
          {isBoard && !hideGroupDropdown && (
            <IconChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          )}
        </button>
      </div>

      {/* 分组下拉（两种视图模式均可展开） */}
      {open && !hideGroupDropdown && groupOptions.length > 0 && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-40 mt-1.5 min-w-[148px] overflow-hidden rounded-2xl bg-white py-1.5 shadow-card anim-pop"
            style={{ border: '1px solid rgba(168,213,186,0.3)' }}
          >
            <div className="px-3.5 pb-1 pt-1 text-[11px] font-medium text-neutral-400">分组方式</div>
            {groupOptions.map((o) => {
              const active = o.key === currentGroup;
              return (
                <button
                  key={o.key}
                  onClick={() => {
                    onSelectGroup(o.key);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13.5px] transition-colors ${
                    active ? 'bg-primary-50 font-semibold text-primary-700' : 'text-neutral-600'
                  }`}
                  style={{ minHeight: 44 }}
                >
                  <span className="flex-1">{o.label}</span>
                  {active && <IconCheck className="h-[16px] w-[16px] text-primary-500" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

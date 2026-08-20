import { useUIStore } from '../store/uiStore';
import { IconSearch, IconClose } from './Icons';

/**
 * 搜索输入框（自包含，直接读 uiStore）。
 * - 有查询词时右侧出现清除按钮（仅清词，保留搜索态）
 * - 退出搜索由各 Tab 的「取消」按钮或切换 Tab 触发
 */
export default function SearchBar() {
  const query = useUIStore((s) => s.searchQuery);
  const setQuery = useUIStore((s) => s.setSearchQuery);

  return (
    <div className="flex items-center gap-2 rounded-full bg-primary-50 px-3 py-2">
      <IconSearch size={18} className="shrink-0 text-primary-500" />
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索任务、描述、清单…"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-700 outline-none placeholder:text-neutral-400"
        aria-label="搜索"
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          className="hit shrink-0 text-neutral-400 press"
          aria-label="清除搜索词"
        >
          <IconClose size={18} />
        </button>
      )}
    </div>
  );
}

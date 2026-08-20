import { useMemo } from 'react';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 高亮命中片段：将 text 中匹配 query（大小写不敏感）的子串用 <mark> 包裹。
 * query 为空时原样返回。
 */
export default function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();

  const parts = useMemo(() => {
    if (!q) return [text];
    try {
      const re = new RegExp(`(${escapeRegExp(q)})`, 'gi');
      return text.split(re);
    } catch {
      return [text];
    }
  }, [text, q]);

  if (!q) return <>{text}</>;

  const lower = q.toLowerCase();
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === lower ? (
          <mark key={i} className="rounded-[3px] bg-primary-200 px-[1px] text-primary-800">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function EmptyState({
  title,
  desc,
  emoji = '🍵',
}: {
  title: string;
  desc?: string;
  emoji?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-[30px]">
        {emoji}
      </div>
      <div className="text-[15px] font-medium text-primary-700">{title}</div>
      {desc && <div className="mt-1 text-[13px] leading-relaxed text-neutral-400">{desc}</div>}
    </div>
  );
}

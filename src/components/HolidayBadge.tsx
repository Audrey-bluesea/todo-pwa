import type { HolidayMark } from '../lib/holidays';

interface Props {
  mark: HolidayMark;
  className?: string;
}

/** 节假日标记：休=放假（绿），班=调休上班（红）。尺寸极小，不抢视觉。 */
export default function HolidayBadge({ mark, className = '' }: Props) {
  const isRest = mark.type === 'rest';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] px-[3px] text-[9.5px] font-medium leading-[13px] ${
        isRest ? 'bg-[#E1F5EE] text-[#0F6E56]' : 'bg-[#FCEBEB] text-[#A32D2D]'
      } ${className}`}
      title={isRest ? `${mark.name} · 放假` : '调休上班'}
    >
      {isRest ? '休' : '班'}
    </span>
  );
}

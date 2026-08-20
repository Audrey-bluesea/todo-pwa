import { useUIStore } from '../store/uiStore';
import { useTimerStore } from '../store/timerStore';
import { IconClock } from './Icons';

export default function TimerButton() {
  const setTimerSheetOpen = useUIStore((s) => s.setTimerSheetOpen);
  const hasRunning = useTimerStore((s) => s.running.length > 0);
  const count = useTimerStore((s) => s.running.length);

  return (
    <button
      onClick={() => setTimerSheetOpen(true)}
      className="hit text-primary-700 press relative"
      aria-label="计时"
    >
      <IconClock size={22} className={hasRunning ? 'text-primary-500' : ''} />
      {hasRunning && (
        <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
          {count}
        </span>
      )}
    </button>
  );
}

// 跨重挂载的滚动位置 / 看板 tab 记忆（进程内，不落盘）
const map = new Map<string, { scroll: number; tab: number }>();

export const scrollMemory = {
  save(key: string, scroll: number, tab: number) {
    map.set(key, { scroll, tab });
  },
  get(key: string): { scroll: number; tab: number } | undefined {
    return map.get(key);
  },
};

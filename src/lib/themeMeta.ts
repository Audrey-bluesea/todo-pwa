import type { ThemeKey } from '../store/uiStore';

/**
 * 外观主题的展示元数据 —— **唯一来源**。
 *
 * 外观面板（SettingsSheet）和 FAB 按钮（TabBar）都从这里取 emoji，
 * 避免两处各写一份导致图标对不上（历史上曾有 6 个主题不一致）。
 * 名字/描述按 CSS 里的**实际色系**命名，theme key 本身永不改动
 * （localStorage['xingshilu.theme'] 存的是 key，改了会让已保存的选择失效）。
 * 色卡 swatch 也对齐各主题 [data-theme] 的真实 CSS 变量值。
 */
export type ThemeMeta = {
  key: ThemeKey;
  name: string;
  desc: string;
  emoji: string;
  swatch: string[];
};

export const THEME_META: ThemeMeta[] = [
  {
    key: 'matcha',
    name: '抹茶绿',
    desc: '茶绿 · 淡绿底 · 默认',
    emoji: '🥑',
    swatch: ['#6BAA7A', '#A8D5BA', '#E6F2E8'],
  },
  {
    key: 'pixel',
    name: '珊瑚浅滩',
    desc: '海青 · 暖沙白',
    emoji: '🪸',
    // 对齐 [data-theme='pixel']：primary-500 / primary-300 / accent / appbg
    swatch: ['#63AABB', '#8EC8D5', '#F0B860', '#F6F2EA'],
  },
  {
    key: 'spring',
    name: '樱粉',
    desc: '樱粉 · 柔白',
    emoji: '🌸',
    swatch: ['#F28B9C', '#F8B4C2', '#FFD93D', '#A8E6CF'],
  },
  {
    key: 'summer',
    name: '夏日风铃',
    desc: '晴空蓝 · 清风',
    emoji: '🎐',
    swatch: ['#2D9CDB', '#7BC8F7', '#F2994A', '#27AE60'],
  },
  {
    key: 'autumn',
    name: '秋枫',
    desc: '陶土橙 · 暖棕',
    emoji: '🍁',
    swatch: ['#D97A48', '#EBAF8B', '#C0392B', '#8E6E53'],
  },
  {
    key: 'winter',
    name: '初雪',
    desc: '冷银灰 · 雾紫',
    emoji: '❄️',
    // 旧色卡 4 个值全是过时配色（与 [data-theme='winter'] 无一相符），
    // 现对齐真实 CSS：primary-500 / primary-300 / accent / appbg
    swatch: ['#7884A4', '#B7BFD1', '#C8748C', '#ECEFF5'],
  },
  {
    key: 'blossom',
    name: '薄荷四叶',
    desc: '薄荷青 · 清透',
    emoji: '🍀',
    swatch: ['#4EA09E', '#B9E2DF', '#D2646C', '#488C74'],
  },
  {
    key: 'unicorn',
    name: '独角兽',
    desc: '梦幻紫 · 柔粉',
    emoji: '🦄',
    swatch: ['#9070DB', '#E9E0FF', '#E8609B', '#5CBFA6'],
  },
  {
    key: 'moonlit',
    name: '月照林海',
    desc: '靛蓝 · 灰紫月雾',
    emoji: '🌕',
    // 蓝调天空 / 灰紫天边 / 暮蓝远海 / 翠绿树林 / 满月金，均取自 [data-theme='moonlit']
    swatch: ['#4A64A6', '#9E9ECA', '#6E82BA', '#3E9B6C', '#E8BE6A'],
  },
];

/** FAB 按钮的 emoji：直接派生自 THEME_META，保证与外观面板永远一致。 */
export const THEME_EMOJI: Partial<Record<ThemeKey, string>> = Object.fromEntries(
  THEME_META.map((t) => [t.key, t.emoji]),
) as Partial<Record<ThemeKey, string>>;

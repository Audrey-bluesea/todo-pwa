// 过滤字符串中的 emoji（含常用符号、旗帜、肤色修饰、组合键等），仅保留文字/数字/标点。
// 用于周时间轴：列宽有限，自动隐藏任务标题里的 emoji，避免挤占文字空间；
// 日时间轴列宽充裕，保留 emoji，两视图互不干扰。

const EMOJI_REGEX =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

export function stripEmoji(input: string): string {
  if (!input) return '';
  return input
    .replace(EMOJI_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

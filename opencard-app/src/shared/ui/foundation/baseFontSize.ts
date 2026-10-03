/**
 * 界面基准字号的唯一取值范围。
 *
 * 设置里的滑块和真正算 CSS 文字 token 的地方都从这里取值：以前范围写在两处
 * （设置常量与 token 钳制），只改一处就会出现"滑块能拉到 19、界面还是 16"。
 */
export const MIN_BASE_FONT_SIZE = 13
export const MAX_BASE_FONT_SIZE = 19
export const DEFAULT_BASE_FONT_SIZE = 13

/** 任何输入都收进允许范围：文字尺寸取整即可；不是有效数字就用默认值。 */
export function clampBaseFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_BASE_FONT_SIZE
  return Math.min(MAX_BASE_FONT_SIZE, Math.max(MIN_BASE_FONT_SIZE, Math.round(value)))
}

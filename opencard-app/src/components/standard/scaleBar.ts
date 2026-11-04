/** 比例尺的最大屏幕宽度。长度只取 1/2/5×10ⁿ，所以实际宽度总在它的 40%～100% 之间。 */
export const SCALE_BAR_MAX_WIDTH = 120

export type ScaleBar = { lengthMm: number; width: number }

/** 取当前缩放下放得进最大宽度的最长整齐长度：数字好读，宽度随缩放连续变化，到档时跳一次。 */
export function resolveScaleBar(pixelsPerMm: number): ScaleBar {
  const longest = SCALE_BAR_MAX_WIDTH / pixelsPerMm
  const decade = 10 ** Math.floor(Math.log10(longest))
  const step = [5, 2, 1].find(candidate => candidate * decade <= longest) ?? 1
  const lengthMm = Number((step * decade).toPrecision(1))
  return { lengthMm, width: lengthMm * pixelsPerMm }
}

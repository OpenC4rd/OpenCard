/** Clamps `value` into the inclusive `[minimum, maximum]` range. */
export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

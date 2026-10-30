interface TutorialRect { left: number; top: number; right: number; bottom: number }

/** 从所有目标之间找可用矩形，而不是把目标包成一个大锚点。 */
export function findTutorialSpace(targets: readonly TutorialRect[], width: number, height: number, preferredHeight = 520): TutorialRect {
  const viewport = { left: 8, top: 8, right: Math.max(8, width - 8), bottom: Math.max(8, height - 8) }
  const obstacles = targets.map(rect => ({
    left: Math.max(viewport.left, rect.left - 32), top: Math.max(viewport.top, rect.top - 32),
    right: Math.min(viewport.right, rect.right + 32), bottom: Math.min(viewport.bottom, rect.bottom + 32),
  })).filter(rect => rect.right > rect.left && rect.bottom > rect.top)
  const edges = [...new Set([viewport.left, viewport.right, ...obstacles.flatMap(rect => [rect.left, rect.right])])].sort((a, b) => a - b)
  let best = viewport
  let bestScore = -1
  for (let left = 0; left < edges.length - 1; left++) {
    for (let right = left + 1; right < edges.length; right++) {
      const x1 = edges[left]!, x2 = edges[right]!
      const blocked = obstacles.filter(rect => rect.left < x2 && rect.right > x1).sort((a, b) => a.top - b.top)
      let top = viewport.top
      for (const rect of [...blocked, { ...viewport, top: viewport.bottom }]) {
        const availableHeight = rect.top - top
        const availableWidth = x2 - x1
        // 优先正常阅读宽度；高度不足时使用卡片自身的滚动区域。
        const score = Math.min(340, availableWidth) * Math.min(520, availableHeight)
          * (availableWidth >= Math.min(280, width - 16) ? 2 : 1)
        if (availableHeight > 0 && score > bestScore) {
          best = { left: x1, right: x2, top, bottom: rect.top }
          bestScore = score
        }
        top = Math.max(top, rect.bottom)
      }
    }
  }
  const cardWidth = Math.min(340, best.right - best.left)
  const cardHeight = Math.min(preferredHeight, best.bottom - best.top)
  const target = targets[0] ?? viewport
  const left = Math.max(best.left, Math.min(best.right - cardWidth, (target.left + target.right - cardWidth) / 2))
  const top = Math.max(best.top, Math.min(best.bottom - cardHeight, (target.top + target.bottom - cardHeight) / 2))
  return { left, top, right: left + cardWidth, bottom: top + cardHeight }
}

/** 曲线从说明卡边缘出发，终止于目标边缘，不穿过两者内部。 */
export function tutorialConnector(card: TutorialRect, target: TutorialRect, message: TutorialRect = card): string {
  const cx = (card.left + card.right) / 2, cy = (card.top + card.bottom) / 2
  const tx = (target.left + target.right) / 2, ty = (target.top + target.bottom) / 2
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  if (target.left >= card.right || target.right <= card.left) {
    const x1 = tx > cx ? card.right : card.left
    const x2 = tx > cx ? target.left - 4 : target.right + 4
    const y1 = clamp((message.top + message.bottom) / 2, card.top + 8, card.bottom - 8)
    const middle = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${ty}, ${x2} ${ty}`
  }
  const y1 = ty > cy ? card.bottom : card.top
  const y2 = ty > cy ? target.top - 4 : target.bottom + 4
  const x1 = clamp((message.left + message.right) / 2, card.left + 8, card.right - 8)
  const middle = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${middle}, ${tx} ${middle}, ${tx} ${y2}`
}

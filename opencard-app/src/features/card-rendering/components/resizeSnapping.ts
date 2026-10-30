type ResizeSnapRect = {
  left: number
  top: number
  width: number
  height: number
}

export type ResizeSnapTarget = {
  id: string
  kind: 'parent' | 'sibling'
  rect: ResizeSnapRect
}

export type ResizeSnapLock = {
  axis: 'x' | 'y'
  movingEdge: 'left' | 'right' | 'top' | 'bottom'
  targetEdge: 'left' | 'right' | 'top' | 'bottom'
  position: number
  target: ResizeSnapTarget
}

export type ResizeSnapLocks = {
  x?: ResizeSnapLock
  y?: ResizeSnapLock
}

type ResizeSnapResult = {
  rect: ResizeSnapRect
  locks: ResizeSnapLocks
}

type ResizeHandle = 'lt' | 'rt' | 'lb' | 'rb' | 'l' | 'r' | 't' | 'b'
type Axis = 'x' | 'y'
type Edge = ResizeSnapLock['movingEdge']

export function snapMoveRect(options: {
  rect: ResizeSnapRect
  targets: readonly ResizeSnapTarget[]
  enterDistance: number
  releaseDistance: number
  previousLocks?: ResizeSnapLocks
}): ResizeSnapResult {
  const rect = { ...options.rect }
  const locks: ResizeSnapLocks = {}
  for (const axis of ['x', 'y'] as const) {
    const lock = resolveMoveAxisLock(axis, rect, options)
    if (!lock) continue
    applyMoveLock(rect, lock)
    locks[axis] = lock
  }
  return { rect, locks }
}

export function snapResizeRect(options: {
  rect: ResizeSnapRect
  handle: ResizeHandle
  targets: readonly ResizeSnapTarget[]
  enterDistance: number
  releaseDistance: number
  previousLocks?: ResizeSnapLocks
  minSize: number
}): ResizeSnapResult {
  const rect = { ...options.rect }
  const locks: ResizeSnapLocks = {}
  const horizontalEdge = getMovingEdge(options.handle, 'x')
  const verticalEdge = getMovingEdge(options.handle, 'y')

  if (horizontalEdge) {
    const lock = resolveAxisLock('x', horizontalEdge, rect, options)
    if (lock && applyLock(rect, lock, options.minSize)) locks.x = lock
  }
  if (verticalEdge) {
    const lock = resolveAxisLock('y', verticalEdge, rect, options)
    if (lock && applyLock(rect, lock, options.minSize)) locks.y = lock
  }
  return { rect, locks }
}

function resolveAxisLock(
  axis: Axis,
  movingEdge: Edge,
  rect: ResizeSnapRect,
  options: Parameters<typeof snapResizeRect>[0],
): ResizeSnapLock | null {
  const movingPosition = edgePosition(rect, movingEdge)
  const previous = options.previousLocks?.[axis]
  if (previous?.movingEdge === movingEdge
    && Math.abs(movingPosition - previous.position) <= options.releaseDistance
    && canApplyLock(rect, previous, options.minSize)) {
    return previous
  }

  const candidates = options.targets.flatMap(target => targetEdges(axis).map(targetEdge => ({
    axis,
    movingEdge,
    targetEdge,
    position: edgePosition(target.rect, targetEdge),
    target,
  } satisfies ResizeSnapLock)))
    .filter(candidate => (
      Math.abs(movingPosition - candidate.position) <= options.enterDistance
      && canApplyLock(rect, candidate, options.minSize)
    ))

  sortCandidates(candidates, rect)
  return candidates[0] ?? null
}

function resolveMoveAxisLock(
  axis: Axis,
  rect: ResizeSnapRect,
  options: Parameters<typeof snapMoveRect>[0],
): ResizeSnapLock | null {
  const previous = options.previousLocks?.[axis]
  if (previous
    && Math.abs(edgePosition(rect, previous.movingEdge) - previous.position) <= options.releaseDistance) {
    return previous
  }

  const candidates = movingEdges(axis).flatMap(movingEdge => (
    options.targets.flatMap(target => targetEdges(axis).map(targetEdge => ({
      axis,
      movingEdge,
      targetEdge,
      position: edgePosition(target.rect, targetEdge),
      target,
    } satisfies ResizeSnapLock)))
  )).filter(candidate => (
    Math.abs(edgePosition(rect, candidate.movingEdge) - candidate.position) <= options.enterDistance
  ))
  sortCandidates(candidates, rect)
  return candidates[0] ?? null
}

function getMovingEdge(handle: ResizeHandle, axis: Axis): Edge | null {
  if (axis === 'x') {
    if (handle.includes('l')) return 'left'
    if (handle.includes('r')) return 'right'
    return null
  }
  if (handle.includes('t')) return 'top'
  if (handle.includes('b')) return 'bottom'
  return null
}

function targetEdges(axis: Axis): Edge[] {
  return axis === 'x' ? ['left', 'right'] : ['top', 'bottom']
}

function movingEdges(axis: Axis): Edge[] {
  return targetEdges(axis)
}

function edgePosition(rect: ResizeSnapRect, edge: Edge): number {
  if (edge === 'left') return rect.left
  if (edge === 'right') return rect.left + rect.width
  if (edge === 'top') return rect.top
  return rect.top + rect.height
}

function sortCandidates(candidates: ResizeSnapLock[], rect: ResizeSnapRect): void {
  candidates.sort((left, right) => {
    const distance = Math.abs(edgePosition(rect, left.movingEdge) - left.position)
      - Math.abs(edgePosition(rect, right.movingEdge) - right.position)
    if (distance !== 0) return distance
    const edgePriority = Number(left.movingEdge !== left.targetEdge) - Number(right.movingEdge !== right.targetEdge)
    if (edgePriority !== 0) return edgePriority
    const kindPriority = Number(left.target.kind !== 'parent') - Number(right.target.kind !== 'parent')
    if (kindPriority !== 0) return kindPriority
    return left.target.id.localeCompare(right.target.id)
  })
}

function canApplyLock(rect: ResizeSnapRect, lock: ResizeSnapLock, minSize: number): boolean {
  const delta = lock.position - edgePosition(rect, lock.movingEdge)
  if (lock.movingEdge === 'left') return rect.width - delta >= minSize
  if (lock.movingEdge === 'right') return rect.width + delta >= minSize
  if (lock.movingEdge === 'top') return rect.height - delta >= minSize
  return rect.height + delta >= minSize
}

function applyLock(rect: ResizeSnapRect, lock: ResizeSnapLock, minSize: number): boolean {
  if (!canApplyLock(rect, lock, minSize)) return false
  const delta = lock.position - edgePosition(rect, lock.movingEdge)
  if (lock.movingEdge === 'left') {
    rect.left += delta
    rect.width -= delta
  } else if (lock.movingEdge === 'right') {
    rect.width += delta
  } else if (lock.movingEdge === 'top') {
    rect.top += delta
    rect.height -= delta
  } else {
    rect.height += delta
  }
  return true
}

function applyMoveLock(rect: ResizeSnapRect, lock: ResizeSnapLock): void {
  const delta = lock.position - edgePosition(rect, lock.movingEdge)
  if (lock.axis === 'x') rect.left += delta
  else rect.top += delta
}

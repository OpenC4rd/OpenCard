/** Canvas 风格仿射矩阵 [a, b, c, d, e, f]：x' = a·x + c·y + e，y' = b·x + d·y + f。 */
export type Matrix2D = readonly [number, number, number, number, number, number]
export type Point2D = { x: number; y: number }
export type Rect2D = { x: number; y: number; width: number; height: number }

const SINGULAR_EPSILON = 1e-12

export function identityMatrix(): Matrix2D {
  return [1, 0, 0, 1, 0, 0]
}

/** 返回 `a · b`：先应用 `b`，再应用 `a`。 */
export function multiplyMatrix(a: Matrix2D, b: Matrix2D): Matrix2D {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

/** 奇异矩阵（缩放为 0）没有逆，退回单位矩阵，避免 NaN 扩散到命中测试。 */
export function invertMatrix(m: Matrix2D): Matrix2D {
  const det = m[0] * m[3] - m[1] * m[2]
  if (Math.abs(det) < SINGULAR_EPSILON) return identityMatrix()
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ]
}

export function transformPoint(m: Matrix2D, pt: Point2D): Point2D {
  return { x: m[0] * pt.x + m[2] * pt.y + m[4], y: m[1] * pt.x + m[3] * pt.y + m[5] }
}

/** 只应用线性部分（忽略平移），用于变换位移向量。 */
export function transformVector(m: Matrix2D, v: Point2D): Point2D {
  return { x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y }
}

export function translationMatrix(x: number, y: number): Matrix2D {
  return [1, 0, 0, 1, x, y]
}

export function rotationMatrix(deg: number): Matrix2D {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return [cos, sin, -sin, cos, 0, 0]
}

export function scaleMatrix(sx: number, sy: number): Matrix2D {
  return [sx, 0, 0, sy, 0, 0]
}

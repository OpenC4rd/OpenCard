export type BindingValueKind = 'string' | 'number' | 'boolean' | 'object'

export function isBindingCompatible(target: BindingValueKind, source: BindingValueKind): boolean {
  if (target === 'string') return source !== 'object'
  return target === source && target !== 'object'
}

export function isBindingExpression(value: unknown): value is string {
  return typeof value === 'string' && /^\s*\{\{\s*[^{}]+?\s*\}\}\s*$/.test(value)
}

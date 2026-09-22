/**
 * 模块说明：
 * - 决定一个会话在壳层里显示什么名字（"打开的编辑器"列表与页面顶端共用这一份）。
 * 职责边界：
 * - 只做这一个字符串判断；不读会话仓储、不翻译、不关心调用方是谁。
 */

/** 判定显示名需要的最小会话形状；结构化传入，便于任何投影复用。 */
export type SessionLabelSource = {
  name: string
  presentation?: { title: string } | null
  isDirty: boolean
  resourceKind: 'workspace' | 'external' | 'draft'
}

/** 作用域前缀由调用方提供，因为它属于界面文案。 */
export type SessionScopeTexts = {
  external: (name: string) => string
  draft: (name: string) => string
}

/**
 * 呈现的三态决定显示什么：
 * - `undefined`：还没有编辑器声明过（会话刚打开、编辑器正在挂载），**留空**。
 *   先显示身份名再被声明替换，等于让用户看一次改名；空到有观感更好。
 * - `null`：编辑器声明了"我没有呈现"（纯文本这类），显示身份名。
 * - 对象：显示它声明的标题。未保存的标记与作用域前缀叠在名字上。
 */
export function resolveSessionLabel(session: SessionLabelSource, scopeTexts: SessionScopeTexts): string {
  if (session.presentation === undefined) return ''
  const title = session.presentation ? session.presentation.title : session.name
  const name = `${title}${session.isDirty ? ' *' : ''}`
  if (session.resourceKind === 'external') return scopeTexts.external(name)
  if (session.resourceKind === 'draft') return scopeTexts.draft(name)
  return name
}

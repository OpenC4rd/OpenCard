/**
 * 模块说明：
 * - 定义项目图标 `.oc-project-icon` 绘制契约的共享判定
 * 职责边界：
 * - 只识别一份内联样式绘制的是哪种项目图标，不生成样式、不读取项目数据
 */

/** `.oc-project-icon` 理解的 `--oc-project-icon-renderer` 取值。 */
const projectIconRenderers = ['mask', 'image'] as const

export type ProjectIconRenderer = typeof projectIconRenderers[number]

/**
 * 判断调用方给出的内联样式是否绘制项目图标。共享视觉槽位据此接入 `.oc-project-icon` 契约，
 * 因此它们不需要知道条目来自哪种文件格式。
 */
export function isProjectIconStyle(style: Readonly<Record<string, string>> | undefined): boolean {
  return projectIconRenderers.includes(style?.['--oc-project-icon-renderer'] as ProjectIconRenderer)
}

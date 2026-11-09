/** 导出路径里的变量：写法与卡片绑定一致（`{{project:name}}`），展开成普通文本后再规划。 */
import type { CardDocument, CardFaceKey, CardInstanceRecord } from '../../entities/card/model'
import { escapeMarkupText } from '../card-rendering/markup/cardMarkupSerializer'
import type { ExportPaper, ExportProfile, ExportRule } from '../workspace/model/projectExportProfile'

export const EXPORT_VARIABLE_KEYS = ['project:name', 'project:version', 'project:author', 'profile:name', 'date', 'time'] as const
/** 只有图片的单个文件名能用：这些值每个文件都不同。`document:`、`card:` 也接受其他字段，这里列的是补全候选。 */
/** 只有页面信息能用：每页一个值。 */
export const EXPORT_PAGE_VARIABLE_KEYS = ['page', 'pages'] as const
export const EXPORT_FILE_VARIABLE_KEYS = ['document:file', 'document:name', 'card:name', 'card:amount', 'face:key'] as const

export type ExportProjectInfo = { name: string; version: string; author: string }
type VariableValues = Readonly<Record<string, string>>

const VARIABLE_TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g

export function sanitizeSegment(value: string, fallback: string): string {
  const sanitized = value.trim()
    .replace(/\.ocdocument$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[. _]+$/g, '')
  return sanitized || fallback
}

/** 变量值只能占路径的一段，项目名里的斜杠不能把文件带进别的文件夹。未知变量原样留下，由调用方报告。 */
export function expandExportTemplate(
  template: string,
  values: VariableValues,
  format: (value: string) => string = value => sanitizeSegment(value, ''),
): string {
  return template.replace(VARIABLE_TOKEN, (token, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? format(values[key]!) : token)
}

/** 页面信息是富文本：值要转义，不用当路径处理。 */
export function expandExportRichText(content: string, values: VariableValues): string {
  return expandExportTemplate(content, values, escapeMarkupText)
}

/** 展开之后还留着的变量就是不认识的。 */
export function expandExportRegions(regions: ExportPaper['regions'], values: VariableValues): ExportPaper['regions'] {
  return Object.fromEntries(Object.entries(regions).map(([key, region]) => [key, { ...region, content: expandExportRichText(region.content, values) }]))
}

export function findExportVariable(template: string): string | null {
  return template.match(VARIABLE_TOKEN)?.[0] ?? null
}

function createVariableValues(project: ExportProjectInfo, profileName: string, now: Date): VariableValues {
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    'project:name': project.name,
    'project:version': project.version,
    'project:author': project.author,
    'profile:name': profileName,
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    // 文件名里不能有冒号。
    time: `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`,
  }
}

export function expandExportVariables(profile: ExportProfile, project: ExportProjectInfo, now: Date): ExportProfile {
  const values = createVariableValues(project, profile.name, now)
  const { rule, output, watermark } = profile
  return {
    ...profile,
    watermark: { ...watermark, text: expandExportRichText(watermark.text, values) },
    output: { ...output, directory: expandExportTemplate(output.directory, values) },
    rule: {
      ...rule,
      fileName: expandExportTemplate(rule.fileName, values),
      ...(rule.kind === 'pdf' ? {
        paper: {
          ...rule.paper,
          regions: expandExportRegions(rule.paper.regions, values),
        },
      } : {}),
    } as ExportRule,
  }
}

function scalarFields(scope: string, source: object): [string, string][] {
  return Object.entries(source)
    .filter(([, value]) => (typeof value === 'string' && value !== '') || typeof value === 'number')
    .map(([key, value]) => [`${scope}:${key}`, String(value)])
}

/** `card:` 与卡片绑定同义：实例上有就用实例的，否则回到文档。 */
export function createExportFileVariables(
  document: CardDocument,
  instance: CardInstanceRecord | null,
  sourcePath: string,
  faceKey: CardFaceKey,
): VariableValues {
  return Object.fromEntries([
    ...scalarFields('document', document),
    ...scalarFields('card', document),
    ...scalarFields('card', instance ?? {}),
    ['document:file', sourcePath.split(/[\\/]/).pop() ?? sourcePath],
    ['face:key', faceKey],
  ])
}

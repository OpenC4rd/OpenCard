/** 把导出配置投影成 PropertyEditor 的扁平字段，并把字段改动写回配置。 */
import { findActiveBindingToken } from '../editor-runtime/model/bindingExpression'
import type {
  PropertyCompletionItem,
  PropertyCompletionProvider,
  PropertyEditorCategoryDefinition,
  PropertyEditorFieldDefinition,
  PropertyEditorInput,
} from '../../shared/ui/property-editor/propertyEditor.types'
import {
  createExportRegion,
  createExportRule,
  EXPORT_PAPER_SIZES,
  type ExportPageRegion,
  type ExportPaper,
  type ExportProfile,
  type ExportRegion,
  type ExportRule,
} from '../workspace/model/projectExportProfile'
import { matchExportDocuments } from './exportTask'
import { EXPORT_FILE_VARIABLE_KEYS, EXPORT_PAGE_VARIABLE_KEYS, EXPORT_VARIABLE_KEYS } from './exportVariables'

type Translate = (key: string, parameters?: Record<string, unknown>) => string
type Field = PropertyEditorFieldDefinition

const NUMBER_KEYS = new Set([
  'dpi', 'quality', 'width', 'height', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gapX', 'gapY', 'columns', 'rows',
])
const BOOLEAN_KEYS = new Set(['useAmount', 'cropMarks', 'openFolder'])

const CUSTOM_PRESET = 'custom'
const DPI_PRESETS: Readonly<Record<string, number>> = { draft: 150, standard: 300, print: 600 }

function layoutPreset(
  margin: number,
  gap: number,
  cropMarks: boolean,
  placement: ExportPaper['placement'] = 'center',
): Partial<ExportPaper> {
  return {
    marginTop: margin, marginRight: margin, marginBottom: margin, marginLeft: margin,
    gapX: gap, gapY: gap, columns: 0, rows: 0, placement, cropMarks,
  }
}
const LAYOUT_PRESETS: Readonly<Record<string, Partial<ExportPaper>>> = {
  standard: layoutPreset(10, 3, true),
  compact: layoutPreset(10, 0, true),
  distributed: layoutPreset(10, 0, true, 'distribute'),
}

/** 关着高级配置时藏起来的字段。清晰度和版面由枚举兜着，其余的算进 `countHiddenExportChanges`。 */
const ADVANCED_KEYS = [
  'dpi', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'gapX', 'gapY', 'columns', 'rows',
  'placement', 'duplex', 'cropMarks', 'conflict', 'errorPolicy',
  'watermark:angle', 'watermark:density', 'watermark:opacity', 'watermark:size', 'watermark:color',
]

/** 枚举不单独存，从实际参数反推：参数被单独改过就显示“自定义”，配置格式不用变。 */
function matchDpiPreset(dpi: number): string {
  return Object.keys(DPI_PRESETS).find(key => DPI_PRESETS[key] === dpi) ?? CUSTOM_PRESET
}

function matchLayoutPreset(paper: ExportPaper): string {
  return Object.keys(LAYOUT_PRESETS).find(key => Object.entries(LAYOUT_PRESETS[key]!)
    .every(([field, value]) => paper[field as keyof ExportPaper] === value)) ?? CUSTOM_PRESET
}

/** 藏起来却仍然生效、枚举又看不出来的改动，开关上要提示。 */
export function countHiddenExportChanges({ output, errorPolicy, rule }: ExportProfile): number {
  return Number(output.conflict !== 'replace') + Number(errorPolicy !== 'continue')
    + Number(rule.kind === 'pdf' && rule.faces === 'both' && rule.paper.duplex !== 'none')
    + (rule.kind === 'pdf' ? Object.values(rule.paper.regions).filter(region => region.content).length : 0)
}

export function createExportProfileCategories(t: Translate): ReadonlyMap<string, PropertyEditorCategoryDefinition> {
  return new Map<string, PropertyEditorCategoryDefinition>([
    ['content', { title: t('projectExport.sections.content'), icon: 'mdiCardsOutline' }],
    ['rule', { title: t('projectExport.sections.rule'), icon: 'mdiCogOutline' }],
    ['paper', { title: t('projectExport.paper.title'), icon: 'mdiFileOutline' }],
    ['pageInfo', { title: t('projectExport.sections.pageInfo'), icon: 'mdiFormatTextVariantOutline' }],
    ['watermark', { title: t('projectExport.sections.watermark'), icon: 'mdiFormatTextVariantOutline' }],
    ['output', { title: t('projectExport.sections.output'), icon: 'mdiFolder' }],
  ])
}

/**
 * 文件夹也是候选：选中后写成通配符，之后新建的卡会自动包含进去。
 * 换 provider 会让打开的补全重算，所以由调用方只建一次，内容每次现取。
 */
export function createExportDocumentProvider(
  source: () => { profile: ExportProfile | null; documents: readonly string[] },
  t: Translate,
): PropertyCompletionProvider {
  return ({ value }) => {
    const { profile, documents } = source()
    const folders = [...new Set(documents.flatMap((path) => {
      const segments = path.split('/').slice(0, -1)
      return segments.map((_, index) => `${segments.slice(0, index + 1).join('/')}/**/*.ocdocument`)
    }))]
    const search = value.trim().toLocaleLowerCase()
    const available = (pattern: string) => !profile?.documents.includes(pattern)
      && (!search || pattern.toLocaleLowerCase().includes(search))
    const item = (pattern: string, detail: string, icon: PropertyCompletionItem['icon']): PropertyCompletionItem =>
      ({ key: pattern, label: pattern, detail, icon, insertText: pattern })
    return {
      replaceStart: 0,
      replaceEnd: value.length,
      items: [
        ...folders.filter(available).map(pattern => item(pattern, t('projectExport.folderDocuments'), 'mdiFolder')),
        ...documents.filter(available).map(path => item(path, '.ocdocument', 'mdiCardsOutline')),
      ],
    }
  }
}

/** 只在 `{{` 里给候选：平时 Tab 和回车要留给输入框本身。 */
/** 与卡片绑定的补全同一约定：只替换括号里的表达式。富文本的绑定节点自己带括号，整段写进去会套两层。 */
function createVariableProvider(keys: readonly string[], t: Translate): PropertyCompletionProvider {
  return ({ value, cursor }) => {
    const token = findActiveBindingToken(value, cursor)
    if (!token) return null
    const search = token.body.trim().toLocaleLowerCase()
    const close = value.startsWith('}}', cursor) ? '' : '}}'
    return {
      replaceStart: token.bodyStart,
      replaceEnd: cursor,
      items: keys.filter(key => key.includes(search)).map(key => ({
        key, label: key, detail: t(`projectExport.variables.${key.replace(':', '_')}`), icon: 'mdiCodeBraces', insertText: `${key}${close}`,
      })),
    }
  }
}

/** `path` 给一次导出只有一个值的位置，`file` 给图片的单个文件名，`page` 给页面信息。 */
export function createExportVariableProviders(t: Translate) {
  return {
    path: createVariableProvider(EXPORT_VARIABLE_KEYS, t),
    file: createVariableProvider([...EXPORT_FILE_VARIABLE_KEYS, ...EXPORT_VARIABLE_KEYS], t),
    page: createVariableProvider([...EXPORT_PAGE_VARIABLE_KEYS, ...EXPORT_VARIABLE_KEYS], t),
  }
}

function flattenProfile({ name, documents, selection, errorPolicy, rule, output, watermark }: ExportProfile): Record<string, unknown> {
  const { kind, ...ruleValues } = rule
  const scalars = {
    name, selection, errorPolicy, kind, ...ruleValues, ...output,
    dpiPreset: matchDpiPreset(rule.dpi),
    ...(rule.kind === 'pdf' ? { ...rule.paper, layoutPreset: matchLayoutPreset(rule.paper) } : { quality: Math.round(rule.quality * 100) }),
  }
  return {
    ...Object.fromEntries(Object.entries({
      ...watermark, opacity: Math.round(watermark.opacity * 100),
    }).map(([key, value]) => [`watermark:${key}`, String(value)])),
    ...Object.fromEntries(Object.entries(scalars).filter(([key]) => key !== 'paper' && key !== 'regions').map(([key, value]) => [key, String(value)])),
    documents,
  }
}

export function createExportProfileInput(
  profile: ExportProfile,
  documents: readonly string[],
  busy: boolean,
  documentProvider: PropertyCompletionProvider,
  variableProviders: ReturnType<typeof createExportVariableProviders>,
  view: { advanced: boolean; region: ExportPageRegion },
  t: Translate,
): PropertyEditorInput {
  let order = 0
  const base = (category: string, titleKey: string) => ({
    title: t(`projectExport.${titleKey}`), category, order: order++,
    unremovable: true, resettable: false, allowRawStringEditor: false, isReadonly: busy,
  })
  const text = (category: string, titleKey: string, extra: { placeholder?: string } = {}): Field =>
    ({ ...base(category, titleKey), fieldType: 'string', ...extra })
  const choice = (
    category: string,
    titleKey: string,
    labels: Readonly<Record<string, string>>,
    presentation: 'select' | 'option-group' = 'select',
  ): Field => ({ ...base(category, titleKey), fieldType: 'string', options: Object.keys(labels), optionLabels: labels, presentation })
  const pathText = (
    category: string,
    titleKey: string,
    provider: PropertyCompletionProvider,
    extra: { placeholder?: string } = {},
  ): Field => ({ ...text(category, titleKey, extra), autoPairs: [{ open: '{{', close: '}}' }], completion: { provider } })
  const number = (category: string, titleKey: string, min: number, extra: { max?: number; step?: number; suffix?: string } = {}): Field =>
    ({ ...base(category, titleKey), fieldType: 'number', min, ...extra })
  const toggle = (category: string, titleKey: string): Field => ({ ...base(category, titleKey), fieldType: 'boolean' })
  const labels = (prefix: string, entries: Record<string, string>) =>
    Object.fromEntries(Object.entries(entries).map(([value, key]) => [value, t(`projectExport.${prefix}${key}`)]))
  /** “自定义”只是状态：参数没被单独改过时选它没有意义，所以只在匹配不上时才出现。 */
  const preset = (category: string, titleKey: string, keys: readonly string[], current: string): Field => choice(
    category, titleKey, labels(`${titleKey}s.`, Object.fromEntries([...keys, ...(current === CUSTOM_PRESET ? [CUSTOM_PRESET] : [])].map(key => [key, key]))),
  )

  const { rule } = profile
  const fields: Record<string, Field> = {
    name: text('content', 'name'),
    documents: {
      ...base('content', 'documents'),
      fieldType: 'string[]',
      placeholder: t('projectExport.searchDocuments'),
      tail: t('projectExport.matchedDocuments', { count: matchExportDocuments(profile.documents, documents).length }),
      completion: { provider: documentProvider },
    },
    selection: choice('content', 'selection', labels('', {
      'blueprint-and-instances': 'selectionAll', instances: 'selectionInstances', blueprint: 'selectionBlueprint',
    })),
    kind: choice('rule', 'rule', labels('', { images: 'ruleImages', pdf: 'rulePdf' }), 'option-group'),
    faces: choice('rule', 'faces', labels('', { front: 'facesFront', back: 'facesBack', both: 'facesBoth' })),
    dpiPreset: preset('rule', 'dpiPreset', Object.keys(DPI_PRESETS), matchDpiPreset(rule.dpi)),
    dpi: number('rule', 'dpi', 72, { step: 50, suffix: 'dpi' }),
  }

  if (rule.kind === 'images') {
    fields.fileName = pathText('rule', 'fileName', variableProviders.file)
    fields.format = choice('rule', 'format', { png: 'PNG', jpeg: 'JPEG' }, 'option-group')
    if (rule.format === 'jpeg') fields.quality = number('rule', 'jpegQuality', 10, { max: 100 })
  } else {
    fields.fileName = pathText('rule', 'fileName', variableProviders.path)
    fields.useAmount = toggle('rule', 'useAmount')
    const { paper } = rule
    fields.size = choice('paper', 'paper.size', {
      ...Object.fromEntries(Object.entries(EXPORT_PAPER_SIZES).map(([value, [width, height]]) =>
        [value, `${value.toUpperCase()} (${width} × ${height} mm)`])),
      custom: t('projectExport.paper.custom'),
    })
    if (paper.size === 'custom') {
      fields.width = number('paper', 'paper.width', 1, { suffix: 'mm' })
      fields.height = number('paper', 'paper.height', 1, { suffix: 'mm' })
    }
    fields.orientation = choice('paper', 'paper.orientation', labels('paper.', { portrait: 'portrait', landscape: 'landscape' }), 'option-group')
    fields.layoutPreset = preset('paper', 'layoutPreset', Object.keys(LAYOUT_PRESETS), matchLayoutPreset(paper))
    const gaps = paper.placement === 'distribute' ? [] : ['gapX', 'gapY']
    for (const key of ['marginTop', 'marginRight', 'marginBottom', 'marginLeft', ...gaps, 'columns', 'rows']) {
      fields[key] = number('paper', `paper.${key}`, 0, key === 'columns' || key === 'rows' ? {} : { suffix: 'mm' })
    }
    fields.placement = choice('paper', 'paper.placement', labels('paper.', { center: 'placementCenter', 'top-left': 'placementTopLeft', distribute: 'placementDistribute' }), 'option-group')
    if (rule.faces === 'both') {
      fields.duplex = choice('paper', 'paper.duplex', labels('paper.', {
        none: 'duplexNone', 'long-edge': 'duplexLongEdge', 'short-edge': 'duplexShortEdge',
      }))
    }
    fields.cropMarks = toggle('paper', 'paper.cropMarks')
  }

  const regionKey = `region:${view.region}`
  const region = rule.kind === 'pdf' ? rule.paper.regions[view.region] ?? createExportRegion(view.region) : null
  if (region && view.advanced) {
    // 选区域只是在看哪一块，只读时也要能切。
    fields.pageRegion = { ...base('pageInfo', 'pageRegion'), fieldType: 'anchorPosition', isReadonly: false }
    fields[`${regionKey}:content`] = { ...base('pageInfo', 'pageRegionContent'), fieldType: 'richText', completion: { provider: variableProviders.page } }
    if (!busy) {
      fields[`${regionKey}:textAlign`] = { ...base('pageInfo', 'pageRegionTextAlign'), fieldType: 'alignPosition' }
      fields[`${regionKey}:verticalAlign`] = { ...base('pageInfo', 'pageRegionVerticalAlign'), fieldType: 'verticalAlignPosition' }
    }
  }

  fields['watermark:enabled'] = toggle('watermark', 'watermark.enabled')
  if (profile.watermark.enabled) {
    fields['watermark:text'] = {
      ...base('watermark', 'watermark.text'),
      fieldType: 'richText',
      completion: { provider: rule.kind === 'pdf' ? variableProviders.page : variableProviders.file },
    }
    fields['watermark:angle'] = number('watermark', 'watermark.angle', -180, { max: 180, step: 15, suffix: '°' })
    fields['watermark:density'] = choice('watermark', 'watermark.density', labels('watermark.', {
      sparse: 'densitySparse', normal: 'densityNormal', dense: 'densityDense',
    }), 'option-group')
    fields['watermark:opacity'] = number('watermark', 'watermark.opacity', 0, { max: 100, step: 5, suffix: '%' })
    fields['watermark:size'] = number('watermark', 'watermark.size', 1, { suffix: 'mm' })
    fields['watermark:color'] = { ...base('watermark', 'watermark.color'), fieldType: 'color', allowAlpha: false }
  }

  fields.directory = pathText('output', 'outputDirectory', variableProviders.path, { placeholder: t('projectExport.outputDirectoryHint') })
  fields.conflict = choice('output', 'conflict', labels('', { replace: 'conflictReplace', skip: 'conflictSkip' }), 'option-group')
  fields.errorPolicy = choice('output', 'errorPolicy', labels('', { continue: 'errorContinue', stop: 'errorStop' }))
  fields.openFolder = toggle('output', 'openFolder')

  if (!view.advanced) ADVANCED_KEYS.filter(key => fields[key]).forEach((key) => { fields[key] = { ...fields[key]!, isHidden: true } })
  const record = {
    ...flattenProfile(profile),
    pageRegion: view.region,
    ...Object.fromEntries(Object.entries(region ?? {}).map(([field, value]) => [`${regionKey}:${field}`, value])),
  }
  return { key: 'export-profile', title: '', record, fields }
}

export function applyExportProfileField(profile: ExportProfile, key: string, raw: unknown): ExportProfile {
  const { rule } = profile
  if (key === 'documents') return { ...profile, documents: (raw as string[]).filter(path => path.trim()) }
  if (key === 'kind') {
    if (raw === rule.kind) return profile
    const next = createExportRule(raw as ExportRule['kind'], raw === 'pdf' ? profile.name : undefined)
    return { ...profile, rule: { ...next, dpi: rule.dpi, faces: rule.faces } }
  }

  if (key.startsWith('watermark:')) {
    const field = key.slice('watermark:'.length)
    const value = typeof profile.watermark[field as keyof ExportProfile['watermark']] === 'number' ? Number(raw) : String(raw)
    if (typeof value === 'number' && (String(raw).trim() === '' || !Number.isFinite(value))) return profile
    const watermark = field === 'enabled' ? { enabled: raw === 'true' }
      : field === 'opacity' ? { opacity: (value as number) / 100 }
        : { [field]: value }
    return { ...profile, watermark: { ...profile.watermark, ...watermark } }
  }
  if (key.startsWith('region:')) {
    if (rule.kind !== 'pdf') return profile
    const [, region, field] = key.split(':') as [string, ExportPageRegion, keyof ExportRegion]
    const current = rule.paper.regions[region] ?? createExportRegion(region)
    const regions = { ...rule.paper.regions, [region]: { ...current, [field]: String(raw) } }
    return { ...profile, rule: { ...rule, paper: { ...rule.paper, regions } } }
  }
  if (key === 'dpiPreset') {
    const dpi = DPI_PRESETS[String(raw)]
    return dpi ? { ...profile, rule: { ...rule, dpi } } : profile
  }
  if (key === 'layoutPreset') {
    const layout = LAYOUT_PRESETS[String(raw)]
    return layout && rule.kind === 'pdf' ? { ...profile, rule: { ...rule, paper: { ...rule.paper, ...layout } } } : profile
  }

  const value = BOOLEAN_KEYS.has(key) ? raw === 'true' : NUMBER_KEYS.has(key) ? Number(raw) : String(raw)
  if (typeof value === 'number' && (String(raw).trim() === '' || !Number.isFinite(value))) return profile
  if (key === 'name' || key === 'selection' || key === 'errorPolicy') return { ...profile, [key]: value }
  if (key === 'directory' || key === 'conflict' || key === 'openFolder') return { ...profile, output: { ...profile.output, [key]: value } }
  if (key === 'quality') return { ...profile, rule: { ...rule, quality: (value as number) / 100 } as ExportRule }
  // 铺满不用间距，清掉才不会让版面预设显示成“自定义”。
  if (rule.kind === 'pdf' && key === 'placement' && value === 'distribute') {
    return { ...profile, rule: { ...rule, paper: { ...rule.paper, placement: value, gapX: 0, gapY: 0 } } }
  }
  if (rule.kind === 'pdf' && key in rule.paper) {
    return { ...profile, rule: { ...rule, paper: { ...rule.paper, [key]: value } } }
  }
  return { ...profile, rule: { ...rule, [key]: value } as ExportRule }
}

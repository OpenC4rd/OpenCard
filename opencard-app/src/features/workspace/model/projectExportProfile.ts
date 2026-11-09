/**
 * 项目导出配置：选哪些文档、按什么规则导出、导到哪里。
 * 读取只做容忍：未知字段忽略，缺失或非法的字段取默认值，一条配置坏了不影响项目配置。
 */
import { isRecord } from '../../../shared/model/record'

/** 纵向尺寸，单位 mm。 */
export const EXPORT_PAPER_SIZES = {
  a3: [297, 420],
  a4: [210, 297],
  a5: [148, 210],
  b5: [176, 250],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
  tabloid: [279.4, 431.8],
} as const

export type ExportPaperSize = keyof typeof EXPORT_PAPER_SIZES | 'custom'
export type ExportSelection = 'instances' | 'blueprint' | 'blueprint-and-instances'
export type ExportFaces = 'front' | 'back' | 'both'

/** 四个边距把纸张切成的九块，命名与锚点一致：横向 l/c/r，纵向 t/c/b。 */
export const EXPORT_PAGE_REGIONS = ['lt', 'ct', 'rt', 'lc', 'cc', 'rc', 'lb', 'cb', 'rb'] as const
export type ExportPageRegion = (typeof EXPORT_PAGE_REGIONS)[number]

/** 对齐的取值和文字块相同。 */
export type ExportRegion = {
  content: string
  textAlign: 'start' | 'center' | 'end' | 'justify'
  verticalAlign: 'top' | 'center' | 'bottom'
}

/** 默认贴着所在的那一列，纵向居中。 */
export function createExportRegion(region: ExportPageRegion): ExportRegion {
  const textAlign = ({ l: 'start', c: 'center', r: 'end' } as const)[region[0] as 'l' | 'c' | 'r']
  return { content: '', textAlign, verticalAlign: 'center' }
}

/** 长度单位都是 mm；`columns`、`rows` 为 0 时按纸张放得下的数量计算。 */
export type ExportPaper = {
  size: ExportPaperSize
  width: number
  height: number
  orientation: 'portrait' | 'landscape'
  marginTop: number
  marginRight: number
  marginBottom: number
  marginLeft: number
  gapX: number
  gapY: number
  columns: number
  rows: number
  /** `distribute` 把剩余空间平均分到卡片之间，不使用 `gapX`、`gapY`。 */
  placement: 'center' | 'top-left' | 'distribute'
  cropMarks: boolean
  duplex: 'none' | 'long-edge' | 'short-edge'
  /** 每块区域要印的富文本，空着的区域不出现。 */
  regions: Partial<Record<ExportPageRegion, ExportRegion>>
}

export type ExportImagesRule = {
  kind: 'images'
  /** 每个文件各展开一次，可以用文档、卡片和卡面变量。 */
  fileName: string
  format: 'png' | 'jpeg'
  quality: number
  dpi: number
  faces: ExportFaces
}

export type ExportPdfRule = {
  kind: 'pdf'
  fileName: string
  dpi: number
  faces: ExportFaces
  /** 按实例的“数量”重复放置；关闭时每张卡一份。 */
  useAmount: boolean
  paper: ExportPaper
}

export type ExportRule = ExportImagesRule | ExportPdfRule

const WATERMARK_DENSITIES = ['sparse', 'normal', 'dense'] as const
export type ExportWatermarkDensity = (typeof WATERMARK_DENSITIES)[number]

export type ExportWatermark = {
  enabled: boolean
  /** 富文本，可以用导出变量和项目图标。 */
  text: string
  /** 顺时针角度。 */
  angle: number
  density: ExportWatermarkDensity
  /** 0 到 1。 */
  opacity: number
  /** 字号，单位 mm。 */
  size: number
  color: string
}

export type ExportProfile = {
  id: string
  name: string
  /** 项目相对路径或通配符，如 `cards/hero.ocdocument`、`cards/**\/*.ocdocument`。 */
  documents: string[]
  selection: ExportSelection
  rule: ExportRule
  output: {
    /** 项目相对路径；选到项目外时是绝对路径。 */
    directory: string
    conflict: 'replace' | 'skip'
    openFolder: boolean
  }
  errorPolicy: 'continue' | 'stop'
  watermark: ExportWatermark
  /** 这条配置是否展开高级字段。 */
  advanced: boolean
}

const ALL_DOCUMENTS_PATTERN = '**/*.ocdocument'
const DEFAULT_IMAGE_FILE_NAME = '{{document:file}}_{{card:name}}_{{face:key}}'

export function createExportWatermark(): ExportWatermark {
  return { enabled: false, text: '', angle: -30, density: 'normal', opacity: 0.15, size: 6, color: '#808080' }
}

export function createExportPaper(): ExportPaper {
  return {
    size: 'a4', width: 210, height: 297, orientation: 'portrait',
    marginTop: 10, marginRight: 10, marginBottom: 10, marginLeft: 10,
    gapX: 0, gapY: 0, columns: 0, rows: 0,
    placement: 'center', cropMarks: true, duplex: 'none', regions: {},
  }
}

export function createExportRule(
  kind: ExportRule['kind'],
  fileName = kind === 'pdf' ? 'cards' : DEFAULT_IMAGE_FILE_NAME,
): ExportRule {
  return kind === 'pdf'
    ? { kind, fileName, dpi: 300, faces: 'front', useAmount: true, paper: createExportPaper() }
    : { kind, fileName, format: 'png', quality: 0.92, dpi: 300, faces: 'both' }
}

export function createExportProfile(name: string): ExportProfile {
  return {
    id: crypto.randomUUID(),
    name,
    documents: [ALL_DOCUMENTS_PATTERN],
    selection: 'blueprint-and-instances',
    rule: createExportRule('images'),
    output: { directory: 'exports', conflict: 'replace', openFolder: true },
    errorPolicy: 'continue',
    watermark: createExportWatermark(),
    advanced: false,
  }
}

function option<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? value as T : fallback
}

function length(value: unknown, fallback: number, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function parseWatermark(value: unknown): ExportWatermark {
  const source = isRecord(value) ? value : {}
  const fallback = createExportWatermark()
  return {
    enabled: source.enabled === true,
    text: text(source.text, fallback.text),
    angle: typeof source.angle === 'number' && Number.isFinite(source.angle) ? source.angle : fallback.angle,
    density: option(source.density, WATERMARK_DENSITIES, fallback.density),
    opacity: Math.min(1, length(source.opacity, fallback.opacity)),
    size: length(source.size, fallback.size, 1),
    color: text(source.color, fallback.color),
  }
}

function parseRegions(value: unknown): ExportPaper['regions'] {
  const source = isRecord(value) ? value : {}
  return Object.fromEntries(EXPORT_PAGE_REGIONS.flatMap((region) => {
    const value = source[region]
    if (!isRecord(value)) return []
    const fallback = createExportRegion(region)
    return [[region, {
      content: text(value.content, ''),
      textAlign: option(value.textAlign, ['start', 'center', 'end', 'justify'], fallback.textAlign),
      verticalAlign: option(value.verticalAlign, ['top', 'center', 'bottom'], fallback.verticalAlign),
    }]]
  }))
}

function parsePaper(value: unknown): ExportPaper {
  const source = isRecord(value) ? value : {}
  const fallback = createExportPaper()
  return {
    size: option(source.size, [...Object.keys(EXPORT_PAPER_SIZES) as (keyof typeof EXPORT_PAPER_SIZES)[], 'custom'], fallback.size),
    width: length(source.width, fallback.width, 1),
    height: length(source.height, fallback.height, 1),
    orientation: option(source.orientation, ['portrait', 'landscape'], fallback.orientation),
    marginTop: length(source.marginTop, fallback.marginTop),
    marginRight: length(source.marginRight, fallback.marginRight),
    marginBottom: length(source.marginBottom, fallback.marginBottom),
    marginLeft: length(source.marginLeft, fallback.marginLeft),
    gapX: length(source.gapX, fallback.gapX),
    gapY: length(source.gapY, fallback.gapY),
    columns: Math.floor(length(source.columns, fallback.columns)),
    rows: Math.floor(length(source.rows, fallback.rows)),
    placement: option(source.placement, ['center', 'top-left', 'distribute'], fallback.placement),
    cropMarks: typeof source.cropMarks === 'boolean' ? source.cropMarks : fallback.cropMarks,
    duplex: option(source.duplex, ['none', 'long-edge', 'short-edge'], fallback.duplex),
    regions: parseRegions(source.regions),
  }
}

function parseRule(value: unknown): ExportRule {
  const source = isRecord(value) ? value : {}
  const dpi = length(source.dpi, 300, 72)
  const faces = option<ExportFaces>(source.faces, ['front', 'back', 'both'], source.kind === 'pdf' ? 'front' : 'both')
  if (source.kind === 'pdf') {
    return {
      kind: 'pdf', fileName: text(source.fileName, 'cards'), dpi, faces,
      useAmount: typeof source.useAmount === 'boolean' ? source.useAmount : true,
      paper: parsePaper(source.paper),
    }
  }
  return {
    kind: 'images', fileName: text(source.fileName, DEFAULT_IMAGE_FILE_NAME), format: option(source.format, ['png', 'jpeg'], 'png'),
    quality: Math.min(1, length(source.quality, 0.92, 0.1)), dpi, faces,
  }
}

export function parseExportProfiles(value: unknown): ExportProfile[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((source, index) => {
    const output = isRecord(source.output) ? source.output : {}
    return {
      id: text(source.id, '') || `profile-${index + 1}`,
      name: text(source.name, ''),
      documents: Array.isArray(source.documents)
        ? [...new Set(source.documents.filter((path): path is string => typeof path === 'string' && path.trim() !== ''))]
        : [],
      selection: option(source.selection, ['instances', 'blueprint', 'blueprint-and-instances'], 'blueprint-and-instances'),
      rule: parseRule(source.rule),
      output: {
        directory: text(output.directory, ''),
        conflict: option(output.conflict, ['replace', 'skip'], 'replace'),
        openFolder: output.openFolder !== false,
      },
      errorPolicy: option(source.errorPolicy, ['continue', 'stop'], 'continue'),
      watermark: parseWatermark(source.watermark),
      advanced: source.advanced === true,
    }
  })
}

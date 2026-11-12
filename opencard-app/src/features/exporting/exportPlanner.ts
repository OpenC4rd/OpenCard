import type { CardDocument, CardFaceKey, CardInstanceRecord } from '../../entities/card/model'
import { prepareCardRender } from '../card-rendering/renderPipeline'
import {
  type ExportDocumentSnapshot,
  type ExportPlan,
  type ExportPlanEntry,
  type ExportTaskValidationIssue,
  type PrepareExportTaskOptions,
  type ExportPreparationResult,
  matchExportDocuments,
  validateExportProfile,
} from './exportTask'
import { imposeCards, type ExportPdfPage, type ExportSheetCard } from './exportImposition'
import { createExportPageOverlay } from './exportPageRegions'
import { createExportFileVariables, expandExportRegions, expandExportRichText, expandExportTemplate, findExportVariable, sanitizeSegment } from './exportVariables'
import { createExportWatermarkChildren } from './exportWatermark'
import type { ExportFaces, ExportPdfRule } from '../workspace/model/projectExportProfile'

function joinPath(directory: string, fileName: string): string {
  const separator = directory.includes('\\') ? '\\' : '/'
  return `${directory.replace(/[\\/]+$/, '')}${separator}${fileName}`
}

function projectionsFor(snapshot: ExportDocumentSnapshot, selectionMode: PrepareExportTaskOptions['profile']['selection']): (CardInstanceRecord | null)[] {
  return [
    ...(selectionMode !== 'instances' ? [null] : []),
    ...(selectionMode !== 'blueprint' ? snapshot.document.instances as CardInstanceRecord[] : []),
  ]
}

const FACE_KEYS: Record<ExportFaces, readonly CardFaceKey[]> = {
  front: ['front'],
  back: ['back'],
  both: ['front', 'back'],
}

function uniqueFileName(stem: string, extension: string, used: Set<string>): string {
  let candidate = `${stem}.${extension}`
  let index = 2
  while (used.has(candidate.toLocaleLowerCase())) {
    candidate = `${stem}_${index}.${extension}`
    index += 1
  }
  used.add(candidate.toLocaleLowerCase())
  return candidate
}

function copiesOf(instance: CardInstanceRecord | null, rule: ExportPdfRule): number {
  if (!rule.useAmount || !instance) return 1
  const amount = Math.floor(Number(instance.amount))
  return Number.isFinite(amount) && amount >= 0 ? amount : 1
}

type PlannedCard = {
  instance: CardInstanceRecord | null
  document: CardDocument
  render: ExportPlanEntry['render']
  sourcePath: string
}

function planImages(
  options: PrepareExportTaskOptions,
  cards: readonly PlannedCard[],
  rule: Extract<PrepareExportTaskOptions['profile']['rule'], { kind: 'images' }>,
): ExportPlanEntry[] | ExportTaskValidationIssue {
  const used = new Set<string>()
  const entries: ExportPlanEntry[] = []
  for (const card of cards) {
    for (const faceKey of FACE_KEYS[rule.faces]) {
      const name = expandExportTemplate(rule.fileName, createExportFileVariables(card.document, card.instance, card.sourcePath, faceKey))
      const token = findExportVariable(name)
      if (token) return { code: 'unknown-variable', path: token }
      const fileName = uniqueFileName(sanitizeSegment(name, 'card'), rule.format === 'jpeg' ? 'jpg' : 'png', used)
      entries.push({ sourcePath: card.sourcePath, outputPath: joinPath(options.profile.output.directory, fileName), faceKey, render: card.render })
    }
  }
  return entries
}

/** 图片没有整页叠加层，水印直接铺进卡面；变量按卡面各展开一次。 */
function withImageWatermark(
  snapshot: ExportDocumentSnapshot,
  instance: CardInstanceRecord | null,
  profile: PrepareExportTaskOptions['profile'],
): CardDocument | ExportTaskValidationIssue {
  const { document, sourcePath } = snapshot
  if (profile.rule.kind !== 'images' || !profile.watermark.enabled) return document
  const width = Number.parseFloat(document.width)
  const height = Number.parseFloat(document.height)
  const faces = { ...document.faces }
  for (const faceKey of FACE_KEYS[profile.rule.faces]) {
    const text = expandExportRichText(profile.watermark.text, createExportFileVariables(document, instance, sourcePath, faceKey))
    const token = findExportVariable(text)
    if (token) return { code: 'unknown-variable', path: token }
    faces[faceKey] = {
      ...faces[faceKey],
      children: [...faces[faceKey].children, ...createExportWatermarkChildren({ ...profile.watermark, text }, width, height)],
    }
  }
  return { ...document, faces }
}

function planPdf(
  options: PrepareExportTaskOptions,
  cards: readonly PlannedCard[],
  rule: ExportPdfRule,
): Pick<ExportPlan, 'entries' | 'pdf'> | ExportTaskValidationIssue {
  const entries: ExportPlanEntry[] = []
  const outputPath = joinPath(options.profile.output.directory, `${sanitizeSegment(rule.fileName, 'cards')}.pdf`)
  const place = (card: PlannedCard, faceKey: CardFaceKey): ExportSheetCard => {
    const face = card.render.document.faces[faceKey]
    entries.push({ sourcePath: card.sourcePath, outputPath, faceKey, render: card.render })
    const bleed = face.bleed ?? 0
    return { key: entries.length - 1, width: face.width + bleed * 2, height: face.height + bleed * 2, bleed }
  }
  const printed = cards.flatMap(card => Array<PlannedCard>(copiesOf(card.instance, rule)).fill(card))
  const duplex = rule.faces === 'both' && rule.paper.duplex !== 'none'
  const fronts = printed.flatMap(card => (duplex ? ['front' as const] : FACE_KEYS[rule.faces]).map(face => place(card, face)))
  const backs = duplex ? printed.map(card => place(card, 'back')) : null
  if (fronts.length === 0) return { code: 'empty-plan' }
  const pages = imposeCards(rule.paper, fronts, backs)
  if (!pages) return { code: 'paper-too-small' }

  const finished: ExportPdfPage[] = []
  for (const [index, page] of pages.entries()) {
    const values = { page: String(index + 1), pages: String(pages.length) }
    const regions = expandExportRegions(rule.paper.regions, values)
    const watermark = { ...options.profile.watermark, text: expandExportRichText(options.profile.watermark.text, values) }
    const token = [...Object.values(regions).map(region => region.content), watermark.enabled ? watermark.text : '']
      .map(findExportVariable).find(Boolean)
    if (token) return { code: 'unknown-variable', path: token }
    const overlay = createExportPageOverlay(regions, watermark, rule.paper, page)
    if (!overlay) {
      finished.push(page)
      continue
    }
    entries.push({
      sourcePath: options.profile.name, outputPath, faceKey: 'front',
      render: prepareCardRender({
        document: overlay, instance: null, sourceFilePath: null,
        resourceRootPath: options.environment.projectResourceEnvironment?.rootPath ?? null,
        environment: options.environment,
      }),
    })
    finished.push({ ...page, placements: [...page.placements, { entryIndex: entries.length - 1, x: 0, y: 0, width: page.width, height: page.height }] })
  }
  return { entries, pdf: { outputPath, pages: finished } }
}

export async function prepareExportTask(options: PrepareExportTaskOptions): Promise<ExportPreparationResult> {
  const { profile } = options
  const issues = validateExportProfile(profile)
  if (issues.length > 0) return { ok: false, issues }

  const documentPaths = matchExportDocuments(profile.documents, await options.source.list())
  const snapshots: ExportDocumentSnapshot[] = []
  const loadIssues: ExportTaskValidationIssue[] = []
  for (const path of documentPaths) {
    try {
      snapshots.push(await options.source.load(path))
    } catch (error) {
      loadIssues.push({
        code: 'document-unavailable',
        path,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (loadIssues.length > 0) return { ok: false, issues: loadIssues }

  const cards: PlannedCard[] = []
  const planningIssues: ExportTaskValidationIssue[] = []
  for (const snapshot of snapshots) {
    try {
      for (const instance of projectionsFor(snapshot, profile.selection)) {
        const document = withImageWatermark(snapshot, instance, profile)
        if ('code' in document) {
          planningIssues.push(document)
          break
        }
        cards.push({
          instance,
          document: snapshot.document,
          sourcePath: snapshot.sourcePath,
          render: prepareCardRender({
            document,
            instance,
            resourceRootPath: snapshot.resourceRootPath,
            sourceFilePath: snapshot.sourceFilePath,
            environment: options.environment,
          }),
        })
      }
    } catch (error) {
      planningIssues.push({
        code: 'document-unavailable',
        path: snapshot.sourcePath,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (planningIssues.length > 0) return { ok: false, issues: planningIssues }

  const outputDirectory = profile.output.directory
  if (profile.rule.kind === 'pdf') {
    const planned = planPdf(options, cards, profile.rule)
    if ('code' in planned) return { ok: false, issues: [planned] }
    return { ok: true, plan: { profile, outputDirectory, ...planned } }
  }
  const entries = planImages(options, cards, profile.rule)
  if ('code' in entries) return { ok: false, issues: [entries] }
  if (entries.length === 0) return { ok: false, issues: [{ code: 'empty-plan' }] }
  return { ok: true, plan: { profile, entries, outputDirectory } }
}

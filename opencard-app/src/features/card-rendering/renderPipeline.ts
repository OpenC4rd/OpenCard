import { applyInstance } from '../../entities/card/instance'
import type { CardDocument, CardInstanceRecord } from '../../entities/card/model'
import type { ProjectInformation, ProjectRemoteResourcePolicy } from '../workspace/model/projectMetadata'
import type { ProjectIconCatalog, ProjectIconDimensionReader } from '../workspace/services/projectIconCatalog'
import type { ProjectResourceEnvironment, ProjectResourceScopeMap } from '../workspace/services/projectResourceEnvironment'
import { createCardRenderResourceContext, type CardRenderResourceContext } from './cardRenderResources'
import type { CardPipelineIssue } from './cardPipelineIssue'
import { prepareRichText, type PreparedRichTextCatalog } from './prepareRichText'
import { parseRenderDocument } from './renderParser'
import type { RenderReadyCardDocument } from './render.types'
import { resolveReferences } from './resolveCardBindings'
import { validateRenderResources } from './validateRenderResources'
import { materializeCustomBlocks, type CustomBlockSourceCatalog } from './customBlockRuntime'

export type RenderPipelineResult = {
  document: RenderReadyCardDocument
  issues: CardPipelineIssue[]
  richText?: PreparedRichTextCatalog
  resourceScopes?: ProjectResourceScopeMap
}

export type RenderPipelineContext = {
  project?: Readonly<ProjectInformation> | null
  dictionary?: Readonly<Record<string, string>> | null
  projectResourceEnvironment?: ProjectResourceEnvironment
}

export type CardRenderEnvironment = RenderPipelineContext & {
  remoteResourcePolicy?: ProjectRemoteResourcePolicy
  resolveRemoteResource?: (url: string) => string | null
  projectIconCatalog: ProjectIconCatalog
  /** Reads an icon's size, which is what asks for it and re-renders the consumer that read it. */
  resolveIconDimensions?: ProjectIconDimensionReader
  resolveFontFamily?: (references: string) => string
  customBlockCatalog?: CustomBlockSourceCatalog
  customBlockLimits?: { maxDepth: number, maxNodes: number }
}

export type CardRenderRequest = {
  document: CardDocument
  instance: CardInstanceRecord | null
  resourceRootPath: string | null
  sourceFilePath: string | null
  environment: Readonly<CardRenderEnvironment>
}

export type PreparedCardRender = RenderPipelineResult & { resources: CardRenderResourceContext }

export function prepareCardRender(request: CardRenderRequest): PreparedCardRender {
  const projected = applyInstance(request.document, request.instance)
  const materialized = materializeCustomBlocks(projected, {
    catalog: request.environment.customBlockCatalog ?? { resolve: () => null },
    maxDepth: request.environment.customBlockLimits?.maxDepth,
    maxNodes: request.environment.customBlockLimits?.maxNodes,
  })
  const resolved = resolveReferences(materialized.document, {
    currentCard: request.instance,
    project: request.environment.project,
    dictionary: request.environment.dictionary,
  })
  const resourceScopes: ProjectResourceScopeMap = new Map()
  const richText = prepareRichText({
    document: resolved.document,
    currentCard: request.instance,
    project: request.environment.project,
    dictionary: request.environment.dictionary,
    hostEnvironment: request.environment.projectResourceEnvironment,
    resourceScopes,
  })
  const parsed = parseRenderDocument(resolved.document, {
    instanceId: request.instance?.id ?? null,
    customBlocks: materialized.descriptors,
  })
  const resources = createCardRenderResourceContext({
    resourceRootPath: request.resourceRootPath,
    sourceFilePath: request.sourceFilePath,
    hostEnvironment: request.environment.projectResourceEnvironment,
    packageEnvironments: request.environment.projectResourceEnvironment?.packageEnvironments,
    remoteResourcePolicy: request.environment.remoteResourcePolicy,
    resolveRemoteResource: request.environment.resolveRemoteResource,
    projectIconCatalog: request.environment.projectIconCatalog,
    resolveIconDimensions: request.environment.resolveIconDimensions,
    resourceScopes,
    richText: richText.catalog,
    resolveFontFamily: request.environment.resolveFontFamily,
    bindingProject: request.environment.project,
    bindingDictionary: request.environment.dictionary,
  })
  const resourceIssues = validateRenderResources(
    parsed.document,
    request.environment.remoteResourcePolicy,
    request.instance?.id ?? null,
    resources,
  )
  const result: RenderPipelineResult = {
    document: parsed.document,
    issues: [...resolved.issues, ...parsed.issues, ...resourceIssues, ...richText.issues],
    richText: richText.catalog,
    resourceScopes,
  }
  return {
    ...result,
    resources,
  }
}

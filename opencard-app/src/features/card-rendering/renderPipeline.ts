import { computed } from 'vue'
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
  remoteResourceStatus?: (url: string) => 'pending' | 'ready' | 'failed' | 'blocked'
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
  }, request.environment.projectResourceEnvironment?.namespace ?? 'project')
  const resolved = resolveReferences(materialized.document, {
    currentCard: request.instance,
    project: request.environment.project,
    dictionary: request.environment.dictionary,
  })
  const resourceScopes = materialized.resourceScopes
  const richText = prepareRichText({
    document: resolved.document,
    currentCard: request.instance,
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
    remoteResourceStatus: request.environment.remoteResourceStatus,
    projectIconCatalog: request.environment.projectIconCatalog,
    resolveIconDimensions: request.environment.resolveIconDimensions,
    resourceScopes,
    richText: richText.catalog,
    resolveFontFamily: request.environment.resolveFontFamily,
    bindingProject: request.environment.project,
    bindingDictionary: request.environment.dictionary,
  })
  const issues = computed(() => [...resolved.issues, ...parsed.issues, ...richText.issues, ...validateRenderResources(
    parsed.document,
    request.environment.remoteResourcePolicy,
    request.instance?.id ?? null,
    resources,
  )])
  return {
    document: parsed.document,
    get issues() { return issues.value },
    richText: richText.catalog,
    resourceScopes,
    resources,
  }
}

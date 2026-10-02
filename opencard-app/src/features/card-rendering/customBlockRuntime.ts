import {
  createSimpleContainerBlock,
  getBlockProperty,
  type CardBlock,
  type CardDocument,
  type CustomBlock,
  type FlowContainerBlock,
  type SimpleContainerBlock,
} from '../../entities/card/model'
import { toRaw } from 'vue'
import {
  getTypePropertyEditorSchema,
  resolvePropertyEditorSchema,
  type EditorPropertyDefinition,
} from '../../entities/card/schema'
import { isRecord } from '../../shared/model/record'
import { packageScopeRoots, resolveProjectResourcePackage, type ProjectResourceEnvironment } from '../workspace/services/projectResourceEnvironment'
import { parseResourceReference } from '../workspace/services/resourceReference'
import { formatPackageCoordinate, type PackageQualifier } from '../workspace/model/packageCoordinate'
import { resolveResourcePath } from '../workspace/model/scopedResourcePath'

export const CUSTOM_BLOCK_MAX_DEPTH = 32
export const CUSTOM_BLOCK_MAX_NODES = 10_000

export type OcBlockDocument = {
  type: 'ocblock'
  block: SimpleContainerBlock | FlowContainerBlock
  publicFields: Readonly<Record<string, EditorPropertyDefinition>>
}

export type CustomBlockSource = {
  scope: string
  document: OcBlockDocument
}

export type CustomBlockSourceCatalog = {
  resolve: (source: string, scope: string) => CustomBlockSource | null
}

function relativeSourcePath(root: string, target: string): string | null {
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedTarget = target.replace(/\\/g, '/')
  const comparableRoot = normalizedRoot.toLocaleLowerCase()
  const comparableTarget = normalizedTarget.toLocaleLowerCase()
  if (!comparableTarget.startsWith(`${comparableRoot}/`)) return null
  return normalizedTarget.slice(normalizedRoot.length + 1)
}

export function createProjectCustomBlockCatalog(
  environment: ProjectResourceEnvironment,
): CustomBlockSourceCatalog {
  const scopes = new Map<string, ProjectResourceEnvironment>([[environment.namespace, environment]])
  for (const child of environment.packageEnvironments?.values() ?? []) scopes.set(child.namespace, child)

  function packageEnvironment(qualifier: PackageQualifier | undefined): ProjectResourceEnvironment | null {
    if (!qualifier) return null
    const pkg = resolveProjectResourcePackage(environment, qualifier)
    return pkg ? environment.packageEnvironments?.get(formatPackageCoordinate(pkg.coordinate)) ?? null : null
  }

  function resolveInScope(source: string, current: ProjectResourceEnvironment): CustomBlockSource | null {
    const parsed = parseResourceReference(source)
    const reference = parsed.reference
    if (reference?.kind === 'block') {
      const target = reference.scope === 'current'
        ? current
        : reference.scope === 'host'
          ? environment
          : packageEnvironment(reference.qualifier)
      const entry = target?.customBlockRegistry?.[reference.key]
      return target && entry ? resolveInScope(entry.source, target) : null
    }

    const scopeRoot = current.rootPath
    const projectRoot = environment.rootPath
    if (!scopeRoot || !projectRoot) return null
    const resolved = resolveResourcePath({
      scopeRootPath: scopeRoot,
      projectRootPath: projectRoot,
      reference: source,
      packageRoots: packageScopeRoots(environment.packages),
    })
    if (!resolved.ok) return null
    const target = reference?.scope === 'host'
      ? environment
      : reference?.scope === 'package'
        ? packageEnvironment(reference.qualifier)
        : current
    if (!target?.rootPath) return null
    const relative = relativeSourcePath(target.rootPath, resolved.value)
      const document = relative ? target.customBlockSources?.get(relative) : undefined
    return document ? { scope: target.namespace, document } : null
  }

  return {
    resolve(source, scope) {
      return resolveInScope(source, scopes.get(scope) ?? environment)
    },
  }
}

export type CustomBlockRuntimeState = 'ready' | 'source-unavailable' | 'limited'

export type CustomBlockRuntimeDescriptor = {
  id: string
  source: string
  state: CustomBlockRuntimeState
}

export type MaterializeCustomBlocksOptions = {
  catalog: CustomBlockSourceCatalog
  maxDepth?: number
  maxNodes?: number
}

export type MaterializeCustomBlocksResult = {
  document: CardDocument
  descriptors: ReadonlyMap<string, CustomBlockRuntimeDescriptor>
}

const publicFieldForbidden = new Set(['type', 'id', 'children', 'additionalfielddefinition'])

function clone<T>(value: T): T {
  function unwrap(input: unknown): unknown {
    const raw = toRaw(input as object)
    if (Array.isArray(raw)) return raw.map(unwrap)
    if (raw && typeof raw === 'object') {
      return Object.fromEntries(Object.entries(raw).map(([key, entry]) => [key, unwrap(entry)]))
    }
    return raw
  }
  return structuredClone(unwrap(value)) as T
}

function normalizePublicFields(
  value: unknown,
  root: SimpleContainerBlock | FlowContainerBlock,
): Readonly<Record<string, EditorPropertyDefinition>> {
  if (!isRecord(value)) return {}
  const native = resolvePropertyEditorSchema(root as unknown as Record<string, unknown>).fields
  const result: Record<string, EditorPropertyDefinition> = {}
  for (const [fieldKey, candidate] of Object.entries(value)) {
    if (publicFieldForbidden.has(fieldKey.toLocaleLowerCase())
      || !Object.prototype.hasOwnProperty.call(root, fieldKey)
      || !isRecord(candidate)) continue
    const base = native[fieldKey]
    if (!base || base.nonOverridable) continue
    result[fieldKey] = { ...base, ...candidate } as EditorPropertyDefinition
  }
  return result
}

function normalizeOcBlock(value: unknown): OcBlockDocument | null {
  if (!isRecord(value) || value.type !== 'ocblock' || !isRecord(value.block)) return null
  const type = value.block.type
  if (type !== 'simple-container-block' && type !== 'flow-container-block') return null
  const block = clone(value.block) as SimpleContainerBlock | FlowContainerBlock
  return {
    type: 'ocblock',
    block,
    publicFields: normalizePublicFields(value.publicFields, block),
  }
}

export function parseOcBlock(value: unknown): OcBlockDocument | null {
  return normalizeOcBlock(value)
}

export function resolveCustomBlockPublicFields(
  block: CustomBlock,
  catalog: CustomBlockSourceCatalog | undefined,
  scope = 'project',
): Readonly<Record<string, EditorPropertyDefinition>> {
  if (!catalog) return {}
  return catalog.resolve(block.source, scope)?.document.publicFields ?? {}
}

export function createOcBlockDocument(
  block: SimpleContainerBlock | FlowContainerBlock,
  publicFields: Readonly<Record<string, EditorPropertyDefinition>>,
): OcBlockDocument {
  return {
    type: 'ocblock',
    block: clone(block),
    publicFields: clone(publicFields),
  }
}

export function createOcBlockPublicFields(
  block: SimpleContainerBlock | FlowContainerBlock,
): Readonly<Record<string, EditorPropertyDefinition>> {
  const fields = resolvePropertyEditorSchema(block as unknown as Record<string, unknown>).fields
  return Object.fromEntries(Object.entries(fields).filter(([fieldKey, definition]) => (
    Object.prototype.hasOwnProperty.call(block, fieldKey)
      && !publicFieldForbidden.has(fieldKey.toLocaleLowerCase())
      && !definition.nonOverridable
  )))
}

export function serializeOcBlock(document: OcBlockDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`
}

function runtimeId(prefix: string, id: string, fallback: string): string {
  const local = id.trim() || fallback
  return prefix ? `${prefix}/${local}` : local
}

function fallbackContainer(block: CustomBlock): SimpleContainerBlock {
  const fallback = createSimpleContainerBlock({
    id: block.id,
    name: getBlockProperty<string>(block, 'name') ?? 'Custom Block',
  })
  const schema = getTypePropertyEditorSchema('simple-container-block')
  const source = block as unknown as Record<string, unknown>
  for (const fieldKey of Object.keys(schema)) {
    if (fieldKey === 'children' || fieldKey === 'type' || fieldKey === 'id') continue
    if (Object.prototype.hasOwnProperty.call(source, fieldKey)) {
      ;(fallback as unknown as Record<string, unknown>)[fieldKey] = source[fieldKey]
    }
  }
  return fallback
}

type MaterializeState = {
  readonly catalog: CustomBlockSourceCatalog
  readonly maxDepth: number
  readonly maxNodes: number
  nodes: number
  descriptors: Map<string, CustomBlockRuntimeDescriptor>
}

function materializeBlock(
  block: CardBlock,
  scope: string,
  prefix: string,
  depth: number,
  state: MaterializeState,
): CardBlock {
  if (state.nodes >= state.maxNodes) {
    if (block.type === 'custom-block') {
      const id = prefix ? runtimeId(prefix, block.id, 'custom-block') : block.id
      state.descriptors.set(id, { id, source: block.source, state: 'limited' })
      return fallbackContainer({ ...block, id })
    }
    return clone(block)
  }
  state.nodes += 1

  if (block.type === 'custom-block') {
    const customId = prefix ? runtimeId(prefix, block.id, 'custom-block') : block.id
    const source = state.catalog.resolve(block.source, scope)
    if (!source) {
      const fallback = fallbackContainer({ ...block, id: customId })
      state.descriptors.set(customId, { id: customId, source: block.source, state: 'source-unavailable' })
      return fallback
    }
    if (depth >= state.maxDepth) {
      const fallback = fallbackContainer({ ...block, id: customId })
      state.descriptors.set(customId, { id: customId, source: block.source, state: 'limited' })
      return fallback
    }

    const template = clone(source.document.block)
    const next = {
      ...template,
      id: customId,
      name: getBlockProperty<string>(block, 'name')?.trim() || getBlockProperty<string>(template, 'name'),
    } as unknown as SimpleContainerBlock | FlowContainerBlock
    const sourceValues = block as unknown as Record<string, unknown>
    const publicFields = source.document.publicFields
    for (const fieldKey of Object.keys(publicFields)) {
      if (Object.prototype.hasOwnProperty.call(sourceValues, fieldKey)) {
        ;(next as unknown as Record<string, unknown>)[fieldKey] = clone(sourceValues[fieldKey])
      }
    }
    state.descriptors.set(customId, { id: customId, source: block.source, state: 'ready' })
    return materializeContainer(next, source.scope, customId, depth + 1, state, false)
  }

  if (block.type !== 'simple-container-block' && block.type !== 'flow-container-block') {
    return prefix ? { ...clone(block), id: runtimeId(prefix, block.id, 'block') } : clone(block)
  }
  return materializeContainer(block, scope, prefix, depth, state, Boolean(prefix))
}

function materializeContainer<T extends SimpleContainerBlock | FlowContainerBlock>(
  block: T,
  scope: string,
  prefix: string,
  depth: number,
  state: MaterializeState,
  rewriteSelf: boolean,
): T {
  const result = clone(block)
  if (rewriteSelf && prefix) result.id = runtimeId(prefix, block.id, 'container')
  result.children = []
  for (const [index, child] of block.children.entries()) {
    if (state.nodes >= state.maxNodes) break
    const childPrefix = prefix
    const childId = childPrefix ? runtimeId(childPrefix, child.block.id, `child-${index}`) : child.block.id
    const nextBlock = materializeBlock(child.block, scope, childPrefix, depth, state)
    const nextLocation = clone(child.location)
    if (childPrefix) nextLocation.id = runtimeId(childPrefix, child.location.id, `location-${index}`)
    result.children.push({ block: { ...nextBlock, id: nextBlock.id || childId }, location: nextLocation } as never)
  }
  return result
}

export function materializeCustomBlocks(
  document: CardDocument,
  options: MaterializeCustomBlocksOptions,
  scope = 'project',
): MaterializeCustomBlocksResult {
  const state: MaterializeState = {
    catalog: options.catalog,
    maxDepth: options.maxDepth ?? CUSTOM_BLOCK_MAX_DEPTH,
    maxNodes: options.maxNodes ?? CUSTOM_BLOCK_MAX_NODES,
    nodes: 0,
    descriptors: new Map(),
  }
  const nextDocument = clone(document)
  for (const face of Object.values(nextDocument.faces)) {
    face.children = face.children.map((child) => ({
      location: clone(child.location),
      block: materializeBlock(child.block, scope, '', 0, state),
    }))
  }
  return { document: nextDocument, descriptors: state.descriptors }
}

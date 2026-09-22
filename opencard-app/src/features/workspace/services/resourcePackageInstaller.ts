import { invoke } from '@tauri-apps/api/core'
import { normalizeResourcePackageManifest, resolveInstalledResourcePackageRootPath, serializeResourcePackageManifest, type ResourcePackageManifest } from '../model/resourcePackage'
import { parseProjectFontRegistryText, projectFontSources } from '../model/projectFontRegistry'
import { parseProjectIconRegistryText } from '../model/projectIconRegistry'
import { resolveResourcePath } from '../model/scopedResourcePath'

type NativeInspection = { manifestJson: string; contentHash: string; existingManifestJson: string | null; existingFingerprint: string | null; entryCount: number; unpackedBytes: number; entryPaths: string[]; fontsJson: string | null; iconsJson: string | null }
type NativeInstalledInspection = { exists: boolean; manifestJson: string | null; contentHash: string | null; entryPaths: string[]; fontsJson: string | null; iconsJson: string | null }
export type ResourcePackagePreview = { manifest: ResourcePackageManifest; contentHash: string; existingManifest: ResourcePackageManifest | null; existingFingerprint: string | null; targetPath: string; projectRootPath: string; entryCount: number; unpackedBytes: number; sourcePath: string }
export type ResourcePackageInstallResult = { manifest: ResourcePackageManifest; targetPath: string; replaced: boolean; unchanged: boolean; fingerprint: string }
export type ResourcePackageInstallDecision = 'install' | 'unchanged' | 'replace'
export type ResourcePackageCheckResult = {
  readonly status: 'ok' | 'missing' | 'version' | 'hash' | 'invalid'
  readonly manifest?: ResourcePackageManifest
  readonly message?: string
}

export function decideResourcePackageInstallation(next: ResourcePackageManifest, existing: ResourcePackageManifest | null): ResourcePackageInstallDecision {
  if (!existing) return 'install'
  return existing.version === next.version ? 'unchanged' : 'replace'
}

function projectManifest(json: string): ResourcePackageManifest {
  let value: unknown
  try { value = JSON.parse(json) } catch { throw new Error('Invalid package manifest JSON') }
  const normalized = normalizeResourcePackageManifest(value)
  if (normalized.issues.length) throw new Error(`Invalid package manifest: ${normalized.issues.map(issue => `${issue.path}: ${issue.message}`).join('; ')}`)
  return normalized.manifest
}

function validateProjection(native: NativeInspection, manifest: ResourcePackageManifest): void {
  const paths = new Set(native.entryPaths.map(path => path.toLocaleLowerCase()))
  const fonts = native.fontsJson ? parseProjectFontRegistryText(native.fontsJson) : {}
  if (native.fontsJson && !fonts) throw new Error('Invalid font registry in package')
  const families = fonts?.families ?? []
  const compositions = fonts?.compositions ?? []
  const fontKeys = new Set(families.map(font => font.key.toLocaleLowerCase()))
  for (const font of families) for (const source of projectFontSources(font)) if (!paths.has(archivePathForReference('.opencard/fonts/fonts.json', source).toLocaleLowerCase())) throw new Error(`Missing packaged font file: ${source}`)
  for (const composition of compositions) for (const member of composition.members) if (!fontKeys.has(member.fontKey.toLocaleLowerCase())) throw new Error(`Missing font composition member: ${member.fontKey}`)
  const availableFonts = new Set([...families, ...compositions].map(item => item.key.toLocaleLowerCase()))
  for (const item of manifest.public.fonts) if (!availableFonts.has(item.key.toLocaleLowerCase())) throw new Error(`Unknown public font: ${item.key}`)
  const icons = native.iconsJson ? parseProjectIconRegistryText(native.iconsJson) : {}
  if (native.iconsJson && !icons) throw new Error('Invalid icon registry in package')
  for (const series of icons?.iconSeries ?? []) {
    for (const icon of series.icons) {
      if (!paths.has(archivePathForReference('.opencard/icons/icons.json', icon.source).toLocaleLowerCase())) {
        throw new Error(`Missing packaged icon file: ${icon.source}`)
      }
    }
  }
  for (const item of manifest.public.iconSeries) {
    const series = (icons?.iconSeries ?? []).find(candidate => candidate.key.toLocaleLowerCase() === item.key.toLocaleLowerCase())
    if (!series || series.icons.length !== item.count) throw new Error(`Invalid public icon series summary: ${item.key}`)
  }
  for (const included of manifest.packages ?? []) {
    const prefix = `.opencard/packages/${included.key}/`.toLocaleLowerCase()
    if (!native.entryPaths.some(path => path.toLocaleLowerCase().startsWith(prefix))) {
      throw new Error(`Missing packaged sub-package: ${included.key}`)
    }
  }
}

function archivePathForReference(sourceFilePath: string, reference: string): string {
  const root = 'C:/package'
  const resolved = resolveResourcePath(root, `${root}/${sourceFilePath}`, reference)
  if (!resolved.ok) throw new Error(`Invalid packaged resource path: ${reference}`)
  return resolved.value.slice(root.length + 1)
}

export async function previewResourcePackage(options: { projectRootPath: string; sourcePath: string; targetKey?: string }): Promise<ResourcePackagePreview> {
  const native = await invoke<NativeInspection>('inspect_resource_package', { request: { projectRootPath: options.projectRootPath, sourcePath: options.sourcePath, targetKey: options.targetKey } })
  const inspected = projectManifest(native.manifestJson)
  validateProjection(native, inspected)
  if (inspected.contentHash !== native.contentHash) throw new Error('Package content hash does not match its manifest')
  const manifest = options.targetKey ? { ...inspected, key: options.targetKey } : inspected
  return { manifest, contentHash: native.contentHash, existingManifest: native.existingManifestJson ? projectManifest(native.existingManifestJson) : null, existingFingerprint: native.existingFingerprint, targetPath: resolveInstalledResourcePackageRootPath(options.projectRootPath, manifest.key), projectRootPath: options.projectRootPath, entryCount: native.entryCount, unpackedBytes: native.unpackedBytes, sourcePath: options.sourcePath }
}

export async function installResourcePackage(options: { preview: ResourcePackagePreview }): Promise<ResourcePackageInstallResult> {
  const native = await invoke<{ targetPath: string; replaced: boolean; fingerprint: string }>('install_resource_package', { request: { projectRootPath: options.preview.projectRootPath, sourcePath: options.preview.sourcePath, targetKey: options.preview.manifest.key, expectedContentHash: options.preview.contentHash, expectedExistingFingerprint: options.preview.existingFingerprint, manifestJson: serializeResourcePackageManifest(options.preview.manifest) } })
  return { manifest: options.preview.manifest, unchanged: false, ...native }
}

export async function checkInstalledResourcePackage(options: {
  projectRootPath: string
  packageKey: string
  requiredVersion: string
}): Promise<ResourcePackageCheckResult> {
  try {
    const native = await invoke<NativeInstalledInspection>('inspect_installed_resource_package', {
      request: { projectRootPath: options.projectRootPath, packageKey: options.packageKey },
    })
    if (!native.exists) return { status: 'missing' }
    if (!native.manifestJson || !native.contentHash) return { status: 'invalid', message: 'Installed package inspection is incomplete' }
    const manifest = projectManifest(native.manifestJson)
    if (manifest.key.toLocaleLowerCase() !== options.packageKey.toLocaleLowerCase()) {
      return { status: 'invalid', manifest, message: 'Package Key does not match its directory name' }
    }
    validateProjection(native as unknown as NativeInspection, manifest)
    if (manifest.version !== options.requiredVersion) return { status: 'version', manifest }
    if (manifest.contentHash !== native.contentHash) return { status: 'hash', manifest }
    return { status: 'ok', manifest }
  } catch (cause) {
    return { status: 'invalid', message: cause instanceof Error ? cause.message : String(cause) }
  }
}

export async function recoverResourcePackageTransactions(projectRootPath: string): Promise<void> {
  await invoke('recover_resource_package_transactions', { projectRootPath })
}

/**
 * Project icon reference protocol.
 *
 * Canonical spelling is the resource reference for icons: `[qualifier#]icon:collection/icon`.
 * The qualifier follows the resource reference syntax: a full coordinate `作者/包名@版本` names a
 * package icon, an empty qualifier (`#icon:…`) names the host project, and no `#` at all means the
 * current scope. Paths without the `icon:` prefix are the pre-package spelling of a current-project
 * icon and stay readable.
 *
 * This module owns the spelling only. Naming, lookup, and drawing belong to `projectIconCatalog`;
 * resolving a package-qualified reference belongs to the resource reference layer.
 */

import { formatPackageCoordinate, parsePackageCoordinate } from '../../features/workspace/model/packageCoordinate'

export type ProjectIconReference = {
  /**
   * Reference qualifier: `null` for the current scope, `''` for the host project, otherwise the
   * package's full coordinate（`作者/包名@版本`）.
   */
  packageKey: string | null
  seriesKey: string
  iconKey: string
}

const projectIconKeyPattern = /^[a-z0-9][a-z0-9._-]*$/

function parseIconBody(packageKey: string | null, body: string): ProjectIconReference | null {
  const iconBody = body.startsWith('icon:') ? body.slice('icon:'.length) : body
  const separator = iconBody.indexOf('/')
  if (separator <= 0 || separator === iconBody.length - 1) return null
  const seriesKey = iconBody.slice(0, separator).trim()
  const iconKey = iconBody.slice(separator + 1).trim()
  if (!projectIconKeyPattern.test(seriesKey) || !projectIconKeyPattern.test(iconKey)) return null
  return { packageKey, seriesKey, iconKey }
}

export function parseProjectIconPath(path: string): ProjectIconReference | null {
  const value = path.trim()
  if (!value) return null
  const hash = value.indexOf('#')
  if (hash < 0) return parseIconBody(null, value)
  const qualifier = value.slice(0, hash).trim()
  if (!qualifier) return parseIconBody('', value.slice(hash + 1).trim())
  const coordinate = parsePackageCoordinate(qualifier)
  return coordinate
    ? parseIconBody(formatPackageCoordinate(coordinate), value.slice(hash + 1).trim())
    : null
}

export function formatProjectIconPath(reference: ProjectIconReference): string {
  const qualifier = reference.packageKey === null ? '' : `${reference.packageKey}#`
  return `${qualifier}icon:${reference.seriesKey}/${reference.iconKey}`
}

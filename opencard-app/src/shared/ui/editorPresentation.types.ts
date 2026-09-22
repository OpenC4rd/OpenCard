/**
 * Presentation an editor supplies for itself, so the shell never restates editor copy.
 * The Editor Host writes it back into the session it belongs to (`setSessionPresentation`), and the
 * shell reads it from there — which is why the page header and the opened-editor list always agree,
 * and why a background session keeps its presentation with no editor mounted.
 */
import type { IconToken, IconTone } from './icon/iconRegistry'

export type EditorPresentation = {
  title: string
  description: string
  icon: IconToken
  iconTone?: IconTone
}

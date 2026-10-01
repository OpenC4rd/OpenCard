import type { OcIconSize } from '../base/OcIcon.vue'
import type {
  ActionButtonSize,
  ActionButtonVariant,
  OcActionDefinition,
  OcActionDivider,
} from '../../shared/ui/action/action.types'

export type OcOverlayToolbarAction = OcActionDefinition & {
  active?: boolean
  size?: ActionButtonSize
  iconSize?: OcIconSize
  variant?: ActionButtonVariant
  ariaPressed?: boolean
}

export type OcOverlayToolbarItem = OcOverlayToolbarAction | OcActionDivider | string

export type OcViewportToolbarLabels = {
  zoomOut: string
  fit: string
  zoomIn: string
}

export function createViewportToolbarItems(
  scaleLabel: string,
  labels: OcViewportToolbarLabels,
): OcOverlayToolbarItem[] {
  return [
    { key: 'viewport.zoom-out', icon: 'tool.zoom-out', title: labels.zoomOut },
    scaleLabel,
    { key: 'viewport.fit', icon: 'tool.fit-screen', title: labels.fit },
    { key: 'viewport.zoom-in', icon: 'tool.zoom-in', title: labels.zoomIn },
  ]
}

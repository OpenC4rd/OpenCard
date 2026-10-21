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
    { key: 'viewport.zoom-out', icon: 'mdiMagnifyMinusOutline', title: labels.zoomOut },
    scaleLabel,
    { key: 'viewport.fit', icon: 'mdiFitToScreenOutline', title: labels.fit },
    { key: 'viewport.zoom-in', icon: 'mdiMagnifyPlusOutline', title: labels.zoomIn },
  ]
}

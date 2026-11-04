import type { OcActionBarItem } from '../../shared/ui/action/action.types'

export type OcViewportToolbarLabels = {
  zoomOut: string
  fit: string
  zoomIn: string
}

export function createViewportToolbarItems(
  scaleLabel: string,
  labels: OcViewportToolbarLabels,
): OcActionBarItem[] {
  return [
    { key: 'viewport.zoom-out', icon: 'mdiMagnifyMinusOutline', title: labels.zoomOut },
    scaleLabel,
    { key: 'viewport.fit', icon: 'mdiFitToScreenOutline', title: labels.fit },
    { key: 'viewport.zoom-in', icon: 'mdiMagnifyPlusOutline', title: labels.zoomIn },
  ]
}

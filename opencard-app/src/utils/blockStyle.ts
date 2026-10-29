import type { RenderReadyBaseBlock } from '../features/card-rendering/render.types'

function isZeroCssValue(value: string): boolean {
    const normalized = value.trim().toLowerCase()
    return normalized === '' || normalized === '0' || normalized === '0px' || normalized === '0mm' || normalized === '0pt' || normalized === '0%'
}

export function getBlockBoxStyles(comp: RenderReadyBaseBlock): string {
    const styles: string[] = []

    styles.push(`width: ${comp.width}`)
    styles.push(`height: ${comp.height}`)
    if (!comp.visible) styles.push('visibility: hidden')
    if (comp.borderWidth > 0) {
        styles.push(`outline: ${comp.borderWidth}px ${comp.borderStyle} ${comp.borderColor}`)
    }
    if (comp.borderRadius) styles.push(`border-radius: ${comp.borderRadius}`)
    if (comp.background) styles.push(`background: ${comp.background}`)
    if (comp.opacity !== 1) styles.push(`opacity: ${comp.opacity}`)
    if (comp.zIndex !== 0) styles.push(`z-index: ${comp.zIndex}`)

    if (comp.transformAnchor !== 'cc') {
        const originMap: Record<string, string> = {
            'lt': '0% 0%', 'ct': '50% 0%', 'rt': '100% 0%',
            'lc': '0% 50%', 'cc': '50% 50%', 'rc': '100% 50%',
            'lb': '0% 100%', 'cb': '50% 100%', 'rb': '100% 100%'
        }
        styles.push(`transform-origin: ${originMap[comp.transformAnchor]}`)
    }

    const transforms: string[] = []
    if (!isZeroCssValue(comp.translateX) || !isZeroCssValue(comp.translateY)) {
        transforms.push(`translate(${comp.translateX}, ${comp.translateY})`)
    }
    if (comp.scaleX !== 1 || comp.scaleY !== 1) {
        transforms.push(`scale(${comp.scaleX}, ${comp.scaleY})`)
    }
    if (comp.rotation !== 0) {
        transforms.push(`rotate(${comp.rotation}deg)`)
    }
    if (transforms.length > 0) {
        styles.push(`transform: ${transforms.join(' ')}`)
    }

    return styles.join('; ')
}


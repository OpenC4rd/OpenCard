// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { RenderReadyBaseBlock } from '../features/card-rendering/render.types'
import { getBlockBoxStyles } from './blockStyle'

function createBlock(overrides: Partial<RenderReadyBaseBlock> = {}): RenderReadyBaseBlock {
    return {
        id: 'block-1',
        name: 'Block',
        notes: '',
        visible: true,
        width: '120px',
        height: '80px',
        borderColor: '#000000',
        borderWidth: 0,
        borderStyle: 'solid',
        borderRadius: '',
        background: '',
        translateX: '0px',
        translateY: '0px',
        scaleX: 1,
        scaleY: 1,
        transformAnchor: 'cc',
        zIndex: 0,
        rotation: 0,
        opacity: 1,
        customCss: '',
        ...overrides,
    }
}

describe('getBlockBoxStyles', () => {
    it('renders structured block borders without changing the box model', () => {
        const styles = getBlockBoxStyles(createBlock({
            borderColor: '#ff0000',
            borderWidth: 3,
            borderStyle: 'dashed',
        }), { disableTransform: false })

        expect(styles).toContain('width: 120px')
        expect(styles).toContain('height: 80px')
        expect(styles).toContain('outline: 3px dashed #ff0000')
        expect(styles).not.toMatch(/(^|;)\s*border:/)
    })

    it('does not render an outline when the border width is zero', () => {
        const styles = getBlockBoxStyles(createBlock({
            borderColor: '#ff0000',
            borderWidth: 0,
            borderStyle: 'solid',
        }), { disableTransform: false })

        expect(styles).not.toContain('outline:')
    })

    it('keeps invisible blocks measurable while hiding their content', () => {
        const styles = getBlockBoxStyles(createBlock({ visible: false }), { disableTransform: false })

        expect(styles).toContain('visibility: hidden')
        expect(styles).toContain('width: 120px')
        expect(styles).toContain('height: 80px')
    })
})

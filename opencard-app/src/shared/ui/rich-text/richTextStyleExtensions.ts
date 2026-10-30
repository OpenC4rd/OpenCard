import { Extension, Mark } from '@tiptap/core'
import type { ParseRule } from '@tiptap/pm/model'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import TextStyle from '@tiptap/extension-text-style'
import { fromCssFontFamily, toCssFontFamily } from '../../../features/workspace/model/projectFonts'
export const fontVariable = (value: string) => `--oc-rich-font-${Array.from(value, char => char.codePointAt(0)!.toString(16)).join('-')}`
const ProjectTextStyle = TextStyle.extend({
  parseHTML() {
    return [{
      tag: 'span:not([data-oc-binding]):not([data-oc-icon-path])',
      getAttrs: element => element.hasAttribute('style') || element.getAttribute('data-oc-fill-type') === 'image'
        || Array.from(element.attributes).some(attribute => /^data-oc-shadow-/.test(attribute.name)) ? {} : false,
    }]
  },
})
const TextStyleAttributes = Extension.create({
  name: 'textStyleAttributes',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: element => element.style.fontSize || null,
          renderHTML: attributes => attributes.fontSize
            ? { style: `font-size: ${attributes.fontSize}` }
            : {},
        },
        textStrokeColor: {
          default: null,
          parseHTML: element => element.style.webkitTextStrokeColor || null,
          renderHTML: attributes => attributes.textStrokeColor
            ? { style: `-webkit-text-stroke-color: ${attributes.textStrokeColor}` }
            : {},
        },
        textStrokeWidth: {
          default: null,
          parseHTML: element => element.style.webkitTextStrokeWidth || null,
          renderHTML: attributes => attributes.textStrokeWidth
            ? { style: `-webkit-text-stroke-width: ${attributes.textStrokeWidth}` }
            : {},
        },
        textFillType: {
          default: null,
          parseHTML: element => element.getAttribute('data-oc-fill-type') === 'image' ? 'image' : null,
          renderHTML: attributes => attributes.textFillType === 'image'
            ? { 'data-oc-fill-type': attributes.textFillType }
            : {},
        },
        textFillSource: {
          default: null,
          parseHTML: element => element.getAttribute('data-oc-fill-source') || null,
          renderHTML: attributes => attributes.textFillType === 'image' && attributes.textFillSource
            ? {
                'data-oc-fill-source': attributes.textFillSource,
              }
            : {},
        },
        textShadowColor: {
          default: null,
          parseHTML: element => element.getAttribute('data-oc-shadow-color') || null,
          renderHTML: attributes => attributes.textShadowColor
            ? {
                'data-oc-shadow-color': attributes.textShadowColor,
                style: `text-shadow: ${attributes.textShadowOffsetX || '0mm'} ${attributes.textShadowOffsetY || '0mm'} ${attributes.textShadowBlur || '0mm'} ${attributes.textShadowColor}`,
              }
            : {},
        },
        textShadowOffsetX: {
          default: null,
          parseHTML: element => element.getAttribute('data-oc-shadow-offset-x') || null,
          renderHTML: attributes => attributes.textShadowOffsetX
            ? { 'data-oc-shadow-offset-x': attributes.textShadowOffsetX }
            : {},
        },
        textShadowOffsetY: {
          default: null,
          parseHTML: element => element.getAttribute('data-oc-shadow-offset-y') || null,
          renderHTML: attributes => attributes.textShadowOffsetY
            ? { 'data-oc-shadow-offset-y': attributes.textShadowOffsetY }
            : {},
        },
        textShadowBlur: {
          default: null,
          parseHTML: element => element.getAttribute('data-oc-shadow-blur') || null,
          renderHTML: attributes => attributes.textShadowBlur
            ? { 'data-oc-shadow-blur': attributes.textShadowBlur }
            : {},
        },
      },
    }]
  },
})

const DynamicStyle = Mark.create({
  name: 'dynamicStyle',
  priority: 1000,
  excludes: 'highlight textStyle',
  addAttributes() {
    return {
      tag: { default: 'span' },
      rawStyle: { default: '' },
    }
  },
  parseHTML() {
    const rule = (tag: 'mark' | 'span') => ({
      tag: `${tag}[data-oc-dynamic-style]`,
      getAttrs: (element: HTMLElement) => {
        const rawStyle = element.getAttribute('data-oc-dynamic-style') ?? ''
        return rawStyle ? { tag, rawStyle } : false
      },
    })
    return [rule('mark'), rule('span')]
  },
  renderHTML({ HTMLAttributes }) {
    return [HTMLAttributes.tag === 'mark' ? 'mark' : 'span', {
      'data-oc-dynamic-style': HTMLAttributes.rawStyle,
    }, 0]
  },
})

const StaticHighlight = Highlight.extend({
  parseHTML() {
    return (this.parent?.() ?? []).map((rule): ParseRule => ({
      ...rule,
      getAttrs: (element: HTMLElement | string) => {
        if (typeof element === 'string') return null
        return element.hasAttribute('data-oc-dynamic-style')
          ? false
          : typeof rule.getAttrs === 'function'
            ? ((rule.getAttrs as (element: HTMLElement) => ParseRule['attrs'])(element) ?? null)
            : rule.getAttrs ?? null
      },
    }))
  },
})

const ScopedFontFamily = FontFamily.extend({
  addGlobalAttributes() {
    return [{ types: ['textStyle'], attributes: { fontFamily: {
      default: null,
      parseHTML: element => element.getAttribute('data-oc-font') ?? fromCssFontFamily(element.style.fontFamily),
      renderHTML: attributes => attributes.fontFamily ? {
        'data-oc-font': attributes.fontFamily,
        style: `font-family: var(${fontVariable(attributes.fontFamily)}, ${toCssFontFamily(attributes.fontFamily)})`,
      } : {},
    } } }]
  },
})

export const richTextStyleExtensions = [ProjectTextStyle, TextStyleAttributes, ScopedFontFamily, StaticHighlight.configure({ multicolor: true }), DynamicStyle]

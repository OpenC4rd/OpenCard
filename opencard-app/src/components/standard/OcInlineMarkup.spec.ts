import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { inlineMarkupToText, parseInlineMarkup } from '../../shared/ui/inline-markup/inlineMarkup'
import OcIcon from '../base/OcIcon.vue'
import OcInlineMarkup from './OcInlineMarkup.vue'

describe('OcInlineMarkup', () => {
  it('renders the complete safe inline protocol through semantic nodes', () => {
    const wrapper = mount(OcInlineMarkup, {
      props: {
        source: '[b]Bold[/b] [i]Italic[/i][br][code]file.save[/code] [key]Ctrl[/key] [icon:mdiContentCopy]',
      },
    })

    expect(wrapper.get('strong').text()).toBe('Bold')
    expect(wrapper.get('em').text()).toBe('Italic')
    expect(wrapper.find('br').exists()).toBe(true)
    expect(wrapper.get('code').text()).toBe('file.save')
    expect(wrapper.get('kbd').text()).toBe('Ctrl')
    expect(wrapper.getComponent(OcIcon).props('name')).toBe('mdiContentCopy')
  })

  it('keeps removed, legacy, malformed, and HTML-like input as text', () => {
    const source = '[[chip:Ctrl]] [[icon:mdiContentCopy]] [icon:] [icon:not.registered] <img src=x onerror=alert(1)>'
    const wrapper = mount(OcInlineMarkup, { props: { source } })

    expect(wrapper.text()).toBe(source)
    expect(wrapper.find('img').exists()).toBe(false)
    expect(parseInlineMarkup(source)).toEqual([{ type: 'text', value: source }])
  })

  it('derives accessible plain text from the same parsed representation', () => {
    expect(inlineMarkupToText('Save [key]Ctrl[/key] + [key]S[/key] [icon:mdiContentSaveOutline]'))
      .toBe('Save Ctrl + S')
  })
})

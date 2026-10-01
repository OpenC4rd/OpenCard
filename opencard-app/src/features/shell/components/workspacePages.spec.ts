import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import enUS from '../../../locales/en-US'
import OcPhaseImage from '../../../components/standard/OcPhaseImage.vue'
import WorkbenchWorkspace from './WorkbenchWorkspace.vue'
import OcSwitch from '../../../components/base/OcSwitch.vue'
import WelcomeCoverWall from './WelcomeCoverWall.vue'
import WelcomeGravityField from './WelcomeGravityField.vue'
import WelcomeWorkspace from './WelcomeWorkspace.vue'

function mountOptions() {
  return {
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': enUS } })],
    },
  }
}

describe('workspace pages', () => {
  it('shows the OpenCard welcome page and exposes its project actions', async () => {
    const wrapper = mount(WelcomeWorkspace, mountOptions())

    expect(wrapper.text()).toContain('Welcome to')
    const phaseImages = wrapper.findAllComponents(OcPhaseImage)
    expect(phaseImages).toHaveLength(2)
    expect(phaseImages[1]!.classes()).toContain('workspace-empty-state__wordmark')
    expect(phaseImages[1]!.props('alt')).toBe('OpenCard')
    expect(phaseImages[1]!.props('direction')).toBe('reverse')
    expect(phaseImages.every(image => image.props('fit') === 'contain')).toBe(true)
    expect(phaseImages[1]!.props('src')).toContain('opencard-wordmark-phase-map')
    expect(phaseImages[1]!.props('brightnessSrc')).toContain('opencard-wordmark-brightness-map')
    expect(wrapper.findAll('.workspace-empty-state__actions button')).toHaveLength(2)
    expect(wrapper.text()).toContain('New Project')
    expect(wrapper.text()).toContain('Open Project Folder')
    expect(wrapper.text()).not.toContain('No editors open')

    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    await buttons[0]?.trigger('click')
    await buttons[1]?.trigger('click')
    expect(wrapper.emitted('new-project')).toHaveLength(1)
    expect(wrapper.emitted('open-project')).toHaveLength(1)
  })

  it('gates the cover wall and the gravity background from the bottom-left switch', async () => {
    const wrapper = mount(WelcomeWorkspace, {
      props: { backgroundVisible: true },
      ...mountOptions(),
    })

    const toggle = wrapper.getComponent(OcSwitch)
    expect(toggle.props('checked')).toBe(true)
    // The caller renders the label itself (so it can carry the cover-wall text shadow), not via prop.
    expect(toggle.text()).toContain('Background effects')
    expect(wrapper.findComponent(WelcomeCoverWall).exists()).toBe(true)
    expect(wrapper.findComponent(WelcomeGravityField).exists()).toBe(true)

    toggle.vm.$emit('update:checked', false)
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:backgroundVisible')).toEqual([[false]])
  })

  it('renders no background effects when the setting is off', () => {
    const wrapper = mount(WelcomeWorkspace, {
      props: { backgroundVisible: false },
      ...mountOptions(),
    })

    expect(wrapper.findComponent(WelcomeCoverWall).exists()).toBe(false)
    expect(wrapper.findComponent(WelcomeGravityField).exists()).toBe(false)
    expect(wrapper.getComponent(OcSwitch).props('checked')).toBe(false)
    expect(wrapper.findAll('.workspace-empty-state__actions button')).toHaveLength(2)
  })

  it('feeds recent project covers and the sidebar selection into the background wall', () => {
    const covers = [{ projectKey: 'recent-project:/Project', src: 'asset:///Project/assets/cover.png' }]
    const wrapper = mount(WelcomeWorkspace, {
      props: { covers, highlightKeys: ['recent-project:/Project'] },
      ...mountOptions(),
    })

    const wall = wrapper.getComponent(WelcomeCoverWall)
    expect(wall.props('covers')).toEqual(covers)
    expect(wall.props('highlightKeys')).toEqual(['recent-project:/Project'])
    expect(wrapper.findAll('.workspace-empty-state__actions button')).toHaveLength(2)
  })

  it('shows the editor placeholder when the workbench has no active document', () => {
    const wrapper = mount(WorkbenchWorkspace, {
      props: { hasActiveEditor: false },
      ...mountOptions(),
    })

    expect(wrapper.text()).toContain('No editors open')
  })

  it('prompts to open a project when the workbench has no project', async () => {
    const wrapper = mount(WorkbenchWorkspace, {
      props: { hasActiveEditor: false, hasProject: false },
      ...mountOptions(),
    })

    expect(wrapper.text()).toContain('Open a file or project to get started')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('open-project')).toHaveLength(1)
  })

  it('renders editor content only for an active document', () => {
    const wrapper = mount(WorkbenchWorkspace, {
      props: { hasActiveEditor: true },
      slots: { default: '<div data-testid="editor">Editor</div>' },
      ...mountOptions(),
    })

    expect(wrapper.get('[data-testid="editor"]').text()).toBe('Editor')
    expect(wrapper.text()).not.toContain('No editors open')
  })
})

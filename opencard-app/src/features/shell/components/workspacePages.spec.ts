import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import enUS from '../../../locales/en-US'
import OcPhaseImage from '../../../components/standard/OcPhaseImage.vue'
import WorkbenchWorkspace from './WorkbenchWorkspace.vue'
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
    // 两个入口按钮，外加左下角控制背景显隐的图标按钮。
    expect(buttons).toHaveLength(3)
    await buttons[0]?.trigger('click')
    await buttons[1]?.trigger('click')
    expect(wrapper.emitted('new-project')).toHaveLength(1)
    expect(wrapper.emitted('open-project')).toHaveLength(1)
  })

  it('gates the cover wall and the gravity background from the bottom-left toggle', async () => {
    const wrapper = mount(WelcomeWorkspace, {
      props: { backgroundVisible: true },
      ...mountOptions(),
    })

    const toggle = wrapper.get('.workspace-empty-state__wall-toggle')
    expect(toggle.element.tagName).toBe('BUTTON')
    // 图标按钮没有可见文字，可访问名字与提示都由调用方给出。
    expect(toggle.attributes('aria-label')).toBe('Background effects')
    expect(toggle.attributes('data-tooltip')).toBe('Background effects')
    expect(toggle.attributes('aria-pressed')).toBe('true')
    expect(wrapper.findComponent(WelcomeCoverWall).exists()).toBe(true)
    expect(wrapper.findComponent(WelcomeGravityField).exists()).toBe(true)

    await toggle.trigger('click')
    expect(wrapper.emitted('update:backgroundVisible')).toEqual([[false]])
  })

  it('renders no background effects when the setting is off', () => {
    const wrapper = mount(WelcomeWorkspace, {
      props: { backgroundVisible: false },
      ...mountOptions(),
    })

    expect(wrapper.findComponent(WelcomeCoverWall).exists()).toBe(false)
    expect(wrapper.findComponent(WelcomeGravityField).exists()).toBe(false)
    expect(wrapper.get('.workspace-empty-state__wall-toggle').attributes('aria-pressed')).toBe('false')
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

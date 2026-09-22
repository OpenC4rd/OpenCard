import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShellPage } from '../shellPage'
import { useShellProjectLifecycle } from './useShellProjectLifecycle'

const notifications = vi.hoisted(() => ({ notifyError: vi.fn() }))

vi.mock('../../notifications/titlebarNotices', () => ({ notifyError: notifications.notifyError }))

function createHarness(options?: {
  currentProject?: string
  selectedProject?: string | null
  page?: ShellPage
  closeOutcome?: 'completed' | 'prompted'
}) {
  const events: string[] = []
  const projectPath = ref(options?.currentProject ?? 'D:/old-project')
  const shellPage = ref<ShellPage>(options?.page ?? { type: 'welcome' })
  const chooseProjectDirectory = vi.fn(async () => (
    options?.selectedProject === undefined ? 'D:/new-project' : options.selectedProject
  ))
  const setProjectPath = vi.fn(async (path: string) => {
    events.push(`set:${path}`)
    projectPath.value = path
  })
  const readDirectoryEntries = vi.fn(async () => {
    events.push('load-tree')
  })
  const closeCurrentProject = vi.fn(async () => {
    events.push('close-current-project')
    return options?.closeOutcome ?? 'completed'
  })
  const closeWorkspaceSessions = vi.fn(() => {
    events.push('close-sessions')
  })
  const openFile = vi.fn(async (path: string) => {
    events.push(`open-entry:${path}`)
  })
  const rememberRecentProject = vi.fn((path: string) => {
    events.push(`remember:${path}`)
  })
  const forgetRecentProject = vi.fn()
  const loadTemplates = vi.fn(async () => undefined)

  const lifecycle = useShellProjectLifecycle({
    project: {
      projectPath,
      chooseProjectDirectory,
      setProjectPath,
      readDirectoryEntries,
    },
    sessions: {
      closeWorkspaceSessions,
      openFile,
    },
    closeCurrentProject,
    settings: {
      rememberRecentProject,
      forgetRecentProject,
    },
    templates: { load: loadTemplates },
    shellPage,
    translate: key => `translated:${key}`,
  })

  return {
    lifecycle,
    events,
    projectPath,
    shellPage,
    chooseProjectDirectory,
    setProjectPath,
    readDirectoryEntries,
    closeCurrentProject,
    closeWorkspaceSessions,
    openFile,
    rememberRecentProject,
    forgetRecentProject,
    loadTemplates,
  }
}

describe('useShellProjectLifecycle', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    notifications.notifyError.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['directory picker', (harness: ReturnType<typeof createHarness>) => harness.lifecycle.openProject()],
    ['recent project', (harness: ReturnType<typeof createHarness>) => harness.lifecycle.openRecentProject('D:/new-project')],
  ])('uses the same activation order for %s', async (_label, activate) => {
    const harness = createHarness()

    await expect(activate(harness)).resolves.toBe(true)

    expect(harness.events).toEqual([
      'close-current-project',
      'set:D:/new-project',
      'remember:D:/new-project',
    ])
    expect(harness.readDirectoryEntries).not.toHaveBeenCalled()
    expect(harness.shellPage.value).toEqual({ type: 'workbench' })
  })

  it('opens only a newly created project entry after the shared activation sequence', async () => {
    const harness = createHarness()

    await expect(harness.lifecycle.activateCreatedProject({
      path: 'D:/new-project',
      entry: 'cards/main.ocdocument',
    })).resolves.toBe(true)

    expect(harness.events).toEqual([
      'close-current-project',
      'set:D:/new-project',
      'remember:D:/new-project',
      'open-entry:cards/main.ocdocument',
    ])
    expect(harness.readDirectoryEntries).not.toHaveBeenCalled()
  })

  it('does not close the current project when activating the current project again', async () => {
    const harness = createHarness({ currentProject: 'D:\\same-project' })

    await harness.lifecycle.openRecentProject('D:/same-project')

    expect(harness.closeCurrentProject).not.toHaveBeenCalled()
  })

  it('does nothing when project selection is cancelled', async () => {
    const harness = createHarness({ selectedProject: null })

    await expect(harness.lifecycle.openProject()).resolves.toBe(false)

    expect(harness.closeCurrentProject).not.toHaveBeenCalled()
    expect(harness.setProjectPath).not.toHaveBeenCalled()
    expect(harness.shellPage.value).toEqual({ type: 'welcome' })
  })

  it('opens an ordinary directory directly without initializing project internals', async () => {
    const harness = createHarness()

    await expect(harness.lifecycle.openRecentProject('D:/new-project')).resolves.toBe(true)

    expect(harness.events).toEqual([
      'close-current-project',
      'set:D:/new-project',
      'remember:D:/new-project',
    ])
    expect(harness.shellPage.value).toEqual({ type: 'workbench' })
  })

  it('waits for the unsaved confirmation before switching projects', async () => {
    const harness = createHarness({ closeOutcome: 'prompted' })

    await expect(harness.lifecycle.openRecentProject('D:/new-project')).resolves.toBe(false)
    expect(harness.setProjectPath).not.toHaveBeenCalled()
    expect(harness.loadTemplates).not.toHaveBeenCalled()

    harness.setProjectPath.mockImplementationOnce(async (path: string) => {
      harness.events.push(`set:${path}`)
      harness.projectPath.value = path
    })
    await expect(harness.lifecycle.resumeDeferredActivation()).resolves.toBe(true)
    expect(harness.events).toEqual(['close-current-project', 'set:D:/new-project', 'remember:D:/new-project'])
    expect(harness.shellPage.value).toEqual({ type: 'workbench' })
  })

  it('drops a deferred activation when the user cancels the unsaved confirmation', async () => {
    const harness = createHarness({ closeOutcome: 'prompted' })

    await expect(harness.lifecycle.openRecentProject('D:/new-project')).resolves.toBe(false)
    harness.lifecycle.dropDeferredActivation()

    await expect(harness.lifecycle.resumeDeferredActivation()).resolves.toBe(false)
    expect(harness.setProjectPath).not.toHaveBeenCalled()
  })

  it('rejects a second activation while the first one is still running', async () => {
    const harness = createHarness()
    let finishLoading: (() => void) | undefined
    harness.setProjectPath.mockImplementationOnce(async (path: string) => {
      harness.events.push(`set:${path}`)
      await new Promise<void>((resolve) => {
        finishLoading = resolve
      })
      harness.projectPath.value = path
    })

    const firstActivation = harness.lifecycle.openRecentProject('D:/new-project')
    await Promise.resolve()
    await expect(harness.lifecycle.openRecentProject('D:/other-project')).resolves.toBe(false)
    finishLoading?.()
    await expect(firstActivation).resolves.toBe(true)

    expect(harness.setProjectPath).toHaveBeenCalledTimes(1)
  })

  it('loads the project tree only when explicitly requested', async () => {
    const harness = createHarness()

    await harness.lifecycle.ensureProjectTreeLoaded()

    expect(harness.readDirectoryEntries).toHaveBeenCalledOnce()
    // 只登记标准前瞻深度：更深的目录在展开时再读，避免激活项目就把整个项目递归走一遍。
    expect(harness.readDirectoryEntries).toHaveBeenCalledWith('')
  })

  it('clears busy and reports an immediate notice when project loading fails', async () => {
    const harness = createHarness()
    harness.setProjectPath.mockRejectedValueOnce(new Error('load failed'))

    await expect(harness.lifecycle.openRecentProject('D:/new-project')).resolves.toBe(false)

    expect(harness.lifecycle.isActivating.value).toBe(false)
    expect(notifications.notifyError).toHaveBeenCalledWith(
      'translated:projectTemplates.errors.activationFailed',
    )
    expect(harness.shellPage.value).toEqual({ type: 'welcome' })
  })

  it('clears busy and reports an immediate notice when opening a created entry fails', async () => {
    const harness = createHarness({ page: { type: 'create-project', returnPage: 'welcome' } })
    harness.openFile.mockRejectedValueOnce(new Error('entry failed'))

    await expect(harness.lifecycle.activateCreatedProject({
      path: 'D:/new-project',
      entry: 'main.ocdocument',
    })).resolves.toBe(false)

    expect(harness.lifecycle.isActivating.value).toBe(false)
    expect(notifications.notifyError).toHaveBeenCalledOnce()
    expect(harness.shellPage.value).toEqual({ type: 'create-project', returnPage: 'welcome' })
  })

  it('relocates a recent project without activating it', async () => {
    const harness = createHarness({ selectedProject: 'D:/relocated-project' })

    await expect(harness.lifecycle.relocateRecentProject('D:/missing-project')).resolves.toBe(
      'D:/relocated-project',
    )

    expect(harness.forgetRecentProject).toHaveBeenCalledWith('D:/missing-project')
    expect(harness.rememberRecentProject).toHaveBeenCalledWith('D:/relocated-project')
    expect(harness.setProjectPath).not.toHaveBeenCalled()
  })

  it('enters create-project with the current primary return page and loads templates', async () => {
    const harness = createHarness({ page: { type: 'settings', categoryKey: 'general', returnPage: 'workbench' } })

    harness.lifecycle.enterCreateProject()
    await Promise.resolve()

    expect(harness.shellPage.value).toEqual({ type: 'create-project', returnPage: 'workbench' })
    expect(harness.loadTemplates).toHaveBeenCalledOnce()
  })

  it.each([
    ['current', { type: 'workbench' }],
    ['welcome', { type: 'welcome' }],
    ['create-project', { type: 'create-project', returnPage: 'workbench' }],
  ] as const)('completes project close for the %s destination', async (destination, expectedPage) => {
    const harness = createHarness({ page: { type: 'workbench' } })

    await harness.lifecycle.completeProjectClose(destination)

    expect(harness.events.slice(0, 2)).toEqual(['close-sessions', 'set:'])
    expect(harness.shellPage.value).toEqual(expectedPage)
    expect(harness.loadTemplates).toHaveBeenCalledTimes(destination === 'create-project' ? 1 : 0)
  })
})

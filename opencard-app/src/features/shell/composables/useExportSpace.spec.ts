import { effectScope, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExportProfile, type ExportProfile } from '../../workspace/model/projectExportProfile'
import { useExportSpace, type ExportSpaceOptions } from './useExportSpace'

vi.mock('../../notifications/titlebarNotices', () => ({ notifyAppError: vi.fn() }))

function createSpace(stored: ExportProfile[] = [], overrides: Partial<ExportSpaceOptions> = {}) {
  const options = {
    listDocuments: vi.fn(async () => ['cards/a.ocdocument']),
    listProfiles: vi.fn(async () => stored),
    saveProfile: vi.fn(async () => undefined),
    deleteProfile: vi.fn(async () => undefined),
    toProjectPath: (path: string) => path.startsWith('D:/project/') ? path.slice('D:/project/'.length) : null,
    running: ref(false),
    prepare: vi.fn(async () => ({ ok: true as const, plan: {} as never })),
    run: vi.fn(),
    newProfileName: () => 'New',
    ...overrides,
  }
  const scope = effectScope()
  return { options, scope, space: scope.run(() => useExportSpace(options))! }
}

describe('useExportSpace', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('loads profiles and selects the first one', async () => {
    const first = createExportProfile('First')
    const { space } = createSpace([first, createExportProfile('Second')])

    await space.load()

    expect(space.activeProfile.value?.id).toBe(first.id)
    expect(space.documents.value).toEqual(['cards/a.ocdocument'])
  })

  it('writes edits only when saved', async () => {
    const profile = createExportProfile('First')
    const { space, options } = createSpace([profile])
    await space.load()

    space.beginEdit()
    space.update({ ...profile, name: 'A' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(options.saveProfile).not.toHaveBeenCalled()

    await space.save()
    expect(space.editing.value).toBe(false)
    expect(options.saveProfile).toHaveBeenCalledTimes(1)
    expect(options.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'A' }))
  })

  it('restores the profile on cancel and when switching away', async () => {
    const first = createExportProfile('First')
    const second = createExportProfile('Second')
    const { space, options } = createSpace([first, second])
    await space.load()

    space.beginEdit()
    space.update({ ...first, name: 'Draft' })
    space.cancel()
    expect(space.activeProfile.value?.name).toBe('First')
    expect(space.editing.value).toBe(false)

    space.beginEdit()
    space.update({ ...first, name: 'Draft' })
    space.select(second.id)
    expect(space.profiles.value.find(profile => profile.id === first.id)?.name).toBe('First')
    expect(options.saveProfile).not.toHaveBeenCalled()
  })

  it('keeps a draft across reloads', async () => {
    const profile = createExportProfile('First')
    const { space } = createSpace([profile])
    await space.load()
    space.beginEdit()
    space.update({ ...profile, name: 'Draft' })

    await space.load()

    expect(space.activeProfile.value?.name).toBe('Draft')
    expect(space.editing.value).toBe(true)
  })

  it('stores output folders inside the project as relative paths', async () => {
    const profile = createExportProfile('First')
    const { space } = createSpace([profile])
    await space.load()

    space.update({ ...profile, output: { ...profile.output, directory: 'D:/project/out/print' } })
    expect(space.activeProfile.value?.output.directory).toBe('out/print')

    space.update({ ...profile, output: { ...profile.output, directory: 'E:/elsewhere' } })
    expect(space.activeProfile.value?.output.directory).toBe('E:/elsewhere')
  })

  it('starts new profiles as unsaved drafts that cancel removes', async () => {
    const { space, options } = createSpace()
    await space.load()

    space.add()
    expect(space.activeProfile.value).toMatchObject({ name: 'New', documents: ['**/*.ocdocument'] })
    expect(space.editing.value).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(options.saveProfile).not.toHaveBeenCalled()

    space.cancel()
    expect(space.profiles.value).toEqual([])
    expect(space.activeProfile.value).toBeNull()
  })

  it('creates, duplicates and deletes profiles as files', async () => {
    const { space, options } = createSpace()
    await space.load()

    space.add()
    await space.save()
    const created = space.activeProfile.value!

    space.duplicate(created.id)
    await space.save()
    const copy = space.activeProfile.value!
    expect(copy).toMatchObject({ name: 'New 2' })
    expect(copy.id).not.toBe(created.id)
    expect(options.saveProfile).toHaveBeenCalledTimes(2)

    space.remove(copy.id)
    expect(options.deleteProfile).toHaveBeenCalledWith(copy.id)
    expect(space.activeProfile.value?.id).toBe(created.id)
  })

  it('never touches files for a draft removed before saving', async () => {
    const { space, options } = createSpace()
    await space.load()
    space.add()

    space.remove(space.activeProfile.value!.id)

    expect(options.saveProfile).not.toHaveBeenCalled()
    expect(options.deleteProfile).not.toHaveBeenCalled()
  })

  it('exports the draft without saving it', async () => {
    const profile = createExportProfile('First')
    const { space, options } = createSpace([profile])
    await space.load()
    space.beginEdit()
    space.update({ ...profile, name: 'Changed' })

    expect(await space.submit()).toBe(true)
    expect(options.prepare).toHaveBeenCalledWith(expect.objectContaining({ name: 'Changed' }))
    expect(options.saveProfile).not.toHaveBeenCalled()
    expect(options.run).toHaveBeenCalledTimes(1)
  })

  it('surfaces preparation issues without running', async () => {
    const profile = createExportProfile('First')
    const { space, options } = createSpace([profile], {
      prepare: vi.fn(async () => ({ ok: false as const, issues: [{ code: 'paper-too-small' as const }] })),
    })
    await space.load()

    expect(await space.submit()).toBe(false)
    expect(space.issues.value).toEqual([{ code: 'paper-too-small' }])
    expect(options.run).not.toHaveBeenCalled()
  })
})

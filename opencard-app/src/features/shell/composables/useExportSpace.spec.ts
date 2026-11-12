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

    expect(space.activeProfile.value?.name).toBe(first.name)
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
    expect(options.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'A' }), 'First')
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
    space.select(second.name)
    expect(space.profiles.value.find(profile => profile.name === first.name)?.name).toBe('First')
    expect(options.saveProfile).not.toHaveBeenCalled()
  })

  it('refuses to save an empty, illegal or duplicate profile name', async () => {
    const first = createExportProfile('First')
    const { space, options } = createSpace([first, createExportProfile('Second')])
    await space.load()
    space.beginEdit()

    for (const name of ['', 'a/b', 'Second']) {
      space.update({ ...first, name })
      await space.save()
      expect(space.issues.value).toEqual([{ code: 'invalid-profile-name' }])
      expect(space.editing.value).toBe(true)
    }
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

  it('creates, duplicates and deletes profiles as files right away', async () => {
    const { space, options } = createSpace()
    await space.load()

    space.add()
    const created = space.activeProfile.value!
    expect(created).toMatchObject({ name: 'New', documents: ['**/*.ocdocument'] })
    expect(space.editing.value).toBe(false)
    expect(options.saveProfile).toHaveBeenCalledWith(created)

    space.duplicate(created.name)
    const copy = space.activeProfile.value!
    expect(copy).toMatchObject({ name: 'New 2' })
    expect(options.saveProfile).toHaveBeenLastCalledWith(copy)

    space.remove(copy.name)
    expect(options.deleteProfile).toHaveBeenCalledWith(copy.name)
    expect(space.activeProfile.value?.name).toBe(created.name)
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

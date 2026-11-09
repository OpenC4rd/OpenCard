import { describe, expect, it, vi } from 'vitest'
import {
  directorySelectorRefreshKey,
  directorySelectorRequest,
  importIntoDirectorySelector,
  openDirectorySelector,
  resolveDirectorySelector,
} from './directorySelectorService'

const scope = { key: 'project', label: '', prefix: '', readDirectory: async () => [] }

describe('directorySelectorService', () => {
  it('resolves the confirmed paths and clears the request', async () => {
    const result = openDirectorySelector({ title: 'Pick', scope })
    expect(directorySelectorRequest.value?.title).toBe('Pick')
    resolveDirectorySelector(['a.png'])
    expect(await result).toEqual(['a.png'])
    expect(directorySelectorRequest.value).toBeNull()
  })

  it('resolves null for cancel, an empty pick, and a superseded request', async () => {
    const first = openDirectorySelector({ title: 'One', scope })
    const second = openDirectorySelector({ title: 'Two', scope })
    expect(await first).toBeNull()
    resolveDirectorySelector([])
    expect(await second).toBeNull()
  })

  it('refreshes the listing only when the import added something', async () => {
    const importInto = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const result = openDirectorySelector({ title: 'Pick', scope, importInto })
    const before = directorySelectorRefreshKey.value
    await importIntoDirectorySelector('assets')
    expect(directorySelectorRefreshKey.value).toBe(before)
    await importIntoDirectorySelector('assets')
    expect(directorySelectorRefreshKey.value).toBe(before + 1)
    expect(importInto).toHaveBeenCalledWith('assets')
    resolveDirectorySelector(null)
    await result
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  eventHandler: null as (() => void) | null,
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: mocks.listen,
}))

import {
  classifyExternalOpenPath,
  filterSupportedExternalOpenPaths,
  listenForExternalOpenRequests,
} from './externalOpenService'

describe('externalOpenService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eventHandler = null
  })

  it('classifies only OpenCard file types', () => {
    expect(classifyExternalOpenPath('D:\\Cards\\main.ocdocument')).toBe('card')
    expect(classifyExternalOpenPath('D:/Cards/.opencard/project.json')).toBe('project-resource')
    expect(classifyExternalOpenPath('D:/Cards/.OPENCARD/LOCALE.JSON')).toBe('project-resource')
    expect(classifyExternalOpenPath('D:/Cards/en_US.ocproject')).toBeNull()
    expect(classifyExternalOpenPath('/cards/.opencard/LOCALE.JSON')).toBeNull()
    expect(classifyExternalOpenPath('D:/Cards/demo.octemplate')).toBe('template')
    expect(classifyExternalOpenPath('D:/Cards/demo.zip')).toBeNull()
    expect(filterSupportedExternalOpenPaths([
      'D:/Cards/main.ocdocument',
      'D:/Cards/readme.txt',
    ])).toEqual(['D:/Cards/main.ocdocument'])
  })

  it('tells an icon pack from a package archive by their extensions', () => {
    expect(classifyExternalOpenPath('D:/Packs/theme.ocpack')).toBe('resource-package')
  })

  it('drains startup paths and paths queued by later app launches', async () => {
    mocks.invoke
      .mockResolvedValueOnce(['D:/Cards/main.ocdocument'])
      .mockResolvedValueOnce(['D:/Templates/demo.octemplate'])
    mocks.listen.mockImplementation(async (_event, handler: () => void) => {
      mocks.eventHandler = handler
      return mocks.unlisten
    })
    const handlePaths = vi.fn()

    const unlisten = await listenForExternalOpenRequests(handlePaths)
    expect(handlePaths).toHaveBeenCalledWith(['D:/Cards/main.ocdocument'])

    mocks.eventHandler?.()
    await vi.waitFor(() => {
      expect(handlePaths).toHaveBeenCalledWith(['D:/Templates/demo.octemplate'])
    })
    expect(unlisten).toBe(mocks.unlisten)
  })

  it('releases the event listener when the initial request drain fails', async () => {
    mocks.listen.mockResolvedValueOnce(mocks.unlisten)
    mocks.invoke.mockRejectedValueOnce(new Error('drain failed'))

    await expect(listenForExternalOpenRequests(vi.fn())).rejects.toThrow('drain failed')

    expect(mocks.unlisten).toHaveBeenCalledOnce()
  })
})

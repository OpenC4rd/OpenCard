import { readonly } from 'vue'
import { describe, expect, it } from 'vitest'
import { cloneProjectWorkspaceState } from './workspaceState'

describe('cloneProjectWorkspaceState', () => {
  it('returns a detached, writable copy of the read-only projection it is given', () => {
    // 设置里读出来的是深只读投影（Vue 代理）。深拷贝必须先取原始对象：
    // `structuredClone` 直接吃代理会抛 "could not be cloned"。
    const source = readonly({
      expandedDirectories: ['cards'],
      sidebar: { collapsedLists: ['templates'], listWeights: { templates: 1 } },
    })

    const clone = cloneProjectWorkspaceState(source)
    clone.expandedDirectories.push('assets')
    clone.sidebar?.collapsedLists.push('packages')

    expect(clone.expandedDirectories).toEqual(['cards', 'assets'])
    expect(clone.sidebar?.collapsedLists).toEqual(['templates', 'packages'])
    expect(source.expandedDirectories).toEqual(['cards'])
    expect(source.sidebar?.collapsedLists).toEqual(['templates'])
  })

  it('starts from an empty state when nothing was remembered for the project', () => {
    expect(cloneProjectWorkspaceState(undefined)).toEqual({ expandedDirectories: [] })
  })
})

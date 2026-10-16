import { describe, expect, it } from 'vitest'
import { normalizeAppState } from './appState'

describe('appState', () => {
  it('normalizes project-profile collapse state in project workspace state', () => {
    const settings = normalizeAppState({
      projects: {
        workspaces: {
          'D:\\Cards\\Demo\\': {
            expandedDirectories: ['assets'],
            projectProfile: {
              collapsedSections: ['fonts', 'fonts', '', 42],
            },
          },
        },
      },
    })

    expect(settings.projects.workspaces['D:/Cards/Demo']).toEqual({
      expandedDirectories: ['assets'],
      projectProfile: { collapsedSections: ['fonts'] },
    })
  })

  it('normalizes the remembered package-builder selection per project', () => {
    const settings = normalizeAppState({
      projects: {
        workspaces: {
          'D:/Cards/Demo': {
            packageBuilder: {
              name: 'Theme',
              version: '2.1.0',
              fontFamilyKeys: ['latin', 'latin', 42],
              fontCompositionKeys: ['body'],
              iconSeriesKeys: [],
              imagePaths: ['images\\card.png'],
            },
          },
        },
      },
    })

    expect(settings.projects.workspaces['D:/Cards/Demo']).toEqual({
      expandedDirectories: [],
      packageBuilder: {
        name: 'Theme',
        author: '',
        version: '2.1.0',
        title: '',
        fontFamilyKeys: ['latin'],
        fontCompositionKeys: ['body'],
        iconSeriesKeys: [],
        imagePaths: ['images/card.png'],
        customBlockKeys: [],
        otherPaths: [],
      },
    })
  })

  it('ignores a malformed remembered package-builder selection', () => {
    const settings = normalizeAppState({
      projects: {
        workspaces: { 'D:/Cards/Demo': { expandedDirectories: ['assets'], packageBuilder: 'broken' } },
      },
    })

    expect(settings.projects.workspaces['D:/Cards/Demo']).toEqual({
      expandedDirectories: ['assets'],
    })
  })

  it('normalizes, deduplicates, and limits recent projects', () => {
    const settings = normalizeAppState({
      projects: {
        recent: [
          'D:\\Cards\\',
          'd:/cards',
          ' D:\\Projects\\One ',
          'D:/Projects/Two',
          'D:/Projects/Three',
          'D:/Projects/Four',
          'D:/Projects/Five',
          'D:/Projects/Six',
          'D:/Projects/Seven',
          'D:/Projects/Eight',
          'D:/Projects/Nine',
          42,
        ],
      },
    })

    expect(settings.projects.recent).toEqual([
      'D:/Cards',
      'D:/Projects/One',
      'D:/Projects/Two',
      'D:/Projects/Three',
      'D:/Projects/Four',
      'D:/Projects/Five',
      'D:/Projects/Six',
      'D:/Projects/Seven',
    ])
  })
})

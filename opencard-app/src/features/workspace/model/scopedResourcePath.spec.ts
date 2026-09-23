import { describe, expect, it } from 'vitest'
import {
  relativizeResourcePath,
  resolveResourcePath,
  type PackageScopeRoots,
  type ScopedResourcePathResult,
} from './scopedResourcePath'

function expectPath(result: ScopedResourcePathResult, value: string): void {
  expect(result).toEqual({ ok: true, value })
}

function expectIssue(result: ScopedResourcePathResult, code: string): void {
  expect(result).toMatchObject({ ok: false, code })
}

const project = 'D:/project'
const themeRoot = 'C:/Users/Me/.opencard/cache/packages/aa11'
const newerThemeRoot = 'C:/Users/Me/.opencard/cache/packages/bb22'
const iconsRoot = 'C:/Users/Me/.opencard/cache/packages/cc33'
const packageRoots: PackageScopeRoots = new Map([
  ['alice/theme@1.0.0', themeRoot],
  ['alice/theme@1.2.0', newerThemeRoot],
  ['bob/icons@2.0.0', iconsRoot],
])

describe('resolveResourcePath', () => {
  it('resolves scope, host, pinned-version, and newest-version references', () => {
    const host = { scopeRootPath: project, projectRootPath: project, packageRoots }
    expectPath(resolveResourcePath({ ...host, reference: 'images/bg.png' }), `${project}/images/bg.png`)
    expectPath(resolveResourcePath({ ...host, reference: '/images/bg.png' }), `${project}/images/bg.png`)
    expectPath(resolveResourcePath({ ...host, reference: 'alice/theme@1.0.0#icons/ok.svg' }), `${themeRoot}/icons/ok.svg`)
    // 不写版本就取最高的那一版 —— 所以"装错版本"这件事不存在。
    expectPath(resolveResourcePath({ ...host, reference: 'alice/theme#icons/ok.svg' }), `${newerThemeRoot}/icons/ok.svg`)
  })

  it('resolves a package against its own root, and the host through the project anchor', () => {
    const scoped = { scopeRootPath: themeRoot, projectRootPath: project, packageRoots }
    expectPath(resolveResourcePath({ ...scoped, reference: 'images/bg.png' }), `${themeRoot}/images/bg.png`)
    expectPath(resolveResourcePath({ ...scoped, reference: '#assets/logo.png' }), `${project}/assets/logo.png`)
  })

  it('rejects unsafe syntax, package-storage bypasses, and unknown coordinates', () => {
    const host = { scopeRootPath: project, projectRootPath: project, packageRoots }
    expectIssue(resolveResourcePath({ ...host, reference: '../secret.png' }), 'unsafe-path')
    expectIssue(resolveResourcePath({ ...host, reference: 'images\\bg.png' }), 'unsafe-path')
    expectIssue(resolveResourcePath({ ...host, reference: 'alice/theme@1.0.0#images/bg#extra.png' }), 'unsafe-path')
    expectIssue(resolveResourcePath({ ...host, reference: '.opencard/packages/alice/theme/1.0.0/bg.png' }), 'reserved-path')
    expectIssue(resolveResourcePath({ ...host, reference: 'theme#main.png' }), 'invalid-reference')
    expectIssue(resolveResourcePath({ ...host, reference: 'bad key#main.png' }), 'invalid-reference')
    expectIssue(resolveResourcePath({ ...host, reference: 'carol/pack@1.0.0#a.png' }), 'package-unavailable')
    expectIssue(resolveResourcePath({ ...host, reference: 'alice/theme@9.9.9#a.png' }), 'package-unavailable')
  })

  it('keeps POSIX containment case-sensitive', () => {
    expectPath(resolveResourcePath({
      scopeRootPath: '/project', projectRootPath: '/project', reference: 'image.png',
    }), '/project/image.png')
  })
})

describe('relativizeResourcePath', () => {
  it('writes the shortest canonical reference for each scope relationship', () => {
    expectPath(relativizeResourcePath({
      scopeRootPath: project, projectRootPath: project, targetPath: `${project}/assets/logo.png`,
    }), 'assets/logo.png')
    expectPath(relativizeResourcePath({
      scopeRootPath: themeRoot, projectRootPath: project, targetPath: `${themeRoot}/images/bg.png`,
    }), 'images/bg.png')
    expectPath(relativizeResourcePath({
      scopeRootPath: themeRoot, projectRootPath: project, targetPath: `${project}/assets/logo.png`,
    }), '#assets/logo.png')
    expectPath(relativizeResourcePath({
      scopeRootPath: project, projectRootPath: project, packageRoots, targetPath: `${themeRoot}/images/bg.png`,
    }), 'alice/theme@1.0.0#images/bg.png')
  })

  it('rejects targets that belong to no scope the reference can name', () => {
    expectIssue(relativizeResourcePath({
      scopeRootPath: project, projectRootPath: project, targetPath: 'D:/other/image.png',
    }), 'target-outside-scope')
  })
})

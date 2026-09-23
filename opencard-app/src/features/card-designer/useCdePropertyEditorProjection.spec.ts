import { computed, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ReferenceStringPropertyField from '../../shared/ui/property-editor/fields/ReferenceStringPropertyField.vue'
import { describe, expect, it, vi } from 'vitest'
import {
  createSimpleContainerBlock,
  createTextBlock,
  type CardDocument,
} from '../../entities/card/model'
import { buildParentLookup } from '../../entities/card/tree'
import type { FilePathDirectoryProvider } from '../../shared/model/filePath'
import type { CardPropertyEditorInput } from '../card-properties/cardPropertyFieldDefinitions'
import { useCdePropertyEditorProjection } from './useCdePropertyEditorProjection'
import { setProjectFonts } from '../workspace/model/projectFonts'
import type { ProjectResourceEnvironment } from '../workspace/services/projectResourceEnvironment'
import { EMPTY_PROJECT_ICON_CATALOG } from '../workspace/services/projectIconCatalog'
import { normalizeResourcePackageManifest } from '../workspace/model/resourcePackage'

function createHarness(resourceEnvironment = ref<ProjectResourceEnvironment>()) {
  const text = createTextBlock({
    id: 'text',
    name: 'Text',
    content: 'Instance content',
    fontFamily: 'font:body; Arial; sans-serif',
    fontSize: '18px',
  })
  const parent = createSimpleContainerBlock({ id: 'parent', name: 'Parent' })
  parent.children.push({
    block: text,
    location: { id: 'text-location', type: 'simple-container-location', anchor: 'lt' },
  })
  const document: CardDocument = {
    type: 'card-document',

    id: 'document',
    name: 'Blueprint',
    version: '1.0.0',
    width: '540',
    height: '850',
    faces: {
      front: {
        type: 'card-face',
        id: 'front',
        background: '#fff',
        children: [{
          block: parent,
          location: { id: 'parent-location', type: 'simple-container-location', anchor: 'lt' },
        }],
      },
      back: { type: 'card-face', id: 'back', background: '#000', children: [] },
    },
    instances: [{
      type: 'card-instance',
      id: 'instance',
      name: 'Instance',
      amount: '1',
      data: { text: { content: 'Instance content' } },
    }],
  }
  const rawPropertyInputs = ref<readonly CardPropertyEditorInput[]>([{
    key: text.id,
    record: { ...text, source: '' } as unknown as Record<string, unknown>,
    fields: {
      content: { fieldType: 'string', title: 'Content', richText: true },
      fontFamily: { fieldType: 'string', title: 'Font family' },
      source: { fieldType: 'filePath', title: 'Source' },
      optional: { fieldType: 'string', title: 'Optional' },
    },
  }])
  const directoryProvider = vi.fn<FilePathDirectoryProvider>(async () => [{ name: 'portrait.png' }])
  const state = useCdePropertyEditorProjection({
    cardDoc: ref(document),
    documentRevision: ref(0),
    activeFaceKey: ref('front'),
    selectedCardId: ref('instance'),
    selectedBlock: ref(text),
    parentLookup: ref(buildParentLookup(document)),
    rawPropertyInputs,
    projectContext: computed(() => ({
      resourceEnvironment: resourceEnvironment.value,
      fonts: {
        body: {
          kind: 'family' as const,
          name: 'Body Font',
            family: {
              key: 'body',
              name: 'Body Font',
              files: { normal: { upright: 'fonts/body.woff2' } },
          },
        },
      },
      information: { name: 'Project', description: 'Description', version: '2.0.0' },
      dictionary: { greeting: 'Hello' },
    })),
    directoryProvider: ref(directoryProvider),
    blueprintCardId: '__blueprint__',
    translate: (key, parameters) => parameters?.depth ? `${key}:${parameters.depth}` : key,
    hasMessage: () => false,
  })
  return { directoryProvider, state }
}

async function completionResult(
  provider: ((request: { value: string; cursor: number }) => unknown) | undefined,
  value: string,
  cursor: number,
) {
  return await Promise.resolve(provider?.({ value, cursor })) as {
    items: Array<{ insertText: string; value?: unknown; labelStyle?: Readonly<Record<string, string>> }>
    parent?: { label: string; insertText: string; keepOpen?: boolean }
  } | null
}

async function completionItems(
  provider: ((request: { value: string; cursor: number }) => unknown) | undefined,
  value: string,
  cursor: number,
) {
  const result = await completionResult(provider, value, cursor)
  return result?.items ?? []
}

describe('useCdePropertyEditorProjection', () => {
  it('refreshes package font completion and previews from the environment snapshot', async () => {
    const coordinate = 'alice/theme@1.0.0'
    const invisibleCoordinate = 'goblin/invisible@1.0.0'
    const child: ProjectResourceEnvironment = {
      kind: 'package', namespace: 'package-alice-theme-1.0.0',
      rootPath: '/project/.opencard/packages/alice/theme/1.0.0',
      fonts: { body: { kind: 'family', name: 'Body', family: { key: 'body', name: 'Body', files: {} } } },
      fontDocument: {}, iconDocument: {}, iconCatalog: EMPTY_PROJECT_ICON_CATALOG,
    }
    const environment = ref<ProjectResourceEnvironment>({ ...child, kind: 'project', namespace: 'project', fonts: {} })
    const { state } = createHarness(environment)
    const fields = () => state.propertyEditorInputs.value[0]!.fields
    expect(await completionItems(fields().fontFamily?.completion?.provider, 'alice/theme@1.0.0#', 18)).toEqual([])
    environment.value = {
      ...environment.value,
      packages: new Map([[coordinate, {
        coordinate: { author: 'alice', name: 'theme', version: '1.0.0' },
        manifest: normalizeResourcePackageManifest({
          type: 'opencard-resource-package',
          author: 'alice', name: 'theme', version: '1.0.0', title: 'Theme',
          public: { fonts: [], iconSeries: [] },
        }).manifest,
        archivePath: '/project/.opencard/packages/theme.ocpack',
        fingerprint: 'fp-theme',
        rootPath: child.rootPath!, cover: null,
      }]]),
      packageEnvironments: new Map([[coordinate, child], [invisibleCoordinate, child]]),
    }
    expect(await completionItems(fields().fontFamily?.completion?.provider, 'alice/theme@1.0.0#', 18)).toEqual([
      expect.objectContaining({ insertText: 'alice/theme@1.0.0#font:', keepOpen: true }),
    ])
    const completion = await completionResult(
      fields().fontFamily?.completion?.provider,
      'alice/theme@1.0.0#font:',
      24,
    )
    expect(completion?.items).toEqual([expect.objectContaining({
      insertText: 'alice/theme@1.0.0#font:body', value: 'alice/theme@1.0.0#font:body',
      labelStyle: { fontFamily: '"OpenCardResource-package-alice-theme-1.0.0-body"' },
    })])
    expect(completion?.parent).toEqual(expect.objectContaining({ label: '..', insertText: '', keepOpen: true }))
    expect(fields().content?.fontOptions).toContainEqual(expect.objectContaining({
      value: 'alice/theme@1.0.0#font:body', cssFamily: '"OpenCardResource-package-alice-theme-1.0.0-body"',
    }))
    expect(fields().content?.fontOptions?.some(font => font.value.startsWith(invisibleCoordinate))).toBe(false)
    expect(await completionItems(fields().fontFamily?.completion?.provider, 'Ar', 2)).toEqual([])
    const definition = fields().fontFamily!
    if (definition.fieldType !== 'string') throw new Error('Expected a string font field')
    const wrapper = mount(ReferenceStringPropertyField, {
      attachTo: document.body,
      props: { definition, value: 'Arial; alice/theme@1.0.0#; Georgia' },
    })
    try {
      const input = wrapper.get('input')
      input.element.setSelectionRange(25, 25)
      await input.trigger('focus')
      await flushPromises()
      expect(document.body.querySelector('[role="option"]')?.textContent?.trim()).toBe('Theme')
      await input.trigger('keydown', { key: 'Tab' })
      await flushPromises()
      expect(input.element.value).toBe('Arial; alice/theme@1.0.0#font:; Georgia')
      expect(document.body.querySelector('[role="option"]')?.textContent?.trim()).toBe('Body')
      await input.trigger('keydown', { key: 'ArrowDown' })
      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(input.element.value).toBe('Arial; ; Georgia')
      expect(document.body.querySelector('[role="option"]')?.textContent?.trim()).toBe('Theme')
      await input.trigger('keydown', { key: 'Tab' })
      await flushPromises()
      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(wrapper.emitted('update:value')?.slice(-1)[0]).toEqual(['Arial; alice/theme@1.0.0#font:body; Georgia'])
    } finally {
      wrapper.unmount()
    }
    environment.value = { ...environment.value, packageEnvironments: new Map() }
    expect(await completionItems(fields().fontFamily?.completion?.provider, 'alice/theme@1.0.0#', 18)).toEqual([])
  })
  it('builds instance, parent, project, and dictionary binding scopes', async () => {
    const { state } = createHarness()
    const definition = state.propertyEditorInputs.value[0]!.fields.content!
    const provider = definition.completion?.provider

    expect((await completionItems(provider, '{{card:}}', 7)).map(item => item.insertText))
      .toContain('card:name')
    expect((await completionItems(provider, '{{card:}}', 7)).map(item => item.insertText))
      .not.toContain('card:version')
    expect((await completionItems(provider, '{{parent:}}', 9)).map(item => item.insertText))
      .toContain('parent:name')
    expect((await completionItems(provider, '{{project:}}', 10)).map(item => item.insertText))
      .toContain('project:version')
    expect((await completionItems(provider, '{{dictionary:}}', 13)).map(item => item.insertText))
      .toContain('dictionary:greeting')
  })

  it('adds project fonts and rich-text base styles without owning UI state', async () => {
    setProjectFonts([{
      key: 'body',
      name: 'Body Font',
      files: { normal: { upright: 'fonts/body.woff2' } },
    }])
    const { state } = createHarness()
    const fields = state.propertyEditorInputs.value[0]!.fields
    const rootItems = await completionItems(fields.fontFamily?.completion?.provider, '', 0)
    expect(rootItems).toContainEqual(expect.objectContaining({ insertText: 'font:', keepOpen: true }))
    expect(rootItems.map(item => item.value)).not.toContain('font:body')
    const fontItems = await completionItems(fields.fontFamily?.completion?.provider, 'font:Body', 9)

    expect(fontItems.map(item => item.value)).toContain('font:body')
    expect(fontItems.find(item => item.value === 'font:body')?.labelStyle)
      .toEqual({ fontFamily: '"OpenCardProjectFont-body"' })
    expect(fields.content?.fontOptions?.map(item => item.value)).toContain('font:body')
    expect(fields.content?.richTextBaseStyle).toEqual({
      fontFamily: '"OpenCardProjectFont-body", Arial, sans-serif',
      fontSize: '18px',
    })

    const fallbackValue = 'font:body; font:Bo'
    const completion = await fields.fontFamily?.completion?.provider?.({
      value: fallbackValue,
      cursor: fallbackValue.length,
    })
    expect(completion).toMatchObject({ replaceStart: 10, replaceEnd: fallbackValue.length })
    expect(completion?.items.find(item => item.value === ' font:body')?.insertText).toBe(' font:body')
  })

  it('passes file-path directory reads through the injected provider', async () => {
    const { directoryProvider, state } = createHarness()
    const definition = state.propertyEditorInputs.value[0]!.fields.source
    expect(definition?.fieldType).toBe('filePath')
    if (!definition || definition.fieldType !== 'filePath') return
    const entries = await definition.directoryProvider?.('images')

    expect(entries).toEqual([{ name: 'portrait.png' }])
    expect(directoryProvider).toHaveBeenCalledWith('images')
  })

  it('does not invent binding context for schema fields absent from the record', () => {
    const { state } = createHarness()
    const definition = state.propertyEditorInputs.value[0]!.fields.optional

    expect(definition?.binding).toBeUndefined()
    expect(definition?.completion).toBeUndefined()
  })
})

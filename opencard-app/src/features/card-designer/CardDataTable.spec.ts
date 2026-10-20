import { actionChildren } from '../../shared/ui/action/action.types'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import OcActionButton from '../../components/standard/OcActionButton.vue'
import PropertyFieldActionRail from '../../shared/ui/property-editor/PropertyFieldActionRail.vue'
import PropertyFieldRenderer from '../../shared/ui/property-editor/PropertyFieldRenderer.vue'
import CardDataTable from './CardDataTable.vue'
import type {
  CdeDataTableFaceCatalog,
  CdeDataTableFaceGroup,
  CdeDataTableFieldRow,
} from './useCdeDataTableModel'
import { useFloatingMenu } from '../../composables/useFloatingMenu'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const columns = [
  { key: '__blueprint__', kind: 'blueprint' as const, title: 'Blueprint', exported: true },
  { key: 'instance', kind: 'instance' as const, title: 'Instance', exported: true },
]

const faceGroups: CdeDataTableFaceGroup[] = [{
  key: 'front',
  title: 'Front',
  blocks: [{
    key: 'text',
    title: 'Title',
    type: 'text-block',
    depth: 1,
    fields: [{
      key: 'content',
      title: 'Content',
      definition: { title: 'Content', fieldType: 'string' },
      deletable: true,
      cells: [
        {
          identity: '__blueprint__\0text\0content', cardId: '__blueprint__', value: 'Blueprint',
          readonly: false, inherited: false, overridden: false,
        },
        {
          identity: 'instance\0text\0content', cardId: 'instance', value: 'Override',
          readonly: false, inherited: false, overridden: true,
        },
      ],
    }],
  }],
}, {
  key: 'back',
  title: 'Back',
  blocks: [],
}]

const catalogFaceGroups: CdeDataTableFaceCatalog[] = faceGroups.map(face => ({
  key: face.key,
  title: face.title,
  blocks: face.blocks.map(block => ({
    ...block,
    fields: block.fields.map(({ cells: _cells, ...field }) => field),
  })),
}))
catalogFaceGroups[0]!.blocks[0]!.fields.push({
  key: 'fontSize',
  title: 'Font Size',
  definition: { title: 'Font Size', fieldType: 'string' },
  deletable: false,
})
catalogFaceGroups[0]!.blocks.push({
  key: 'image',
  title: 'Image',
  type: 'image-block',
  depth: 0,
  fields: [],
})

describe('CardDataTable', () => {
  afterEach(() => {
    useFloatingMenu().closeMenu()
    vi.unstubAllGlobals()
  })

  it('renders both face groups and emits key-only field and cell intents', async () => {
    const inheritedGroups = structuredClone(faceGroups)
    inheritedGroups[0]!.blocks[0]!.fields[0]!.cells[1] = {
      ...inheritedGroups[0]!.blocks[0]!.fields[0]!.cells[1]!,
      value: 'Blueprint',
      inherited: true,
      overridden: false,
    }
    const wrapper = mount(CardDataTable, {
      props: { columns, catalogFaceGroups, faceGroups: inheritedGroups },
    })

    expect(wrapper.findAll('.card-data-table__face-row')).toHaveLength(2)
    expect(wrapper.get('.card-data-table__face-row > th > .card-data-table__face-heading').element.tagName).toBe('SPAN')
    expect(wrapper.get('.card-data-table__block-heading').attributes('style'))
      .toContain('var(--oc-indent-step)')
    expect(wrapper.get('.card-data-table__field-heading').attributes('style'))
      .toContain('calc(var(--oc-indent-step) * 2)')
    expect(wrapper.get('[data-card-id="instance"]').classes()).toContain('is-inherited')
    expect(wrapper.findAllComponents(PropertyFieldRenderer).every(
      control => control.props('appearance') === 'embedded',
    )).toBe(true)

    const faceAction = wrapper.findAllComponents(OcActionButton)
      .find(action => action.props('action').key === 'add-block')!
    faceAction.vm.$emit('select', { key: 'image' })
    expect(wrapper.emitted('add-block')).toEqual([['image']])

    const blockAction = wrapper.findAllComponents(OcActionButton)
      .find(action => action.props('action').key === 'manage-fields')!
    blockAction.vm.$emit('select', { key: 'include-field:fontSize' })
    blockAction.vm.$emit('select', { key: 'create-field' })
    expect(wrapper.emitted('include-field')).toEqual([['text', 'fontSize']])
    expect(wrapper.emitted('create-field')).toEqual([['text']])

    const removeBlockAction = wrapper.findAllComponents(OcActionButton)
      .find(action => action.props('action').key === 'remove-block')!
    expect(removeBlockAction.props('action')).toMatchObject({
      icon: 'action.close',
      title: 'cardDesigner.dataTable.stopEditingBlock',
    })
    removeBlockAction.vm.$emit('select', { key: 'remove-block' })
    expect(wrapper.emitted('remove-block')).toEqual([['text']])

    await wrapper.get('button[aria-label="cardDesigner.dataTable.stopEditingField"]').trigger('click')
    expect(wrapper.emitted('exclude-field')).toEqual([['text', 'content']])
    await wrapper.get('button[aria-label="cardDesigner.dataTable.deleteField"]').trigger('click')
    expect(wrapper.emitted('delete-field')).toEqual([['text', 'content']])

    const blueprintInput = wrapper.get('[data-card-id="__blueprint__"] input')
    await blueprintInput.setValue('Changed')
    const updates = wrapper.emitted('update-cell') ?? []
    expect(updates[updates.length - 1]).toEqual([{
      cardId: '__blueprint__', blockId: 'text', fieldKey: 'content', value: 'Changed',
    }])
  })

  it('keeps Block and Field indentation fixed regardless of Block depth', () => {
    const nestedGroups = structuredClone(faceGroups)
    nestedGroups[0]!.blocks[0]!.depth = 4
    const wrapper = mount(CardDataTable, {
      props: { columns, catalogFaceGroups, faceGroups: nestedGroups },
    })

    expect(wrapper.get('.card-data-table__block-heading').attributes('style'))
      .toContain('var(--oc-indent-step)')
    expect(wrapper.get('.card-data-table__field-heading').attributes('style'))
      .toContain('calc(var(--oc-indent-step) * 2)')
  })

  it('renders readonly instance cells as non-focusable text', () => {
    const readonlyGroups = structuredClone(faceGroups)
    readonlyGroups[0]!.blocks[0]!.fields[0]!.cells[1]!.readonly = true
    const wrapper = mount(CardDataTable, {
      props: {
        columns,
        catalogFaceGroups,
        faceGroups: readonlyGroups,
      },
    })

    expect(wrapper.find('[data-card-id="__blueprint__"] input').exists()).toBe(true)
    expect(wrapper.find('[data-card-id="instance"] input').exists()).toBe(false)
    expect(wrapper.get('[data-card-id="instance"] .card-data-table__cell-preview').text()).toBe('Override')
  })

  it('marks multiline Field rows so focus expands every instance Cell together', () => {
    const multilineGroups = structuredClone(faceGroups)
    const definition = multilineGroups[0]!.blocks[0]!.fields[0]!.definition
    if (definition.fieldType !== 'string') throw new Error('Expected string field definition')
    definition.multiline = true
    const wrapper = mount(CardDataTable, {
      props: { columns, catalogFaceGroups, faceGroups: multilineGroups },
    })

    const row = wrapper.get('.card-data-table__field-row')
    expect(row.classes()).toContain('is-multiline')
    expect(row.findAll('textarea')).toHaveLength(2)
  })

  it('supports blueprint duplication and instance rename, copy, delete and reset actions', async () => {
    const wrapper = mount(CardDataTable, {
      attachTo: document.body,
      props: { columns, catalogFaceGroups, faceGroups },
    })
    expect(wrapper.findAllComponents(OcActionButton)
      .some(action => action.props('action').key === 'reset-cell')).toBe(true)
    const columnActions = wrapper.findAllComponents(OcActionButton)
      .filter(action => action.element.closest('thead'))
    expect(columnActions).toHaveLength(2)
    expect(columnActions[0]!.props('action').icon).toBe('action.add')

    columnActions[0]!.vm.$emit('select', { key: 'duplicate' })
    expect(wrapper.emitted('duplicate-card')).toEqual([['__blueprint__']])

    columnActions[1]!.vm.$emit('select', { key: 'rename' })
    await nextTick()
    const renameInput = wrapper.get('.card-data-table__rename input')
    expect(wrapper.find('.card-data-table__rename button').exists()).toBe(false)
    ;(renameInput.element as HTMLInputElement).focus()
    await renameInput.setValue('Renamed')
    ;(wrapper.get('[data-card-id="__blueprint__"] input').element as HTMLInputElement).focus()
    await nextTick()
    expect(wrapper.emitted('rename-instance')).toEqual([['instance', 'Renamed']])

    const currentColumnActions = wrapper.findAllComponents(OcActionButton)
      .filter(action => action.element.closest('thead'))
    currentColumnActions[1]!.vm.$emit('select', { key: 'rename' })
    await nextTick()
    await wrapper.get('.card-data-table__rename input').setValue('Cancelled')
    await wrapper.get('.card-data-table__rename input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.card-data-table__rename').exists()).toBe(false)
    expect(wrapper.emitted('rename-instance')).toEqual([['instance', 'Renamed']])

    const instanceAction = wrapper.findAllComponents(OcActionButton)
      .filter(action => action.element.closest('thead'))[1]!
    instanceAction.vm.$emit('select', { key: 'duplicate' })
    instanceAction.vm.$emit('select', { key: 'delete' })
    expect(wrapper.emitted('duplicate-card')).toEqual([['__blueprint__'], ['instance']])
    expect(wrapper.emitted('delete-instance')).toEqual([['instance']])

    await wrapper.get('button[aria-label="cardDesigner.dataTable.resetOverride"]').trigger('click')
    expect(wrapper.emitted('reset-cell')).toEqual([[
      { cardId: 'instance', blockId: 'text', fieldKey: 'content' },
    ]])
    wrapper.unmount()
  })

  it('projects editor mode and Instance reset through the same Cell Action Rail', async () => {
    const wrapper = mount(CardDataTable, {
      props: {
        columns,
        catalogFaceGroups,
        faceGroups,
        getCellDefinition: (_blockId, field) => ({
          ...field.definition,
          binding: { provider: () => null },
        }),
      },
    })
    const instanceCell = wrapper.get('[data-card-id="instance"]')
    const rail = instanceCell.getComponent(PropertyFieldActionRail)

    expect(rail.props('actions').map(action => action.key))
      .toEqual(['field-editor.use-raw-string', 'reset-cell'])
    rail.vm.$emit('action', 'field-editor.use-raw-string')
    await nextTick()
    expect(instanceCell.getComponent(PropertyFieldRenderer).props('editorId')).toBe('raw-string')

    instanceCell.getComponent(PropertyFieldActionRail).vm.$emit('action', 'reset-cell')
    expect(wrapper.emitted('reset-cell')).toEqual([[{
      cardId: 'instance', blockId: 'text', fieldKey: 'content',
    }]])
  })

  it('resizes columns with pointer and keyboard input within the supported bounds', async () => {
    const wrapper = mount(CardDataTable, { props: { columns, catalogFaceGroups, faceGroups } })
    const handles = wrapper.findAll('.card-data-table__column-resize')
    const columnElements = wrapper.findAll('colgroup col')

    expect(handles).toHaveLength(3)
    expect(handles[0]!.attributes('aria-valuenow')).toBe('232')
    expect(handles[1]!.attributes('aria-valuemin')).toBe('180')
    expect(handles[1]!.attributes('aria-valuemax')).toBe('520')
    expect(handles[1]!.attributes('aria-valuenow')).toBe('260')
    expect(columnElements[1]!.attributes('style')).toContain('260px')
    expect(wrapper.get('table').attributes('style')).toContain('792px')

    await handles[1]!.trigger('keydown', { key: 'Home' })
    expect(handles[1]!.attributes('aria-valuenow')).toBe('180')
    expect(columnElements[1]!.attributes('style')).toContain('180px')

    await handles[1]!.trigger('keydown', { key: 'End' })
    expect(handles[1]!.attributes('aria-valuenow')).toBe('520')
    expect(columnElements[1]!.attributes('style')).toContain('520px')

    handles[2]!.element.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 200,
    }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1200 }))
    await nextTick()
    expect(handles[2]!.attributes('aria-valuenow')).toBe('520')
    window.dispatchEvent(new MouseEvent('pointerup'))
    expect(document.documentElement.style.cursor).toBe('')
    expect(document.documentElement.style.userSelect).toBe('')
  })

  it('routes header and row context menus through the same command handlers', async () => {
    const wrapper = mount(CardDataTable, { props: { columns, catalogFaceGroups, faceGroups } })
    const menu = useFloatingMenu()
    const headings = wrapper.findAll('.card-data-table__column-heading')

    await headings[1]!.trigger('contextmenu', { clientX: 20, clientY: 30 })
    expect(menu.state.value.items.map(item => item.key)).toEqual([
      'rename', 'duplicate', 'column-danger-divider', 'delete',
    ])
    menu.selectMenuItem('duplicate')
    expect(wrapper.emitted('duplicate-card')).toEqual([['instance']])

    await wrapper.get('.card-data-table__block-heading').trigger('contextmenu')
    expect(menu.state.value.items.map(item => item.key)).toEqual([
      'manage-fields', 'block-remove-divider', 'remove-block',
    ])
    const manageFields = menu.state.value.items[0]
    expect(manageFields?.type !== 'divider' && actionChildren(manageFields).map(item => item.key))
      .toEqual(['include-field:fontSize', 'create-field-divider', 'create-field'])
    menu.selectMenuItem('remove-block')
    expect(wrapper.emitted('remove-block')).toEqual([['text']])

    await wrapper.get('.card-data-table__field-heading').trigger('contextmenu')
    expect(menu.state.value.items.map(item => item.key)).toEqual([
      'exclude-field', 'field-delete-divider', 'delete-field',
    ])
    menu.selectMenuItem('exclude-field')
    expect(wrapper.emitted('exclude-field')).toEqual([['text', 'content']])
  })

  it('reveals a Cell and places the caret at the issue character offset', async () => {
    const wrapper = mount(CardDataTable, {
      attachTo: document.body,
      props: { columns, catalogFaceGroups, faceGroups },
    })
    const cell = wrapper.get('[data-card-id="instance"]')
    const input = cell.get('input').element as HTMLInputElement
    const scrollIntoView = vi.fn()
    cell.element.scrollIntoView = scrollIntoView

    await expect((wrapper.vm as unknown as {
      revealCell: (
        cardId: string,
        blockId: string,
        fieldKey: string,
        characterOffset?: number,
      ) => Promise<boolean>
    }).revealCell('instance', 'text', 'content', 3)).resolves.toBe(true)

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(3)
    expect(cell.classes()).toContain('is-revealed')
    wrapper.unmount()
  })

  it('mounts field editors only when their Cell enters the lazy overscan area', async () => {
    let revealIntersection: ((element: Element) => void) | null = null
    class IntersectionObserverMock {
      constructor(callback: IntersectionObserverCallback) {
        revealIntersection = element => callback([{
          target: element,
          isIntersecting: true,
          intersectionRatio: 1,
        } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock)
    const getCellDefinition = vi.fn((_blockId: string, field: CdeDataTableFieldRow) => field.definition)

    const wrapper = mount(CardDataTable, {
      props: { columns, catalogFaceGroups, faceGroups, getCellDefinition },
    })
    await nextTick()

    const blueprintCell = wrapper.get('[data-card-id="__blueprint__"]')
    const instanceCell = wrapper.get('[data-card-id="instance"]')
    expect(blueprintCell.find('input').exists()).toBe(false)
    expect(instanceCell.find('input').exists()).toBe(false)
    expect(wrapper.findAll('.card-data-table__cell-preview')).toHaveLength(2)
    expect(getCellDefinition).not.toHaveBeenCalled()

    revealIntersection!(instanceCell.element)
    await nextTick()

    expect(blueprintCell.find('input').exists()).toBe(false)
    expect(instanceCell.find('input').exists()).toBe(true)
    expect(wrapper.findAll('.card-data-table__cell-preview')).toHaveLength(1)
    expect(getCellDefinition).toHaveBeenCalledWith(
      'text',
      expect.objectContaining({ key: 'content' }),
      expect.objectContaining({ cardId: 'instance' }),
    )
  })

  it('selects the corresponding card target when a Cell is clicked or focused', async () => {
    const wrapper = mount(CardDataTable, {
      props: { columns, catalogFaceGroups, faceGroups },
    })
    const instanceCell = wrapper.get('[data-card-id="instance"]')

    await instanceCell.trigger('pointerdown')

    expect(wrapper.emitted('cell-select')).toEqual([[
      { faceKey: 'front', cardId: 'instance', blockId: 'text', fieldKey: 'content' },
    ]])
    expect(instanceCell.classes()).toContain('is-selected')

    await wrapper.get('[data-card-id="__blueprint__"] input').trigger('focusin')
    expect(wrapper.emitted('cell-select')?.[1]).toEqual([
      { faceKey: 'front', cardId: '__blueprint__', blockId: 'text', fieldKey: 'content' },
    ])
  })

  it('refreshes mounted Cell definitions when the parent context changes', async () => {
    let definition: CdeDataTableFieldRow['definition'] = {
      title: 'Initial definition',
      fieldType: 'string',
    }
    const getCellDefinition = vi.fn(() => definition)
    const wrapper = mount(CardDataTable, {
      props: { columns, catalogFaceGroups, faceGroups, getCellDefinition },
    })

    const instanceCell = wrapper.get('[data-card-id="instance"]')
    expect(instanceCell.getComponent(PropertyFieldRenderer).props('definition').title)
      .toBe('Initial definition')

    definition = { title: 'Updated definition', fieldType: 'string' }
    wrapper.vm.$forceUpdate()
    await nextTick()

    expect(instanceCell.getComponent(PropertyFieldRenderer).props('definition').title)
      .toBe('Updated definition')
  })

  it('emits Instance export selection without owning workbook actions', async () => {
    const wrapper = mount(CardDataTable, {
      props: { columns, catalogFaceGroups, faceGroups },
    })

    const exportToggle = wrapper.get('[aria-label="cardDesigner.dataTable.excludeInstanceFromExport"]')
    expect(exportToggle.get('.oc-icon').attributes('style')).toContain('var(--oc-icon-accent)')

    await exportToggle.trigger('click')
    expect(wrapper.emitted('set-instance-exported')).toEqual([['instance', false]])
    expect(wrapper.find('.card-data-table__toolbar').exists()).toBe(false)
  })
})

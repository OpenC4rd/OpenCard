import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import OcActionButton from '../../components/standard/OcActionButton.vue'
import CardDataTable from './CardDataTable.vue'
import type {
  CdeDataTableFaceCatalog,
  CdeDataTableFaceGroup,
  CdeDataTableFieldRow,
} from './useCdeDataTableModel'

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
      resettable: true,
      definitionEditable: false,
      cells: [
        {
          identity: '__blueprint__\0text\0content', cardId: '__blueprint__', kind: 'blueprint',
          value: 'Blueprint', readonly: false, inherited: false, overridden: false,
        },
        {
          identity: 'instance\0text\0content', cardId: 'instance', kind: 'instance',
          value: 'Override', readonly: false, inherited: false, overridden: true,
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
  resettable: false,
  definitionEditable: false,
})
catalogFaceGroups[0]!.blocks.push({
  key: 'image',
  title: 'Image',
  type: 'image-block',
  depth: 0,
  fields: [],
})

function actionByKey(wrapper: ReturnType<typeof mount>, key: string) {
  return wrapper.findAllComponents(OcActionButton)
    .find(action => action.props('action').key === key)!
}

describe('CardDataTable', () => {
  it('emits key-only field and cell intents from the block row actions and cells', async () => {
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

    actionByKey(wrapper, 'add-block').vm.$emit('select', { key: 'image' })
    expect(wrapper.emitted('add-block')).toEqual([['image']])

    const blockAction = actionByKey(wrapper, 'manage-fields')
    blockAction.vm.$emit('select', { key: 'include-field:fontSize' })
    blockAction.vm.$emit('select', { key: 'create-field' })
    expect(wrapper.emitted('include-field')).toEqual([['text', 'fontSize']])
    expect(wrapper.emitted('create-field')).toEqual([['text']])

    actionByKey(wrapper, 'remove-block').vm.$emit('select', { key: 'remove-block' })
    expect(wrapper.emitted('remove-block')).toEqual([['text']])

    await wrapper.get('button[aria-label="cardDesigner.dataTable.stopEditingField"]').trigger('click')
    expect(wrapper.emitted('exclude-field')).toEqual([['text', 'content']])
    await wrapper.get('[data-card-id="__blueprint__"] [data-action-key="reset-field"] button').trigger('click')
    expect(wrapper.emitted('reset-field')).toEqual([['text', 'content']])

    await wrapper.get('[data-card-id="__blueprint__"] input').setValue('Changed')
    const updates = wrapper.emitted('update-cell') ?? []
    expect(updates[updates.length - 1]).toEqual([{
      cardId: '__blueprint__', blockId: 'text', fieldKey: 'content', value: 'Changed',
    }])
  })

  it('offers definition editing only for custom fields', async () => {
    const plain = mount(CardDataTable, {
      props: { columns, catalogFaceGroups, faceGroups },
    })
    expect(plain.find('button[aria-label="cardDesigner.dataTable.editFieldDefinition"]').exists()).toBe(false)

    const customGroups = structuredClone(faceGroups)
    customGroups[0]!.blocks[0]!.fields[0]!.definitionEditable = true
    const wrapper = mount(CardDataTable, {
      props: { columns, catalogFaceGroups, faceGroups: customGroups },
    })

    await wrapper.get('button[aria-label="cardDesigner.dataTable.editFieldDefinition"]').trigger('click')
    expect(wrapper.emitted('edit-field-definition')).toEqual([['text', 'content']])
  })

  it('duplicates blueprint columns and commits an instance rename only on blur', async () => {
    const wrapper = mount(CardDataTable, {
      attachTo: document.body,
      props: { columns, catalogFaceGroups, faceGroups },
    })
    const columnActions = () => wrapper.findAllComponents(OcActionButton)
      .filter(action => action.element.closest('thead'))

    columnActions()[0]!.vm.$emit('select', { key: 'duplicate' })
    expect(wrapper.emitted('duplicate-card')).toEqual([['__blueprint__']])

    columnActions()[1]!.vm.$emit('select', { key: 'rename' })
    await nextTick()
    const renameInput = wrapper.get('.card-data-table__rename input')
    ;(renameInput.element as HTMLInputElement).focus()
    await renameInput.setValue('Renamed')
    ;(wrapper.get('[data-card-id="__blueprint__"] input').element as HTMLInputElement).focus()
    await nextTick()
    expect(wrapper.emitted('rename-instance')).toEqual([['instance', 'Renamed']])

    columnActions()[1]!.vm.$emit('select', { key: 'rename' })
    await nextTick()
    await wrapper.get('.card-data-table__rename input').setValue('Cancelled')
    await wrapper.get('.card-data-table__rename input').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('rename-instance')).toEqual([['instance', 'Renamed']])

    columnActions()[1]!.vm.$emit('select', { key: 'duplicate' })
    columnActions()[1]!.vm.$emit('select', { key: 'delete' })
    expect(wrapper.emitted('duplicate-card')).toEqual([['__blueprint__'], ['instance']])
    expect(wrapper.emitted('delete-instance')).toEqual([['instance']])

    await wrapper.get('button[aria-label="cardDesigner.dataTable.resetOverride"]').trigger('click')
    expect(wrapper.emitted('reset-cell')).toEqual([[
      { cardId: 'instance', blockId: 'text', fieldKey: 'content' },
    ]])
    wrapper.unmount()
  })

  it('resizes columns with keyboard and pointer input within the supported bounds', async () => {
    const wrapper = mount(CardDataTable, { props: { columns, catalogFaceGroups, faceGroups } })
    const handles = wrapper.findAll('.card-data-table__column-resize')

    expect(handles[0]!.attributes('aria-valuenow')).toBe('232')
    expect(handles[1]!.attributes('aria-valuemin')).toBe('180')
    expect(handles[1]!.attributes('aria-valuemax')).toBe('520')
    expect(handles[1]!.attributes('aria-valuenow')).toBe('260')

    await handles[1]!.trigger('keydown', { key: 'Home' })
    expect(handles[1]!.attributes('aria-valuenow')).toBe('180')

    await handles[1]!.trigger('keydown', { key: 'End' })
    expect(handles[1]!.attributes('aria-valuenow')).toBe('520')

    handles[2]!.element.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 200,
    }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1200 }))
    await nextTick()
    expect(handles[2]!.attributes('aria-valuenow')).toBe('520')
    window.dispatchEvent(new MouseEvent('pointerup'))
  })

  it('reveals a Cell and places the caret at the issue character offset', async () => {
    const wrapper = mount(CardDataTable, {
      attachTo: document.body,
      props: { columns, catalogFaceGroups, faceGroups },
    })
    const cell = wrapper.get('[data-card-id="instance"]')
    const input = cell.get('input').element as HTMLInputElement

    await expect((wrapper.vm as unknown as {
      revealCell: (
        cardId: string,
        blockId: string,
        fieldKey: string,
        characterOffset?: number,
      ) => Promise<boolean>
    }).revealCell('instance', 'text', 'content', 3)).resolves.toBe(true)

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(3)
    wrapper.unmount()
  })

  it('resolves a Cell definition only once its Cell enters the lazy overscan area', async () => {
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

    const instanceCell = wrapper.get('[data-card-id="instance"]')
    expect(getCellDefinition).not.toHaveBeenCalled()

    revealIntersection!(instanceCell.element)
    await nextTick()

    expect(getCellDefinition).toHaveBeenCalledWith(
      'text',
      expect.objectContaining({ key: 'content' }),
      expect.objectContaining({ cardId: 'instance' }),
    )
    vi.unstubAllGlobals()
  })

  it('selects the corresponding card target when a Cell is clicked or focused', async () => {
    const wrapper = mount(CardDataTable, {
      props: { columns, catalogFaceGroups, faceGroups },
    })

    await wrapper.get('[data-card-id="instance"]').trigger('pointerdown')
    expect(wrapper.emitted('cell-select')).toEqual([[
      { faceKey: 'front', cardId: 'instance', blockId: 'text', fieldKey: 'content' },
    ]])

    await wrapper.get('[data-card-id="__blueprint__"] input').trigger('focusin')
    expect(wrapper.emitted('cell-select')?.[1]).toEqual([
      { faceKey: 'front', cardId: '__blueprint__', blockId: 'text', fieldKey: 'content' },
    ])
  })
})

import { renderRichTextDocument } from '../../../shared/ui/rich-text/renderRichTextDocument'
import { defineComponent, h, type PropType, type VNodeChild } from 'vue'
import type { RichTextIconNode } from '../../../shared/rich-text/richTextHtml'
import { formatProjectIconPath } from '../../../shared/rich-text/projectIconReference'
import type { RenderReadyTextBlock } from '../render.types'
import type { PreparedRichText } from '../prepareRichText'
import { useCardEditorContext } from './cardEditorContext'
import OcIcon from '../../../components/base/OcIcon.vue'
import ProjectIconGraphic from './ProjectIconGraphic.vue'

export default defineComponent({
  name: 'RichTextDocumentRenderer',
  props: {
    prepared: { type: Object as PropType<PreparedRichText>, required: true },
    ownerBlock: { type: Object as PropType<RenderReadyTextBlock>, required: true },
  },
  setup(props) {
    const context = useCardEditorContext()
    function renderIcon(node: RichTextIconNode): VNodeChild {
      const resource = context.resources.resolve({
        value: formatProjectIconPath({
          packageKey: node.packageKey,
          seriesKey: node.seriesKey,
          iconKey: node.iconKey,
        }),
        expect: 'asset',
        blockId: props.ownerBlock.id,
        fieldKey: 'content',
      })
      const entry = resource.kind === 'icon' ? resource.entry : null
      return entry
        ? h(ProjectIconGraphic, {
            class: 'project-inline-icon',
            entry,
            mode: 'inline',
            readDimensions: context.resources.resolveIconDimensions,
          })
        : h(OcIcon, { name: 'mdiAlertOutline', tone: 'warning', size: 'md' })
    }
    const renderDocument = () => renderRichTextDocument(props.prepared.document.children, {
      resolveFont: reference => {
        const resource = context.resources.resolve({ value: reference, expect: 'font', blockId: props.ownerBlock.id, fieldKey: 'content' })
        return resource.kind === 'font' ? resource.cssFamily : null
      },
      resolveImage: reference => {
        const resource = context.resources.resolve({ value: reference, expect: 'asset', blockId: props.ownerBlock.id, fieldKey: 'content' })
        return resource.kind === 'url' ? resource.src : resource.kind === 'icon' ? resource.entry.src : null
      },
      renderIcon,
    })
    return () => props.prepared.valid
      ? h('div', { class: 'rich-text-document' }, renderDocument())
      : h('div', { class: 'rich-text-document rich-text-document--invalid' }, [
          h(OcIcon, { name: 'mdiAlertOutline', tone: 'warning', size: 'md' }),
        ])
  },
})

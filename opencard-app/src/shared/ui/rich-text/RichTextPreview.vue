<script setup lang="ts">
import { computed, h, type VNodeChild } from 'vue'
import {
  createProjectIconStyle,
  findProjectIcon,
  type ProjectIconCatalog,
  type ProjectIconCatalogEntry,
} from '../../../features/workspace/services/projectIconCatalog'
import type { ProjectIconSource } from '../../../features/workspace/services/projectIconCompletion'
import { parseRichTextHtml, type RichTextIconNode, type RichTextNode } from '../../rich-text/richTextHtml'
import { readProjectIconSize } from '../../../features/workspace/services/projectIconDimensionResolver'
import { resolveRichTextStyle } from '../../rich-text/richTextResourceStyle'

const props = defineProps<{
  html: string
  projectIconCatalog?: ProjectIconCatalog
  /** Icon sources including packages; the host catalog alone cannot resolve a package icon. */
  packageIconSources?: readonly ProjectIconSource[]
  fontOptions?: readonly { value: string; cssFamily?: string }[]
  resolveImageSource?: (reference: string) => string | null
}>()

const document = computed(() => parseRichTextHtml(props.html).document)

function resolveIconEntry(node: RichTextIconNode): ProjectIconCatalogEntry | null {
  const source = props.packageIconSources?.find(candidate => (
    (candidate.packageKey ?? '') === (node.packageKey ?? '')
  ))
  if (source) return findProjectIcon(source.catalog, node.seriesKey, node.iconKey)
  return node.packageKey ? null : findProjectIcon(props.projectIconCatalog, node.seriesKey, node.iconKey)
}

function renderNode(node: RichTextNode): VNodeChild {
  if (node.type === 'text') return node.value
  if (node.type === 'icon') {
    const entry = resolveIconEntry(node)
    return entry
      ? h('span', {
          class: 'rich-text-preview__icon',
          style: createProjectIconStyle(entry, readProjectIconSize),
          role: 'img',
          'aria-label': entry.name,
        })
      : h('span', { class: 'rich-text-preview__missing' }, '[icon]')
  }
  const attributes = { ...node.attributes }
  if (attributes.style || attributes['data-oc-fill-type'] === 'image') {
    attributes.style = resolveRichTextStyle(attributes,
      reference => props.fontOptions?.find(font => font.value === reference)?.cssFamily ?? reference,
      reference => props.resolveImageSource?.(reference) ?? null)
  }
  return h(node.tag, attributes, node.children.map(renderNode))
}

const rendered = computed(() => document.value.children.map(renderNode))
</script>

<template>
  <span class="rich-text-preview"> <component :is="{ render: () => rendered }" /> </span>
</template>

<style scoped>
.rich-text-preview {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
}

.rich-text-preview__icon {
  display: inline-block;
  vertical-align: text-bottom;
  background-repeat: no-repeat;
}

.rich-text-preview__missing {
  color: var(--oc-fg-muted);
}

.rich-text-preview :deep(p),
.rich-text-preview :deep(br) {
  display: inline;
  margin: 0;
}

.rich-text-preview :deep(p + p)::before {
  content: ' ';
}
</style>

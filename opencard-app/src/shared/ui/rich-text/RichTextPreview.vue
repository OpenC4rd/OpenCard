<script setup lang="ts">
import { computed, h, type VNodeChild } from 'vue'
import { parseRichTextHtml, type RichTextIconNode } from '../../rich-text/richTextHtml'
import type {
  PropertyFieldCapabilities,
  PropertyIconEntry,
} from '../property-editor/propertyEditor.types'
import { renderRichTextDocument } from './renderRichTextDocument'

const props = defineProps<{
  html: string
  capabilities?: PropertyFieldCapabilities
}>()

const document = computed(() => parseRichTextHtml(props.html).document)

const fontFamilyByValue = computed(() => {
  const map = new Map<string, string>()
  for (const scope of props.capabilities?.fonts ?? []) {
    for (const entry of scope.entries) {
      map.set(entry.value, entry.cssFamily ?? entry.value)
    }
  }
  return map
})

function resolveIconEntry(node: RichTextIconNode): PropertyIconEntry | null {
  const targetPkg = node.packageKey ?? null
  const scope = (props.capabilities?.icons ?? []).find(
    candidate => (candidate.packageKey ?? null) === targetPkg,
  )
  if (!scope) return null
  const series = scope.series.find(
    candidate => candidate.key.toLocaleLowerCase() === node.seriesKey.toLocaleLowerCase(),
  )
  if (!series) return null
  return (
    series.entries.find(
      candidate => candidate.iconKey.toLocaleLowerCase() === node.iconKey.toLocaleLowerCase(),
    ) ?? null
  )
}

function renderIcon(node: RichTextIconNode): VNodeChild {
  const entry = resolveIconEntry(node)
  return entry
    ? h('span', {
        class: 'rich-text-preview__icon',
        style: entry.inlineStyle,
        role: 'img',
        'aria-label': entry.name,
      })
    : h('span', { class: 'rich-text-preview__missing' }, '[icon]')
}

const rendered = computed(() =>
  renderRichTextDocument(document.value.children, {
    resolveFont: reference => fontFamilyByValue.value.get(reference) ?? reference,
    resolveImage: reference => props.capabilities?.resolveImagePreview?.(reference) ?? null,
    renderIcon,
  }),
)
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

<script setup lang="ts">
import { computed, h, type VNodeChild } from 'vue'
import {
  parseCardMarkup,
  type CardMarkupIconNode,
  type CardMarkupInlineNode,
} from '../../../features/card-rendering/markup'
import type {
  PropertyFieldCapabilities,
  PropertyIconEntry,
} from '../property-editor/propertyEditor.types'

const props = defineProps<{
  html: string
  capabilities?: PropertyFieldCapabilities
}>()

const markupDoc = computed(() => parseCardMarkup(props.html).document)

const fontFamilyByValue = computed(() => {
  const map = new Map<string, string>()
  for (const scope of props.capabilities?.fonts ?? []) {
    for (const entry of scope.entries) {
      map.set(entry.value, entry.cssFamily ?? entry.value)
    }
  }
  return map
})

function resolveIconEntry(icon: CardMarkupIconNode): PropertyIconEntry | null {
  const targetPkg = icon.pkg ?? null
  const scope = (props.capabilities?.icons ?? []).find(
    candidate => (candidate.packageKey ?? null) === targetPkg,
  )
  if (!scope) return null
  const rawKey = icon.key.startsWith('icon:') ? icon.key.slice('icon:'.length) : icon.key
  const slash = rawKey.indexOf('/')
  const seriesFilter = slash > 0 ? rawKey.slice(0, slash).toLowerCase() : null
  const iconFilter = (slash > 0 ? rawKey.slice(slash + 1) : rawKey).toLowerCase()

  for (const series of scope.series) {
    if (seriesFilter && series.key.toLowerCase() !== seriesFilter) continue
    const entry = series.entries.find(
      candidate => candidate.iconKey.toLowerCase() === iconFilter,
    )
    if (entry) return entry
  }
  return null
}

function renderIcon(icon: CardMarkupIconNode): VNodeChild {
  const entry = resolveIconEntry(icon)
  if (!entry) return h('span', { class: 'rich-text-preview__missing' }, '[icon]')
  const style: Record<string, string> = { ...entry.inlineStyle }
  if (icon.size) {
    style.width = icon.size
    style.height = icon.size
  }
  return h('span', {
    class: 'rich-text-preview__icon',
    style,
    role: 'img',
    'aria-label': entry.name,
  })
}

function renderInlines(nodes: readonly CardMarkupInlineNode[]): VNodeChild[] {
  return nodes.map((node): VNodeChild => {
    switch (node.type) {
      case 'text':
        return node.value
      case 'binding':
        return h('span', { class: 'rich-text-preview__binding', style: { color: 'var(--oc-accent)' } }, `{{${node.expression}}}`)
      case 'br':
        return h('br')
      case 'icon':
        return renderIcon(node)
      case 'img':
        return h('img', { src: props.capabilities?.resolveImagePreview?.(node.src) ?? node.src })
      case 'span': {
        const style: Record<string, string> = {}
        if (node.style.bold) style.fontWeight = 'bold'
        if (node.style.italic) style.fontStyle = 'italic'
        if (node.style.underline) style.textDecoration = 'underline'
        if (node.style.strikethrough) style.textDecoration = 'line-through'
        if (node.style.color) style.color = node.style.color
        if (node.style.fontSize) style.fontSize = node.style.fontSize
        if (node.style.fontFamily) {
          const resolved = fontFamilyByValue.value.get(node.style.fontFamily) ?? node.style.fontFamily
          style.fontFamily = resolved
        }
        if (node.style.markColor || node.style.backgroundColor) {
          style.backgroundColor = node.style.markColor ?? node.style.backgroundColor!
        }
        return h('span', { style }, renderInlines(node.children))
      }
    }
  })
}

const rendered = computed(() => {
  const doc = markupDoc.value
  return doc.blocks.map((block) => {
    if (block.type === 'paragraph') {
      return h('p', null, renderInlines(block.children))
    }
    if (block.type === 'list') {
      return block.items.map((item) => item.map((p) => h('p', null, renderInlines(p.children))))
    }
    return null
  })
})
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

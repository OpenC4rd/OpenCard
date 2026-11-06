<!-- 业务 导入来源选择：用一张示意图说明每种来源，让用户一眼判断自己属于哪种情况。 -->
<template>
  <div class="project-import-source-choice">
    <button v-for="option in options" :key="option.key" class="project-import-source-choice__option"
      type="button" :disabled="disabled" @click="emit('select', option.key)">
      <svg class="project-import-source-choice__art" viewBox="0 0 160 96" aria-hidden="true">
        <template v-if="option.art === 'files'">
          <g transform="rotate(-12 44 50)"><rect class="sheet" x="24" y="24" width="40" height="52" rx="5" /></g>
          <g transform="rotate(10 116 46)"><rect class="sheet" x="96" y="20" width="40" height="52" rx="5" /></g>
          <rect class="art-base" x="60" y="30" width="40" height="52" rx="5" />
          <rect class="sheet sheet--accent" x="60" y="30" width="40" height="52" rx="5" />
          <text class="glyph" x="80" y="56" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="600">{{ glyph }}</text>
        </template>
        <template v-else-if="option.art === 'folder'">
          <rect class="sheet" x="54" y="10" width="30" height="40" rx="4" />
          <rect class="sheet" x="74" y="14" width="30" height="40" rx="4" />
          <path class="art-base" d="M42 32a6 6 0 0 1 6-6h18l8 8h38a6 6 0 0 1 6 6v38a6 6 0 0 1-6 6H48a6 6 0 0 1-6-6z" />
          <path class="folder" d="M42 32a6 6 0 0 1 6-6h18l8 8h38a6 6 0 0 1 6 6v38a6 6 0 0 1-6 6H48a6 6 0 0 1-6-6z" />
          <text class="glyph" x="80" y="60" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="600">{{ glyph }}</text>
        </template>
        <template v-else-if="option.art === 'system'">
          <rect class="sheet sheet--accent" x="32" y="14" width="96" height="60" rx="6" />
          <path class="stand" d="M68 74v8M92 74v8M58 84h44" />
          <text class="glyph" x="80" y="44" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="600">{{ glyph }}</text>
        </template>
        <template v-else>
          <rect class="sheet sheet--dashed" x="46" y="16" width="68" height="64" rx="6" />
          <path class="stand" d="M80 38v20M70 48h20" />
        </template>
      </svg>
      <OcText as="strong">{{ option.title }}</OcText>
      <OcText tone="muted" size="sm">{{ option.description }}</OcText>
    </button>
  </div>
</template>

<script lang="ts">
export type ProjectImportSourceOption = {
  key: string
  title: string
  description: string
  /** 示意图：离散文件、整个文件夹、本机系统、从空白开始。 */
  art: 'files' | 'folder' | 'system' | 'empty'
}
</script>

<script setup lang="ts">
import OcText from '../base/OcText.vue'

defineProps<{
  options: readonly ProjectImportSourceOption[]
  /** 示意图里画的内容记号，例如字体用 `Aa`。 */
  glyph?: string
  disabled?: boolean
}>()
const emit = defineEmits<{ select: [key: string] }>()
</script>

<style scoped>
.project-import-source-choice {
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  gap: var(--oc-space-sm);
}
.project-import-source-choice__option {
  display: grid;
  align-content: start;
  gap: var(--oc-space-2xs);
  min-width: 0;
  padding: var(--oc-space-md);
  border: var(--oc-border-width) solid var(--oc-border-muted);
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-block);
  color: inherit;
  font: inherit;
  text-align: center;
  cursor: pointer;
  transition:
    border-color var(--oc-duration-quick) var(--oc-ease),
    background-color var(--oc-duration-quick) var(--oc-ease);
}
.project-import-source-choice__option:hover:not(:disabled) {
  border-color: var(--oc-border-accent);
  background: var(--oc-bg-accent-subtle);
}
.project-import-source-choice__option:focus-visible {
  outline: none;
  box-shadow: var(--oc-focus-ring);
}
.project-import-source-choice__option:disabled {
  opacity: var(--oc-opacity-disabled);
  cursor: default;
}
.project-import-source-choice__art {
  width: 100%;
  margin-bottom: var(--oc-space-xs);
}
.sheet {
  fill: var(--oc-bg-raised);
  stroke: var(--oc-border-strong);
  stroke-width: 1.5;
}
.sheet--accent {
  fill: var(--oc-bg-accent-subtle);
  stroke: var(--oc-border-accent);
}
.sheet--dashed {
  fill: none;
  stroke-dasharray: 5 4;
}
.art-base {
  fill: var(--oc-bg-block);
}
.folder {
  fill: var(--oc-bg-accent-subtle);
  stroke: var(--oc-border-accent);
  stroke-width: 1.5;
}
.stand {
  fill: none;
  stroke: var(--oc-border-strong);
  stroke-width: 2;
  stroke-linecap: round;
}
.glyph {
  fill: var(--oc-accent);
}
</style>

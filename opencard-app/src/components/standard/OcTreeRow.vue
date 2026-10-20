<!-- Internal row of OcTree: owns rendering subscriptions, while OcTree owns structure and interaction. -->
<template>
    <div
      class="oc-tree__node"
      :class="context.resolveNodeClass(entry.key)"
      :data-oc-tree-key="entry.key"
      :style="context.resolveNodeStyle(entry)"
    >
      <span
        v-if="entry.guideRows > 0"
        class="oc-tree__branch-guide"
        :data-guide-rows="entry.guideRows"
        :style="{ '--oc-tree-guide-rows': String(entry.guideRows) }"
        aria-hidden="true"
      />
      <span
        v-if="entry.parentKey !== null"
        class="oc-tree__branch-connector"
        aria-hidden="true"
      />
      <OcRow
        :ref="(element) => context.setRowRef(entry.key, element)"
        class="oc-tree__row"
        :class="{ 'is-selected': selected, 'is-disabled': entry.item.disabled }"
        :data-tooltip="entry.item.disabledReason"
        :role="context.rowRole"
        :tabindex="context.props.tabNavigation === 'roving' && active && !entry.item.disabled ? 0 : -1"
        :aria-disabled="entry.item.disabled || undefined"
        :aria-busy="entry.item.loading || undefined"
        :aria-selected="context.props.role !== 'menu' && context.props.selectionMode !== 'none' ? selected : undefined"
        :aria-expanded="context.isExpandable(entry.key) ? context.isExpanded(entry.key) : undefined"
        :aria-posinset="context.props.virtualized ? entry.index + 1 : undefined"
        :aria-setsize="context.props.virtualized ? context.visibleCount : undefined"
        @focus="context.activeKey = entry.key"
        @click="context.handleRowClick($event, entry.key)"
        @auxclick="context.handleRowAuxClick($event, entry.key)"
        @dblclick="context.handleRowDoubleClick($event, entry.key)"
        @mousedown="context.handleRowMouseDown($event, entry.key)"
        @keydown="context.handleRowKeydown($event, entry.key, entry.index)"
        @contextmenu="context.handleRowContextMenu($event, entry.key)"
      >
        <template #leading>
          <span
            class="oc-tree__icon-slot"
            :class="{ 'is-expandable': context.isExpandable(entry.key) }"
            data-tree-interactive="true"
            @mousedown="context.handleIconMouseDown($event, entry.key)"
            @click="context.handleIconClick($event, entry.key)"
          >
            <OcVisual
              v-if="entry.item.visual"
              class="oc-tree__node-visual"
              :class="{ 'is-expanded': entry.item.visual.type === 'icon' && context.isExpandable(entry.key) && context.isExpanded(entry.key) }"
              :visual="entry.item.visual"
              :label="entry.item.label"
              size="md"
            />
            <OcIcon v-else
              :name="'circle'"
              size="md"
              class="oc-tree__node-icon"
              :class="{ 'is-expanded': context.isExpandable(entry.key) && context.isExpanded(entry.key) }"
            />
            <span
              v-if="context.isExpandable(entry.key) && context.childCount(entry.key) > 0"
              class="oc-tree__child-count oc-number-badge oc-number-badge--neutral"
              :class="{ 'is-expanded': context.isExpanded(entry.key) }"
              aria-hidden="true"
            >
              {{ context.formatChildCount(entry.key) }}
            </span>
          </span>
        </template>

        <template #title>
          <OcFieldInput
            v-if="context.renamingKey === entry.key"
            :ref="(element) => context.setRenameInputRef(entry.key, element)"
            as="input"
            class="oc-tree__rename-input"
            type="text"
            :value="context.renameDraft"
            data-tree-interactive="true"
            @mousedown.stop
            @click.stop
            @dblclick.stop
            @input="context.handleRenameInput"
            @keydown.stop="context.handleRenameKeydown($event, entry.key)"
            @blur="context.commitRename(entry.key)"
          />
          <OcSkeleton
            v-else-if="entry.item.loading"
            width="sm"
            height="sm"
          />
          <OcText
            v-else
            class="oc-tree__label"
            :style="context.labelStyle(entry.item)"
            :tone="entry.item.tone"
            :truncate="true"
          >
            {{ entry.item.label }}
          </OcText>
        </template>

        <template v-if="entry.item.tail" #append>
          <OcNodeTail
            class="oc-tree__tail"
            :tail="context.resolveTailParts(entry.key, entry.item.tail)"
            :action-visibility="context.props.actionVisibility"
            :button-tabindex="context.props.tabNavigation === 'none' ? -1 : undefined"
            @action="context.emitActionIntent(entry.key, $event.key)"
          />
        </template>
      </OcRow>
    </div>
</template>

<script lang="ts">
import type { CSSProperties, ComponentPublicInstance } from 'vue'
import type { OcNode, OcNodeKey, OcNodeTailPart } from '../../shared/ui/node/node.types'
export type OcTreeRowEntry = {
  key: OcNodeKey
  item: OcNode
  level: number
  parentKey: OcNodeKey | null
  guideRows: number
  index: number
}

export type OcTreeRowContext = {
  readonly props: { role: 'tree' | 'listbox' | 'menu'; selectionMode: 'none' | 'single' | 'multiple'; tabNavigation: 'roving' | 'none'; virtualized: boolean; actionVisibility: 'on-interaction' | 'always' }
  readonly rowRole: 'treeitem' | 'menuitem' | 'option'
  activeKey: OcNodeKey | null
  readonly renamingKey: OcNodeKey | null
  readonly renameDraft: string
  readonly visibleCount: number
  resolveNodeClass(key: OcNodeKey): Record<string, boolean>
  resolveNodeStyle(entry: OcTreeRowEntry): CSSProperties
  labelStyle(item: OcNode): CSSProperties | undefined
  setRowRef(key: OcNodeKey, element: Element | ComponentPublicInstance | null): void
  setRenameInputRef(key: OcNodeKey, element: Element | ComponentPublicInstance | null): void
  isSelected(key: OcNodeKey): boolean
  isExpandable(key: OcNodeKey): boolean
  isExpanded(key: OcNodeKey): boolean
  childCount(key: OcNodeKey): number
  formatChildCount(key: OcNodeKey): string
  handleRowClick(event: MouseEvent, key: OcNodeKey): void
  handleRowAuxClick(event: MouseEvent, key: OcNodeKey): void
  handleRowDoubleClick(event: MouseEvent, key: OcNodeKey): void
  handleRowMouseDown(event: MouseEvent, key: OcNodeKey): void
  handleRowKeydown(event: KeyboardEvent, key: OcNodeKey, index: number): void
  handleRowContextMenu(event: MouseEvent, key: OcNodeKey): void
  handleIconMouseDown(event: MouseEvent, key: OcNodeKey): void
  handleIconClick(event: MouseEvent, key: OcNodeKey): void
  handleRenameInput(event: Event): void
  handleRenameKeydown(event: KeyboardEvent, key: OcNodeKey): void
  commitRename(key: OcNodeKey): void
  resolveTailParts(key: OcNodeKey, tail: OcNode['tail']): readonly OcNodeTailPart[]
  emitActionIntent(key: OcNodeKey, actionKey: string): void
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import OcRow from './OcRow.vue'
import OcNodeTail from './OcNodeTail.vue'
import OcFieldInput from '../base/OcFieldInput.vue'
import OcIcon from '../base/OcIcon.vue'
import OcVisual from '../base/OcVisual.vue'
import OcSkeleton from '../base/OcSkeleton.vue'
import OcText from '../base/OcText.vue'

const props = defineProps<{ entry: OcTreeRowEntry; context: OcTreeRowContext }>()
const active = computed(() => props.context.activeKey === props.entry.key)
const selected = computed(() => props.context.isSelected(props.entry.key))
</script>

<style scoped>
.oc-tree__node-visual {
  flex: none;
  /* 精灵图裁剪按 em 计量，字号决定实际尺寸。 */
  font-size: var(--oc-size-sm);
  transform-origin: center;
  transition: transform var(--oc-duration-quick) var(--oc-ease);
}

.oc-tree__node-visual.is-expanded {
  transform: rotate(45deg);
}

.oc-tree__node {
  position: relative;
  flex: 0 0 auto;
  /* 行间空隙：节点比行高多出这一档，虚拟列表的行距也按它计算。 */
  padding-bottom: var(--oc-space-2xs);
}

.oc-tree__branch-guide {
  position: absolute;
  z-index: 1;
  top: calc(var(--oc-size-md) * 0.5 + 7px);
  left: calc(var(--oc-space-sm) + var(--oc-tree-indent) + 7px);
  width: 1px;
  height: calc(var(--oc-tree-guide-rows) * (var(--oc-size-md) + var(--oc-space-2xs)) - 7px);
  background: var(--oc-border-muted);
  pointer-events: none;
}

.oc-tree__branch-connector {
  position: absolute;
  z-index: 1;
  top: calc(var(--oc-size-md) * 0.5);
  left: calc(var(--oc-space-sm) + var(--oc-tree-indent) - 5px);
  width: 12px;
  height: 1px;
  background: var(--oc-border-muted);
  pointer-events: none;
}

/*
 * 行的盒模型与状态外观由 OcRow 提供；缩进是树的几何，只补起始内边距。
 * 选择器带上节点容器，避免与 OcRow 自己的 `.oc-row` 规则同权重而依赖样式表顺序。
 */
.oc-tree__node > .oc-tree__row {
  padding-inline-start: calc(var(--oc-space-sm) + var(--oc-tree-indent));
}

.oc-tree__icon-slot {
  position: relative;
  z-index: 2;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--oc-icon-size-md);
  height: var(--oc-icon-size-md);
}

.oc-tree__icon-slot.is-expandable {
  cursor: pointer;
}

.oc-tree__node-icon {
  flex: 0 0 auto;
  transform-origin: center;
  transition: transform var(--oc-duration-quick) var(--oc-ease);
}

.oc-tree__node-icon.is-expanded {
  transform: rotate(45deg);
}

.oc-tree__child-count {
  position: absolute;
  z-index: 1;
  top: -6px;
  right: -9px;
  transition:
    border-color var(--oc-duration-quick) var(--oc-ease),
    color var(--oc-duration-quick) var(--oc-ease),
    background-color var(--oc-duration-quick) var(--oc-ease);
}

.oc-tree__icon-slot:hover .oc-tree__child-count,
.oc-tree__child-count.is-expanded {
  border-color: var(--oc-border-accent);
  background: var(--oc-bg-raised);
  color: var(--oc-fg-accent);
}

/*
 * 标题内容住在 OcRow 的标题位里：标签必须是块盒，单行省略与溢出提示才量得到真实宽度。
 */
.oc-tree__label {
  display: block;
  min-width: 0;
}

/*
 * 尾部行由 OcNodeTail 渲染，根元素不参与盒模型：命令、徽标与文本继续作为行尾的直接 flex 项，
 * 让位顺序由共享尾部行统一处理。
 */
.oc-tree__tail {
  display: contents;
}

.oc-tree__rename-input {
  display: block;
  width: 100%;
  height: calc(var(--oc-size-md) - var(--oc-space-2xs));
}

/*
 * 命令平时不显示：行被交互时由变量揭示，常显由 OcNodeTail 的 actionVisibility 负责。
 * 变量按继承生效，所以这一条只需写在行上。
 */
.oc-tree__row:hover,
.oc-tree__row:focus-within,
.oc-tree__row.is-selected {
  --oc-node-tail-action-display: inline-flex;
}

.oc-tree__node.is-drag-source {
  opacity: 0.45;
}

.oc-tree__node.is-drop-before::before,
.oc-tree__node.is-drop-after::after {
  content: '';
  position: absolute;
  z-index: 2;
  left: calc(var(--oc-space-sm) + var(--oc-tree-indent));
  right: 0;
  height: 2px;
  background: var(--oc-border-accent);
  pointer-events: none;
}

.oc-tree__node.is-drop-before::before {
  top: 0;
}

.oc-tree__node.is-drop-after::after {
  bottom: 0;
}

.oc-tree__node.is-drop-inside .oc-tree__row {
  background-image: var(--oc-overlay-accent);
}
</style>

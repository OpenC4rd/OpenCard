<template>
  <Teleport to="body">
    <Transition name="oc-dialog" @after-leave="finishClose">
      <div v-if="open" ref="backdropRef" class="oc-dialog__backdrop" @pointerdown.self="handleBackdropPointerDown" @keydown="handleKeydown">
        <component
          :is="as"
          ref="dialogRef"
          class="oc-dialog"
          :class="[
            `oc-dialog--${size}`,
            `oc-dialog--height-mode-${heightMode}`,
            heightMode === 'fixed' && height ? `oc-dialog--height-${height}` : null,
            heightMode === 'content' && minHeight ? `oc-dialog--min-height-${minHeight}` : null,
            maxHeight && maxHeight !== 'viewport' ? `oc-dialog--max-height-${maxHeight}` : null,
            { 'oc-dialog--flush': !padded, 'oc-dialog--scroll-locked': !scrollable },
          ]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="description ? descriptionId : undefined"
          tabindex="-1"
          v-bind="$attrs"
          @submit.prevent="emit('submit', $event)"
        >
          <header class="oc-dialog__header">
            <slot name="header" :title-id="titleId" :description-id="descriptionId">
              <div class="oc-dialog__heading">
                <h2 :id="titleId">{{ title }}</h2>
                <p v-if="description" :id="descriptionId">{{ description }}</p>
              </div>
            </slot>
          </header>

          <div class="oc-dialog__body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="oc-dialog__footer">
            <slot name="footer" />
          </footer>
        </component>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch, watchEffect } from 'vue'
import { activeDialogRoot, registerDialogRoot } from '../../shared/ui/overlayScope'

defineOptions({ name: 'OcDialog', inheritAttrs: false })

type OcDialogCloseReason = 'escape' | 'backdrop'
type OcDialogHeightPreset = 'sm' | 'md' | 'lg' | 'workspace'

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  as?: 'section' | 'form'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  heightMode?: 'content' | 'fixed'
  height?: OcDialogHeightPreset
  minHeight?: OcDialogHeightPreset
  maxHeight?: OcDialogHeightPreset | 'viewport'
  padded?: boolean
  scrollable?: boolean
  dismissible?: boolean
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
}>(), {
  description: '',
  as: 'section',
  size: 'md',
  heightMode: 'content',
  height: undefined,
  minHeight: undefined,
  maxHeight: 'viewport',
  padded: true,
  scrollable: true,
  dismissible: true,
  closeOnBackdrop: false,
  closeOnEscape: true,
})

const emit = defineEmits<{
  'request-close': [reason: OcDialogCloseReason]
  submit: [event: Event]
}>()
const dialogRef = ref<HTMLElement | null>(null)
const backdropRef = ref<HTMLElement | null>(null)
let unregister: (() => void) | undefined
const dialogId = `oc-dialog-${useId().replace(/:/g, '')}`
const titleId = `${dialogId}-title`
const descriptionId = `${dialogId}-description`
let returnFocusTarget: HTMLElement | null = null

watchEffect(() => {
  if (import.meta.env.DEV && props.heightMode === 'fixed' && !props.height) {
    console.warn('[OcDialog] heightMode="fixed" requires a height preset.')
  }
  if (import.meta.env.DEV && props.heightMode === 'content' && props.height) {
    console.warn('[OcDialog] height is ignored while heightMode="content".')
  }
  if (import.meta.env.DEV && props.heightMode === 'fixed' && props.minHeight) {
    console.warn('[OcDialog] minHeight is ignored while heightMode="fixed".')
  }
})

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

watch(() => props.open, async open => {
  if (!open) return
  returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  if (!props.open || !backdropRef.value) return
  unregister?.()
  unregister = registerDialogRoot(backdropRef.value)
  focusInitialControl()
}, { immediate: true })

onBeforeUnmount(() => {
  unregister?.()
  if (props.open) restoreFocus()
})

function finishClose(): void {
  if (props.open) return
  unregister?.()
  unregister = undefined
  restoreFocus()
}

function enabledFocusTargets(): HTMLElement[] {
  return Array.from(backdropRef.value?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])
    .filter(element => !element.closest('[inert]') && element.getAttribute('aria-hidden') !== 'true')
}

function focusInitialControl(): void {
  const dialog = dialogRef.value
  if (!dialog) return
  const autofocusTarget = dialog.querySelector<HTMLElement>('[autofocus]')
  ;(autofocusTarget ?? enabledFocusTargets()[0] ?? dialog).focus()
}

function restoreFocus(): void {
  const target = returnFocusTarget
  returnFocusTarget = null
  if (target?.isConnected) target.focus()
}

function requestClose(reason: OcDialogCloseReason): void {
  if (props.dismissible) emit('request-close', reason)
}

function handleBackdropPointerDown(): void {
  if (props.closeOnBackdrop) requestClose('backdrop')
}

function handleKeydown(event: KeyboardEvent): void {
  if (activeDialogRoot.value !== backdropRef.value) return
  if (event.key === 'Escape' && props.closeOnEscape && props.dismissible) {
    event.preventDefault()
    event.stopPropagation()
    requestClose('escape')
    return
  }
  if (event.key !== 'Tab') return

  const targets = enabledFocusTargets()
  if (targets.length === 0) {
    event.preventDefault()
    dialogRef.value?.focus()
    return
  }
  const first = targets[0]!
  const last = targets[targets.length - 1]!
  if (event.shiftKey && (document.activeElement === first || !backdropRef.value?.contains(document.activeElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
</script>

<style scoped>
.oc-dialog__backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--oc-z-modal);
  display: grid;
  place-items: center;
  padding: var(--oc-space-6);
  background: var(--oc-bg-modal-backdrop);
}

.oc-dialog {
  --oc-dialog-available-height: min(var(--oc-dialog-max-height), calc(100dvh - var(--oc-space-6) * 2));
  display: flex;
  max-height: var(--oc-dialog-available-height);
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: var(--oc-border-width) solid var(--oc-border-default);
  border-radius: var(--oc-radius-md);
  outline: none;
  background: var(--oc-bg-surface);
  box-shadow: var(--oc-shadow-lg);
  color: var(--oc-fg-default);
}

 .oc-dialog {
  user-select: none;
  -webkit-user-select: none;
}

 .oc-dialog input,
 .oc-dialog textarea,
 .oc-dialog select,
 .oc-dialog [contenteditable='true'],
 .oc-dialog pre,
 .oc-dialog code {
  user-select: text;
  -webkit-user-select: text;
}

.oc-dialog--sm { width: min(100%, var(--oc-dialog-width-sm)); }
.oc-dialog--md { width: min(100%, var(--oc-dialog-width-md)); }
.oc-dialog--lg { width: min(100%, var(--oc-dialog-width-lg)); }
.oc-dialog--xl { width: min(100%, var(--oc-dialog-width-xl)); }

.oc-dialog--height-mode-fixed.oc-dialog--height-sm { height: min(var(--oc-dialog-height-sm), var(--oc-dialog-available-height)); }
.oc-dialog--height-mode-fixed.oc-dialog--height-md { height: min(var(--oc-dialog-height-md), var(--oc-dialog-available-height)); }
.oc-dialog--height-mode-fixed.oc-dialog--height-lg { height: min(var(--oc-dialog-height-lg), var(--oc-dialog-available-height)); }
.oc-dialog--height-mode-fixed.oc-dialog--height-workspace { height: min(var(--oc-dialog-height-workspace), var(--oc-dialog-available-height)); }

.oc-dialog--min-height-sm { min-height: min(var(--oc-dialog-height-sm), var(--oc-dialog-available-height)); }
.oc-dialog--min-height-md { min-height: min(var(--oc-dialog-height-md), var(--oc-dialog-available-height)); }
.oc-dialog--min-height-lg { min-height: min(var(--oc-dialog-height-lg), var(--oc-dialog-available-height)); }
.oc-dialog--min-height-workspace { min-height: min(var(--oc-dialog-height-workspace), var(--oc-dialog-available-height)); }

.oc-dialog--max-height-sm { max-height: min(var(--oc-dialog-height-sm), var(--oc-dialog-available-height)); }
.oc-dialog--max-height-md { max-height: min(var(--oc-dialog-height-md), var(--oc-dialog-available-height)); }
.oc-dialog--max-height-lg { max-height: min(var(--oc-dialog-height-lg), var(--oc-dialog-available-height)); }
.oc-dialog--max-height-workspace { max-height: min(var(--oc-dialog-height-workspace), var(--oc-dialog-available-height)); }

.oc-dialog:focus-visible { box-shadow: var(--oc-shadow-lg), var(--oc-focus-ring); }

.oc-dialog__header,
.oc-dialog__footer {
  flex: 0 0 auto;
}
.oc-dialog__header {
  padding: var(--oc-dialog-header-padding-block) var(--oc-dialog-header-padding-inline);
}
.oc-dialog__footer {
  padding: var(--oc-dialog-footer-padding-block) var(--oc-dialog-footer-padding-inline);
}

.oc-dialog__header { border-bottom: var(--oc-border-width) solid var(--oc-border-muted); }

.oc-dialog__heading h2,
.oc-dialog__heading p { margin: 0; }
.oc-dialog__heading h2 {
  font-size: var(--oc-text-lg);
  font-weight: var(--font-weight-ui-title);
  letter-spacing: 0;
}
.oc-dialog__heading p {
  margin-top: var(--oc-space-1);
  color: var(--oc-fg-muted);
  font-size: var(--oc-text-sm);
}

.oc-dialog__body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--oc-dialog-body-gap);
  overflow: auto;
  padding: var(--oc-dialog-body-padding);
}
.oc-dialog--flush > .oc-dialog__body { gap: 0; padding: 0; }
.oc-dialog--scroll-locked > .oc-dialog__body { overflow: hidden; }

.oc-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--oc-space-2);
  border-top: var(--oc-border-width) solid var(--oc-border-default);
  background: var(--oc-bg-raised);
}

.oc-dialog-enter-active,
.oc-dialog-leave-active { transition: opacity var(--oc-duration-normal) var(--oc-ease); }
.oc-dialog-enter-active .oc-dialog,
.oc-dialog-leave-active .oc-dialog {
  transition:
    opacity var(--oc-duration-normal) var(--oc-ease),
    transform var(--oc-duration-normal) var(--oc-ease);
}
.oc-dialog-enter-from,
.oc-dialog-leave-to { opacity: 0; }
.oc-dialog-enter-from .oc-dialog,
.oc-dialog-leave-to .oc-dialog {
  opacity: 0;
  transform: translateY(var(--oc-space-1));
}

@media (prefers-reduced-motion: reduce) {
  .oc-dialog-enter-active,
  .oc-dialog-leave-active,
  .oc-dialog-enter-active .oc-dialog,
  .oc-dialog-leave-active .oc-dialog { transition: none; }
}
</style>

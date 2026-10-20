<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TutorialSession } from '../../shared/ui/tutorial/tutorial'
import { activeDialogRoot, isWithinOverlayOwners, registerDialogRoot, resolveOverlayRoot } from '../../shared/ui/overlayScope'
import { findTutorialSpace, tutorialConnector } from '../../shared/ui/tutorial/tutorialLayout'
import OcButton from '../base/OcButton.vue'
import OcIcon from '../base/OcIcon.vue'
import OcInlineMarkup from './OcInlineMarkup.vue'
import OcProgressBar from './OcProgressBar.vue'

const props = defineProps<{ session: TutorialSession | null }>()
const emit = defineEmits<{
  complete: [value: { tutorialId: string; stepId: string; run: number }]
  exit: []
}>()
const { t } = useI18n()
const layerRoot = shallowRef<HTMLElement | null>(null)
const cardSurface = shallowRef<HTMLElement | null>(null)
const owner = shallowRef<HTMLElement | null>(null)
const missing = shallowRef(false)
const holes = shallowRef<DOMRect[]>([])
const interactiveHoles = computed(() => holes.value.filter((_, index) => isInteractiveTarget(highlighted[index]!)))
const interactionShield = computed(() => [
  `M0 0H${window.innerWidth}V${window.innerHeight}H0Z`,
  ...interactiveHoles.value
    .map(hole => `M${hole.left} ${hole.top}h${hole.width}v${hole.height}h${-hole.width}Z`),
].join(' '))
const cardBody = shallowRef<HTMLElement | null>(null)
const cardRect = shallowRef<DOMRect | null>(null)
const messageRects = shallowRef<Record<string, DOMRect>>({})
const connectors = computed(() => cardRect.value ? holes.value.map((hole, index) =>
  tutorialConnector(cardRect.value!, hole, messageRects.value[highlighted[index]?.dataset.ocTutorial ?? ''])) : [])
const space = shallowRef({ left: 8, top: 8, right: 348, bottom: 528 })
const maskId = `oc-tutorial-mask-${useId().replace(/:/g, '')}`
const morphing = shallowRef(false)
let motionFrame = 0
let highlighted: HTMLElement[] = []
let observer: MutationObserver | undefined
let targetSizeObserver: ResizeObserver | undefined
const blocking = computed(() => Boolean(props.session?.step.blockInteraction ?? props.session?.definition.blockInteraction))
const overlayRoot = computed(() => blocking.value ? document.body : resolveOverlayRoot(owner.value))
const visible = computed(() => Boolean(props.session && (!activeDialogRoot.value
  || activeDialogRoot.value === layerRoot.value || activeDialogRoot.value.contains(owner.value))))

function setFlight(layer: Element, bounds = space.value): void {
  const offsets = [
    { distance: bounds.left, x: -bounds.right - 8, y: 0 },
    { distance: window.innerWidth - bounds.right, x: window.innerWidth - bounds.left + 8, y: 0 },
    { distance: bounds.top, x: 0, y: -bounds.bottom - 8 },
    { distance: window.innerHeight - bounds.bottom, x: 0, y: window.innerHeight - bounds.top + 8 },
  ]
  const nearest = offsets.reduce((closest, edge) => edge.distance < closest.distance ? edge : closest)
  const root = layer as HTMLElement
  root.style.setProperty('--oc-tutorial-flight-x', `${nearest.x}px`)
  root.style.setProperty('--oc-tutorial-flight-y', `${nearest.y}px`)
}
function enterLayer(layer: Element): void {
  // Wait for the content measurement to choose its final space before the first painted frame.
  void nextTick(() => setFlight(layer))
}
function leaveLayer(layer: Element): void {
  const rect = layer.querySelector('.oc-tutorial')?.getBoundingClientRect()
  setFlight(layer, rect ?? space.value)
}

function measureCard(): void {
  const body = cardBody.value
  const surface = cardSurface.value
  if (!body || !surface) { cardRect.value = null; return }
  cardRect.value = surface.getBoundingClientRect()
  messageRects.value = Object.fromEntries([...body.querySelectorAll<HTMLElement>('[data-oc-tutorial-message]')]
    .map(element => [element.dataset.ocTutorialMessage!, element.getBoundingClientRect()]))
}

/** CSS 负责变形，每帧只同步连线的实际端点。 */
function trackMorph(event: TransitionEvent): void {
  if (event.target !== event.currentTarget) return
  const surface = event.currentTarget as HTMLElement
  cancelAnimationFrame(motionFrame)
  const measureFrame = () => {
    measureCard()
    motionFrame = surface.getAnimations().some(animation => animation.playState === 'running')
      ? requestAnimationFrame(measureFrame) : 0
  }
  motionFrame = requestAnimationFrame(measureFrame)
}

function locate(scroll = false): void {
  const previousTargets = highlighted
  highlighted = []
  if (!props.session) {
    targetSizeObserver?.disconnect()
    holes.value = []; return
  }
  const candidates = [...document.querySelectorAll<HTMLElement>('[data-oc-tutorial]')]
  for (const target of props.session.step.targets) {
    const matches = candidates.filter(element => element.dataset.ocTutorial === target.key && element.getClientRects().length > 0)
    // 重复标识不能任意选一个，否则教程可能指向另一份内容。
    if (matches.length === 1) highlighted.push(matches[0]!)
  }
  if (previousTargets.length !== highlighted.length || highlighted.some((element, index) => element !== previousTargets[index])) {
    targetSizeObserver?.disconnect()
    highlighted.forEach(element => targetSizeObserver?.observe(element))
  }
  missing.value = highlighted.length !== props.session.step.targets.length
  const primary = highlighted[0]
  owner.value = primary ?? null
  if (scroll) primary?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  holes.value = highlighted.map(element => element.getBoundingClientRect())
  const body = cardBody.value
  const surface = cardSurface.value
  const padding = surface ? getComputedStyle(surface) : null
  const preferredHeight = body?.scrollHeight
    ? Math.min(520, body.scrollHeight + parseFloat(padding!.paddingTop) + parseFloat(padding!.paddingBottom) + 2) : 520
  space.value = findTutorialSpace(holes.value, window.innerWidth, window.innerHeight, preferredHeight)
  measureCard()
}

function complete(): void {
  const current = props.session
  if (current && current.step.manual && !missing.value) {
    emit('complete', { tutorialId: current.tutorialId, stepId: current.step.id, run: current.run })
  }
}
function handleKeydown(event: KeyboardEvent): void {
  if (visible.value && !blocking.value && event.key === 'Escape' && !event.defaultPrevented) {
    event.preventDefault()
    event.stopPropagation()
    emit('exit')
  }
}
function isInteractiveTarget(element: HTMLElement): boolean {
  return props.session?.step.targets.some(target => target.key === element.dataset.ocTutorial && target.interactive !== false) ?? false
}
function restrictPointer(event: Event): void {
  if (!visible.value || blocking.value || !(event.target instanceof Node)) return
  const targets = highlighted.filter(isInteractiveTarget)
  const allowed = cardSurface.value ? [cardSurface.value, ...targets] : targets
  if (isWithinOverlayOwners(event.target, allowed)) return
  event.preventDefault()
  event.stopImmediatePropagation()
}
const restrictedEvents = ['pointerdown', 'click', 'dblclick', 'auxclick', 'contextmenu'] as const
watch([blocking, layerRoot], ([locked, root], _, cleanup) => {
  if (locked && root) cleanup(registerDialogRoot(root, { onEscape: () => emit('exit'), blockShortcuts: true }))
}, { flush: 'post' })
const refresh = () => locate()
watch(() => props.session, (current, previous) => {
  morphing.value = Boolean(current && previous && current.run === previous.run && current.index !== previous.index)
}, { flush: 'pre' })
watch(cardBody, (body, _, cleanup) => {
  const surface = cardSurface.value
  if (!body || !surface) { cardRect.value = null; return }
  const sizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh)
  sizeObserver?.observe(body)
  measureCard()
  locate()
  cleanup(() => sizeObserver?.disconnect())
}, { flush: 'post' })
watch(space, measureCard, { flush: 'post' })
watch([() => props.session, activeDialogRoot], () => locate(true), { flush: 'post' })
onMounted(() => {
  targetSizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refresh)
  locate(true)
  highlighted.forEach(element => targetSizeObserver?.observe(element))
  observer = new MutationObserver(refresh)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', refresh)
  window.addEventListener('scroll', refresh, true)
  window.addEventListener('keydown', handleKeydown, true)
  restrictedEvents.forEach(type => window.addEventListener(type, restrictPointer, true))
})
onBeforeUnmount(() => {
  cancelAnimationFrame(motionFrame)
  observer?.disconnect()
  targetSizeObserver?.disconnect()
  window.removeEventListener('resize', refresh)
  window.removeEventListener('scroll', refresh, true)
  window.removeEventListener('keydown', handleKeydown, true)
  restrictedEvents.forEach(type => window.removeEventListener(type, restrictPointer, true))
})
</script>

<template>
  <Teleport :to="overlayRoot">
    <Transition name="oc-tutorial-overlay" appear @before-enter="setFlight" @enter="enterLayer" @before-leave="leaveLayer">
    <div v-if="session" v-show="visible" ref="layerRoot" class="oc-tutorial-layer">
    <svg v-if="visible" class="oc-tutorial__mask" :class="{ 'oc-tutorial__mask--blocking': blocking }" aria-hidden="true"
      @pointerdown.prevent.stop>
      <defs>
        <mask :id="maskId" maskUnits="userSpaceOnUse">
          <rect width="100%" height="100%" fill="white" />
          <rect v-for="(hole, index) in holes" :key="index" :x="hole.left - 4" :y="hole.top - 4"
            :width="hole.width + 8" :height="hole.height + 8" rx="4" fill="black" />
        </mask>
      </defs>
      <rect width="100%" height="100%" :mask="`url(#${maskId})`" class="oc-tutorial__shade" />
      <path v-if="!blocking" :d="interactionShield" fill-rule="evenodd" class="oc-tutorial__interaction-shield" />
      <path v-for="(connector, index) in connectors" :key="`connector-${index}`" :d="connector" class="oc-tutorial__connector" />
      <rect v-for="(hole, index) in holes" :key="index" :x="hole.left - 4" :y="hole.top - 4"
        :width="hole.width + 8" :height="hole.height + 8" rx="4" class="oc-tutorial__outline" />
    </svg>
      <template v-if="visible && !blocking">
        <span v-for="(hole, index) in interactiveHoles" :key="index" class="oc-tutorial__click-hint" aria-hidden="true"
          :style="{ left: `${hole.right + 4}px`, top: `${hole.bottom + 4}px` }">
          <OcIcon name="input.mouse-left-click" tone="accent" size="sm" />
        </span>
      </template>
      <div ref="cardSurface" class="oc-tutorial" :class="{ 'oc-tutorial--morphing': morphing }"
        :style="{ transform: `translate3d(${space.left}px, ${space.top}px, 0)`, width: `${space.right - space.left}px`, height: `${space.bottom - space.top}px` }"
        @transitionrun="trackMorph" :role="blocking ? 'dialog' : 'region'" :aria-modal="blocking || undefined"
        :aria-label="t(session.definition.title)">
    <div v-if="session" ref="cardBody" class="oc-tutorial__body">
      <header class="oc-tutorial__heading" aria-live="polite">
        <span><OcInlineMarkup :source="t(session.definition.title)" /></span>
        <OcProgressBar class="oc-tutorial__progress" variant="thin" :value="session.index + 1" :max="session.definition.steps.length"
          :text="t('tutorial.progress', { current: session.index + 1, total: session.definition.steps.length })" />
      </header>
      <Transition name="oc-tutorial-step">
      <div :key="`${session.run}:${session.step.id}`" class="oc-tutorial__content" aria-live="polite">
        <section v-if="session.step.message">
          <strong><OcInlineMarkup :source="t(session.step.message.title)" /></strong>
          <p><OcInlineMarkup :source="t(session.step.message.desc)" /></p>
        </section>
        <section v-for="target in session.step.targets" :key="target.key" :data-oc-tutorial-message="target.key">
          <strong><OcInlineMarkup :source="t(target.title)" /></strong>
          <p><OcInlineMarkup :source="t(target.desc)" /></p>
        </section>
        <p v-if="missing" role="status">{{ t('tutorial.targetMissing') }}</p>
      </div>
      </Transition>
      <footer class="oc-tutorial__actions">
        <OcButton @click="emit('exit')">{{ t(session.step.exitLabel ?? 'tutorial.exit') }}</OcButton>
        <OcButton v-if="missing" variant="outline" @click="locate(true)">{{ t('tutorial.retry') }}</OcButton>
        <OcButton v-else-if="session.step.manual" :autofocus="blocking || undefined" variant="solid" @click="complete">{{ t(session.step.nextLabel ?? (session.index === session.definition.steps.length - 1 ? 'tutorial.finish' : 'tutorial.next')) }}</OcButton>
      </footer>
    </div>
      </div>
    </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.oc-tutorial-layer { position: fixed; inset: 0; z-index: calc(var(--oc-z-popover) - 1); pointer-events: none; }
.oc-tutorial-overlay-enter-active, .oc-tutorial-overlay-leave-active {
  transition: opacity var(--oc-duration-layout) var(--oc-ease);
}
.oc-tutorial-overlay-enter-from, .oc-tutorial-overlay-leave-to { opacity: 0; }
.oc-tutorial-overlay-enter-active .oc-tutorial,
.oc-tutorial-overlay-leave-active .oc-tutorial {
  transition: translate var(--oc-duration-layout) var(--oc-ease);
}
.oc-tutorial-overlay-enter-from .oc-tutorial,
.oc-tutorial-overlay-leave-to .oc-tutorial {
  translate: var(--oc-tutorial-flight-x) var(--oc-tutorial-flight-y);
}
.oc-tutorial-overlay-leave-active .oc-tutorial,
.oc-tutorial-overlay-leave-active .oc-tutorial__mask,
.oc-tutorial-overlay-leave-active .oc-tutorial__interaction-shield { pointer-events: none; }
.oc-tutorial__click-hint {
  position: fixed;
  transform: translate(-50%, -50%);
  display: inline-flex;
  padding: var(--oc-space-xs);
  background: var(--oc-bg-surface);
  border: 1px solid var(--oc-accent);
  border-radius: var(--oc-radius-control);
}
.oc-tutorial__click-hint, .oc-tutorial__click-hint :deep(*) { pointer-events: none; }
.oc-tutorial {
  position: fixed;
  top: 0;
  left: 0;
  box-sizing: border-box;
  pointer-events: auto;
  color: var(--oc-fg-default);
  background: var(--oc-bg-surface);
  border: 1px solid var(--oc-border-default);
  border-radius: var(--oc-radius-control);
  box-shadow: var(--oc-shadow-lg);
  padding: var(--oc-space-md);
  overflow-y: auto;
  font-size: var(--oc-text-sm);
  user-select: none;
  -webkit-user-select: none;
}
.oc-tutorial code, .oc-tutorial pre { user-select: text; -webkit-user-select: text; }
.oc-tutorial--morphing {
  transition: transform var(--oc-duration-layout) var(--oc-ease),
    width var(--oc-duration-layout) var(--oc-ease), height var(--oc-duration-layout) var(--oc-ease),
    opacity var(--oc-duration-quick) var(--oc-ease);
}
.oc-tutorial__body { position: relative; }
.oc-tutorial-step-enter-active, .oc-tutorial-step-leave-active { transition: opacity var(--oc-duration-quick) var(--oc-ease); }
.oc-tutorial-step-leave-active { position: absolute; left: 0; right: 0; pointer-events: none; }
.oc-tutorial-step-enter-from, .oc-tutorial-step-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .oc-tutorial--morphing, .oc-tutorial-step-enter-active, .oc-tutorial-step-leave-active,
  .oc-tutorial-overlay-enter-active, .oc-tutorial-overlay-leave-active,
  .oc-tutorial-overlay-enter-active .oc-tutorial,
  .oc-tutorial-overlay-leave-active .oc-tutorial { transition: none; }
}
.oc-tutorial__heading, .oc-tutorial__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--oc-space-sm);
}
.oc-tutorial__heading { color: var(--oc-fg-muted); font-size: var(--oc-text-xs); }
.oc-tutorial__progress { flex: 0 0 45%; }
.oc-tutorial__content { display: grid; gap: var(--oc-space-md); padding-block: var(--oc-space-md); }
.oc-tutorial__content section > strong { font-size: var(--oc-text-base); font-weight: var(--font-weight-ui-title); }
.oc-tutorial__content p { margin-top: var(--oc-space-xs); color: var(--oc-fg-muted); line-height: 1.6; }
.oc-tutorial__actions { justify-content: flex-end; }
.oc-tutorial__mask {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.oc-tutorial__shade { fill: var(--oc-bg-modal-backdrop); }
.oc-tutorial__interaction-shield { fill: transparent; pointer-events: fill; cursor: default; }
.oc-tutorial__mask--blocking { pointer-events: all; }
.oc-tutorial__outline { fill: none; stroke: var(--oc-accent); stroke-width: 2; }
.oc-tutorial__connector { fill: none; stroke: var(--oc-accent); stroke-width: 1.5; }
</style>

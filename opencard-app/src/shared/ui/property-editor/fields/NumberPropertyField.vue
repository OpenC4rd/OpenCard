<template>
  <OcFieldFrame class="number-field" full-width :readonly="definition.isReadonly">
    <OcFieldInput
      as="input"
      class="number-field__input"
      variant="plain"
      type="text"
      inputmode="decimal"
      :value="textValue"
      :readonly="definition.isReadonly"
      full-width
      @input="onInput"
      @blur="onBlur"
    />
    <template #suffix>
      <span class="number-field__steppers">
        <OcButton class="number-field__stepper" icon-only variant="ghost" icon="nav.chevron-up"
          :disabled="definition.isReadonly || isAtMaximum" aria-label="Increase"
          @click="handleStepperClick(1, $event)" @pointerdown="startStepHold(1, $event)" />
        <OcButton class="number-field__stepper" icon-only variant="ghost" icon="nav.chevron-down"
          :disabled="definition.isReadonly || isAtMinimum" aria-label="Decrease"
          @click="handleStepperClick(-1, $event)" @pointerdown="startStepHold(-1, $event)" />
      </span>
    </template>
  </OcFieldFrame>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import OcButton from '../../../../components/base/OcButton.vue'
import OcFieldFrame from '../../../../components/base/OcFieldFrame.vue'
import OcFieldInput from '../../../../components/base/OcFieldInput.vue'
import type { PropertyEditorFieldDefinition } from '../propertyEditor.types'

const props = defineProps<{
  definition: Extract<PropertyEditorFieldDefinition, { fieldType: 'number' }>
  value: unknown
}>()

const emit = defineEmits<{
  (e: 'update:value', value: string): void
}>()

const HOLD_DELAY_MS = 420
const REPEAT_START_INTERVAL_MS = 160
const REPEAT_MIN_INTERVAL_MS = 35
const REPEAT_ACCELERATION_MS = 1800
const SHIFT_STEP_MULTIPLIER = 5
const WRITE_PRECISION_SCALE = 1000

let holdTimer: number | null = null
let holdDirection: -1 | 1 | null = null
let holdStartedAt = 0
let holdValue = 0
let holdShiftKey = false
let didRepeatDuringHold = false
let suppressNextClick = false

const textValue = computed(() => typeof props.value === 'string' ? props.value : '')
const numberValue = computed(() => {
  const parsed = textValue.value.trim() === '' ? Number.NaN : Number(textValue.value)
  return Number.isFinite(parsed) ? parsed : undefined
})
const allowedValues = computed(() => [...new Set(props.definition.allowedValues ?? [])]
  .filter(value => Number.isFinite(value)
    && (props.definition.min == null || value >= props.definition.min)
    && (props.definition.max == null || value <= props.definition.max))
  .sort((left, right) => left - right))
const effectiveMinimum = computed(() => allowedValues.value[0] ?? props.definition.min)
const effectiveMaximum = computed(() => allowedValues.value[allowedValues.value.length - 1] ?? props.definition.max)
const isAtMinimum = computed(() => effectiveMinimum.value != null && numberValue.value != null
  && numberValue.value <= effectiveMinimum.value)
const isAtMaximum = computed(() => effectiveMaximum.value != null && numberValue.value != null
  && numberValue.value >= effectiveMaximum.value)

function onInput(event: Event) {
  emit('update:value', (event.target as HTMLInputElement).value)
}

function onBlur(event: FocusEvent): void {
  const value = (event.target as HTMLInputElement).value.trim()
  if (!value) return
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return
  const normalized = String(normalizeWrittenNumber(parsed))
  if (normalized !== value) emit('update:value', normalized)
}

function normalizeWrittenNumber(value: number): number {
  const roundedMagnitude = Math.round(
    (Math.abs(value) + Number.EPSILON) * WRITE_PRECISION_SCALE,
  ) / WRITE_PRECISION_SCALE
  return Object.is(roundedMagnitude, 0) ? 0 : Math.sign(value) * roundedMagnitude
}

function calculateNextValue(current: number, direction: -1 | 1, shiftKey: boolean): number {
  if (allowedValues.value.length) {
    const candidates = direction > 0
      ? allowedValues.value.filter(value => value > current)
      : allowedValues.value.filter(value => value < current).reverse()
    return normalizeWrittenNumber(
      candidates[Math.min(candidates.length - 1, (shiftKey ? SHIFT_STEP_MULTIPLIER : 1) - 1)] ?? current,
    )
  }
  const minimum = props.definition.min ?? -Infinity
  const maximum = props.definition.max ?? Infinity
  const baseStep = props.definition.step ?? 1
  const step = baseStep * (shiftKey ? SHIFT_STEP_MULTIPLIER : 1)
  return normalizeWrittenNumber(Math.min(maximum, Math.max(minimum, current + direction * step)))
}

function stepValue(direction: -1 | 1, shiftKey: boolean, current = numberValue.value ?? 0): number {
  const next = calculateNextValue(current, direction, shiftKey)
  if (next !== current) {
    emit('update:value', String(next))
  }
  return next
}

function getRepeatInterval(elapsedMs: number): number {
  const accelerationProgress = Math.min(1, Math.max(0, elapsedMs / REPEAT_ACCELERATION_MS))
  return REPEAT_START_INTERVAL_MS
    - (REPEAT_START_INTERVAL_MS - REPEAT_MIN_INTERVAL_MS) * accelerationProgress
}

function scheduleHoldStep(delay: number): void {
  holdTimer = window.setTimeout(runHoldStep, delay)
}

function runHoldStep(): void {
  if (holdDirection == null) return

  didRepeatDuringHold = true
  const next = stepValue(holdDirection, holdShiftKey, holdValue)
  if (next === holdValue) {
    stopStepHold()
    return
  }

  holdValue = next
  scheduleHoldStep(getRepeatInterval(performance.now() - holdStartedAt - HOLD_DELAY_MS))
}

function startStepHold(direction: -1 | 1, event: PointerEvent): void {
  if (event.button !== 0) return

  stopStepHold()
  holdDirection = direction
  holdStartedAt = performance.now()
  holdValue = numberValue.value ?? 0
  holdShiftKey = event.shiftKey
  didRepeatDuringHold = false
  window.addEventListener('pointerup', stopStepHold)
  window.addEventListener('pointercancel', stopStepHold)
  window.addEventListener('keydown', updateHoldModifier)
  window.addEventListener('keyup', updateHoldModifier)
  window.addEventListener('blur', stopStepHold)
  scheduleHoldStep(HOLD_DELAY_MS)
}

function stopStepHold(): void {
  if (holdTimer != null) {
    window.clearTimeout(holdTimer)
    holdTimer = null
  }
  if (didRepeatDuringHold) {
    suppressNextClick = true
  }
  holdDirection = null
  didRepeatDuringHold = false
  window.removeEventListener('pointerup', stopStepHold)
  window.removeEventListener('pointercancel', stopStepHold)
  window.removeEventListener('keydown', updateHoldModifier)
  window.removeEventListener('keyup', updateHoldModifier)
  window.removeEventListener('blur', stopStepHold)
}

function updateHoldModifier(event: KeyboardEvent): void {
  holdShiftKey = event.shiftKey
}

function handleStepperClick(direction: -1 | 1, event: MouseEvent): void {
  if (suppressNextClick) {
    suppressNextClick = false
    return
  }
  stepValue(direction, event.shiftKey)
}

onBeforeUnmount(stopStepHold)
</script>

<style scoped>
.number-field__steppers {
  display: grid;
  flex: 0 0 var(--oc-icon-size-sm);
  height: 100%;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  border-left: var(--oc-border-width) solid var(--oc-border-muted);
}

.number-field__stepper.oc-button {
  width: var(--oc-icon-size-sm);
  height: 100%;
  min-height: 0;
  padding: 0;
  border-radius: 0;
  color: var(--oc-fg-muted);
}

.number-field__stepper:first-child {
  border-bottom: var(--oc-border-width) solid var(--oc-border-muted);
}

.number-field__stepper:hover:not(:disabled),
.number-field__stepper:focus-visible {
  color: var(--oc-fg-default);
}
</style>

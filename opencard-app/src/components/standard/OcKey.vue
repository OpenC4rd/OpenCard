<!-- Shared keyboard-key primitive used by inline markup and structured shortcuts. -->
<template>
  <kbd class="oc-key"><slot /></kbd>
</template>

<script setup lang="ts">
defineOptions({ name: 'OcKey' })
</script>

<style scoped>
.oc-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: var(--oc-inline-key-height);
  min-height: var(--oc-inline-key-height);
  padding: 0 var(--oc-inline-key-padding-inline);
  border: var(--oc-border-width) solid var(--oc-border-default);
  border-radius: var(--oc-radius-control);
  background: var(--oc-bg-surface);
  color: var(--oc-fg-default);
  font-family: var(--oc-font-mono);
  font-size: var(--oc-text-sm);
  font-weight: inherit;
  line-height: var(--oc-inline-key-height);
  vertical-align: middle;
  transform: translateY(calc(var(--oc-border-width) * -1));
  box-shadow:
    inset 0 var(--oc-border-width) 0 var(--oc-inline-key-highlight),
    inset 0 calc(var(--oc-border-width) * -1) 0 var(--oc-inline-key-lowlight),
    0 var(--oc-inline-key-shadow-offset) 0 var(--oc-border-strong),
    var(--oc-shadow-sm);
}
</style>

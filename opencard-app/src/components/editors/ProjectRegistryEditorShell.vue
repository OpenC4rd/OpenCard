<template>
  <section class="project-registry-shell" :class="`project-registry-shell--${contentMode}`">
    <main class="project-registry-shell__content">
      <slot />
    </main>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  contentMode?: 'padded' | 'workspace'
}>(), {
  contentMode: 'padded',
})
</script>

<style scoped>
.project-registry-shell {
  box-sizing: border-box;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.project-registry-shell__content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: var(--oc-space-lg) var(--oc-space-lg);
  scrollbar-gutter: stable;
}

.project-registry-shell--workspace .project-registry-shell__content {
  overflow: hidden;
  padding: 0;
  scrollbar-gutter: auto;
}
</style>

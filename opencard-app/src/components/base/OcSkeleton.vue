<!-- Base 骨架：在内容尚未准备好时保留一块稳定的文字占位。 -->
<template>
  <span
    class="oc-skeleton"
    :class="[`oc-skeleton--width-${props.width}`, `oc-skeleton--height-${props.height}`]"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
type OcSkeletonWidth = 'sm' | 'md' | 'lg' | 'xl'
type OcSkeletonHeight = 'sm' | 'md'

interface OcSkeletonProps {
  /** 占位条的宽度级别。决定标题尚未就绪时保留的横向空间。 */
  width?: OcSkeletonWidth
  /** 占位条的高度级别。决定它与哪一级界面文字对齐。 */
  height?: OcSkeletonHeight
}

defineOptions({ name: 'OcSkeleton' })

const props = withDefaults(defineProps<OcSkeletonProps>(), {
  width: 'md',
  height: 'sm',
})
</script>

<style scoped>
.oc-skeleton {
  display: inline-block;
  flex: 0 0 auto;
  border-radius: var(--oc-radius-full);
  background: color-mix(in srgb, var(--oc-fg-muted) 18%, transparent);
  background-image: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--oc-fg-default) 12%, transparent),
    transparent
  );
  background-size: 200% 100%;
  animation: oc-skeleton-shimmer var(--oc-duration-theme) linear infinite;
}

.oc-skeleton--width-sm { width: calc(var(--oc-size-lg) * 3); }
.oc-skeleton--width-md { width: calc(var(--oc-size-lg) * 4); }
.oc-skeleton--width-lg { width: calc(var(--oc-size-lg) * 5); }
.oc-skeleton--width-xl { width: calc(var(--oc-size-lg) * 6); }
.oc-skeleton--height-sm { height: var(--oc-space-3); }
.oc-skeleton--height-md { height: var(--oc-space-4); }

@keyframes oc-skeleton-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .oc-skeleton { animation: none; }
}
</style>

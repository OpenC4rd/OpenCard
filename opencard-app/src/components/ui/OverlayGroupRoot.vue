<template>
  <OverlayGroupHost v-for="[group] of overlayGroups" :key="group" :group="group" />
</template>

<script setup lang="ts">
import OverlayGroupHost from './OverlayGroupHost.vue'
import { overlayGroups } from '../../composables/overlayGroups'

defineOptions({ name: 'OverlayGroupRoot' })
</script>

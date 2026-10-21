<script setup lang="ts">
import type { Marker } from '../lib/markers'

defineProps<{
  marker: Marker
  color: string
}>()
</script>

<template>
  <svg viewBox="0 0 12 12" aria-hidden="true" :fill="color">
    <polygon v-if="marker === 'diamond'" points="6,0.5 11.5,6 6,11.5 0.5,6" />
    <polygon v-else-if="marker === 'triangle'" points="6,0.6 11.6,10.4 0.4,10.4" />
    <circle v-else cx="6" cy="6" r="5" />
  </svg>
</template>

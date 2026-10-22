<script setup lang="ts">
import { RouterView } from 'vue-router'
import { useEscapeFullscreen } from './composables/useEscapeFullscreen'

useEscapeFullscreen()
</script>

<template>
  <RouterView />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { parseQty } from '../lib/quantity'

const props = defineProps<{
  /** 带标记的文字，一对星号包住物理量符号，如 `质量*m*` 后接单位 */
  text: string
}>()

const segments = computed(() => parseQty(props.text))
</script>

<template>
  <span><span v-for="(segment, index) in segments" :key="index" :class="segment.italic && 'italic'">{{ segment.text }}</span></span>
</template>

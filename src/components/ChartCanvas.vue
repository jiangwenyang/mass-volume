<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { drawChart, type ChartOptions, type Series } from '../lib/chart'

const props = defineProps<{
  series: Series[]
  options: ChartOptions
}>()

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvas')
let observer: ResizeObserver | null = null

/**
 * 按当前尺寸重画。元素还没撑开时先跳过。
 */
const paint = (): void => {
  const canvas = canvasRef.value
  if (!canvas) return
  drawChart(canvas, props.series, props.options)
}

watch(() => [props.series, props.options], paint, { deep: true })

onMounted(() => {
  paint()
  const canvas = canvasRef.value
  if (!canvas) return
  observer = new ResizeObserver(() => paint())
  observer.observe(canvas.parentElement ?? canvas)
})

onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div class="relative min-h-0 flex-1">
    <canvas ref="canvas" class="absolute inset-0 h-full w-full" />
  </div>
</template>

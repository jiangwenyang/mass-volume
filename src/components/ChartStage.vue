<script setup lang="ts">
import { computed } from 'vue'
import ChartCanvas from './ChartCanvas.vue'
import type { PlotMotion, PlotProgress } from '../composables/usePlot'
import type { Guide, Series } from '../lib/chart'
import { colorFor, fitK, pointsOf, sharedLimits } from '../lib/lab'
import type { Group } from '../types'

const props = defineProps<{
  groups: Group[]
  mode: 'single' | 'all' | 'summary'
  activeId: string
  progress: Record<string, PlotProgress>
  motion: PlotMotion | null
}>()

const limits = computed(() => sharedLimits(props.groups))

const activeIndex = computed(() => {
  const index = props.groups.findIndex((group) => group.id === props.activeId)
  return index < 0 ? 0 : index
})

const active = computed(() => props.groups[activeIndex.value])

/**
 * 读取一组保存下来的描点进度。
 * @param groupId - 组 id
 * @returns 点数和直线进度
 */
const saved = (groupId: string): PlotProgress =>
  props.progress[groupId] ?? { shown: 0, showLine: false, lineProgress: 0 }

const singleSeries = computed((): Series[] => {
  const group = active.value
  if (!group) return []
  const plot = saved(group.id)
  return [
    {
      name: group.name,
      color: colorFor(activeIndex.value),
      points: pointsOf(group).slice(0, plot.shown),
      line: plot.showLine,
      lineProgress: plot.lineProgress,
    },
  ]
})

const singleGuides = computed((): Guide[] => {
  const series = singleSeries.value[0]
  if (!series) return []
  return series.points.map((point) => ({ x: point.x, y: point.y, color: series.color }))
})

const singlePop = computed(() =>
  props.motion?.groupId === active.value?.id ? props.motion.pop : 1,
)

const singleOptions = computed(() => ({
  maxX: limits.value.maxX,
  maxY: limits.value.maxY,
  guides: singleGuides.value,
  showValues: true,
  pop: singlePop.value,
  emptyText: '点击「描点」或「生成该组图像」',
}))

const singleTag = computed(() => {
  const group = active.value
  if (!group) return '等待操作'
  const plot = saved(group.id)
  const total = pointsOf(group).length
  if (plot.showLine && plot.lineProgress >= 1 && plot.shown >= total && total > 0) return '图像已生成'
  if (plot.shown > 0) return `描点 ${plot.shown} / ${total}`
  return '等待操作'
})

/**
 * 一组的完整序列，用于小图和汇总。
 * @param group - 实验组
 * @param index - 颜色下标
 * @returns 带拟合线的序列
 */
const fullSeries = (group: Group, index: number): Series => ({
  name: group.name,
  color: colorFor(index),
  points: pointsOf(group),
  line: true,
  lineProgress: 1,
})

const summarySeries = computed(() =>
  props.groups.map((group, index) => fullSeries(group, index)).filter((item) => item.points.length),
)

const summaryOptions = computed(() => ({
  maxX: limits.value.maxX,
  maxY: limits.value.maxY,
  emptyText: '暂无数据，请先在表格中填写',
}))

/**
 * 图例上要不要带密度。
 * @param item - 一条序列
 * @returns 展示文字
 */
const legendLabel = (item: Series): string => {
  const slope = fitK(item.points)
  if (!item.line || !(slope > 0)) return item.name
  return `${item.name}（ρ≈${slope.toFixed(2)} g/cm³）`
}
</script>

<template>
  <section v-if="mode === 'single'" class="flex h-full min-h-0 flex-col rounded-xl bg-white p-3 shadow-sm">
    <header class="mb-2 flex items-center gap-2">
      <span class="size-2.5 rounded-full" :style="{ background: colorFor(activeIndex) }" />
      <h3 class="text-base font-semibold text-slate-700">{{ active?.name }} m–V 图像</h3>
      <span class="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{{ singleTag }}</span>
    </header>
    <ChartCanvas :series="singleSeries" :options="singleOptions" />
    <div class="mt-1 flex flex-wrap gap-x-4 text-sm text-slate-600">
      <span v-for="item in singleSeries.filter((entry) => entry.points.length)" :key="item.name" class="inline-flex items-center gap-1.5">
        <i class="size-2.5 rounded-full" :style="{ background: item.color }" />
        {{ legendLabel(item) }}
      </span>
    </div>
  </section>

  <div v-else-if="mode === 'all'" class="grid h-full auto-rows-[260px] grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
    <article v-for="(group, index) in groups" :key="group.id" class="flex min-h-0 flex-col rounded-xl bg-white p-2 shadow-sm">
      <header class="mb-1 flex items-center gap-2 px-1">
        <span class="size-2.5 rounded-full" :style="{ background: colorFor(index) }" />
        <h3 class="text-sm font-semibold text-slate-700">{{ group.name }}</h3>
      </header>
      <ChartCanvas
        :series="[fullSeries(group, index)]"
        :options="{ maxX: limits.maxX, maxY: limits.maxY, small: true, emptyText: '无数据' }"
      />
    </article>
  </div>

  <section v-else class="flex h-full min-h-0 flex-col rounded-xl bg-white p-3 shadow-sm">
    <header class="mb-2">
      <h3 class="text-base font-semibold text-slate-700">全部组汇总 · m–V</h3>
    </header>
    <ChartCanvas :series="summarySeries" :options="summaryOptions" />
    <div class="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
      <span v-for="item in summarySeries" :key="item.name" class="inline-flex items-center gap-1.5">
        <i class="size-2.5 rounded-full" :style="{ background: item.color }" />
        {{ legendLabel(item) }}
      </span>
    </div>
  </section>
</template>

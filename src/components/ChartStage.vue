<script setup lang="ts">
import { computed } from 'vue'
import ChartCanvas from './ChartCanvas.vue'
import type { PlotMotion, PlotProgress } from '../composables/usePlot'
import type { Guide, Series } from '../lib/chart'
import { colorFor, fitK, pointsOf, sharedLimits, tint } from '../lib/lab'
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
 * @returns 点数和连线进度
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
 * @returns 带连线的序列
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
  return `${item.name}（ρ≈${slope.toFixed(2)} (g/cm³)）`
}
</script>

<template>
  <section v-if="mode === 'single'" class="flex h-full min-h-0 flex-col rounded-2xl bg-sheet p-5 shadow-card">
    <header class="mb-3 flex items-center gap-2.5">
      <span class="grid size-6 shrink-0 place-items-center rounded-full" :style="{ background: tint(colorFor(activeIndex), 0.18) }" aria-hidden="true">
        <i class="size-2.5 rounded-full" :style="{ background: colorFor(activeIndex) }" />
      </span>
      <h3 class="text-xl font-bold text-ink">{{ active?.name }} <span class="font-medium text-muted">m–V 图像</span></h3>
      <span
        class="ml-auto inline-flex h-8 items-center rounded-full px-3.5 text-base font-semibold"
        :class="singleTag === '图像已生成' ? 'bg-live-soft text-live' : singleTag === '等待操作' ? 'bg-soft text-muted' : 'bg-primary-soft text-primary'"
      >
        {{ singleTag }}
      </span>
    </header>
    <ChartCanvas :series="singleSeries" :options="singleOptions" />
    <div class="mt-3 flex flex-wrap gap-2 text-base">
      <span
        v-for="item in singleSeries.filter((entry) => entry.points.length)"
        :key="item.name"
        class="inline-flex h-8 items-center gap-2 rounded-full px-3.5 font-medium text-ink"
        :style="{ background: tint(item.color, 0.14) }"
      >
        <i class="size-2.5 rounded-full" :style="{ background: item.color }" />
        {{ legendLabel(item) }}
      </span>
    </div>
  </section>

  <div v-else-if="mode === 'all'" class="grid h-full auto-rows-[270px] grid-cols-1 gap-4 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
    <article v-for="(group, index) in groups" :key="group.id" class="flex min-h-0 flex-col rounded-2xl bg-sheet p-3.5 shadow-card">
      <header class="mb-1.5 flex items-center gap-2 px-1">
        <span class="grid size-5 shrink-0 place-items-center rounded-full" :style="{ background: tint(colorFor(index), 0.18) }" aria-hidden="true">
          <i class="size-2 rounded-full" :style="{ background: colorFor(index) }" />
        </span>
        <h3 class="text-base font-bold text-ink">{{ group.name }}</h3>
      </header>
      <ChartCanvas
        :series="[fullSeries(group, index)]"
        :options="{ maxX: limits.maxX, maxY: limits.maxY, small: true, emptyText: '无数据' }"
      />
    </article>
  </div>

  <section v-else class="flex h-full min-h-0 flex-col rounded-2xl bg-sheet p-5 shadow-card">
    <header class="mb-3">
      <h3 class="text-xl font-bold text-ink">全部组汇总 <span class="font-medium text-muted">m–V 图像</span></h3>
    </header>
    <ChartCanvas :series="summarySeries" :options="summaryOptions" />
    <div class="mt-3 flex flex-wrap gap-2 text-base">
      <span
        v-for="item in summarySeries"
        :key="item.name"
        class="inline-flex h-8 items-center gap-2 rounded-full px-3.5 font-medium text-ink"
        :style="{ background: tint(item.color, 0.14) }"
      >
        <i class="size-2.5 rounded-full" :style="{ background: item.color }" />
        {{ legendLabel(item) }}
      </span>
    </div>
  </section>
</template>

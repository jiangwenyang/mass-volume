<script setup lang="ts">
import { computed, ref } from 'vue'
import AllCharts from './AllCharts.vue'
import ChartCanvas from './ChartCanvas.vue'
import GroupPicker from './GroupPicker.vue'
import MarkerIcon from './MarkerIcon.vue'
import QtyText from './QtyText.vue'
import type { PlotMotion, PlotProgress } from '../composables/usePlot'
import { groupChart, groupSeries } from '../lib/groupChart'
import { pointsOf, sharedLimits, tint } from '../lib/lab'
import type { Group } from '../types'

const props = defineProps<{
  groups: Group[]
  mode: 'single' | 'all' | 'summary'
  activeId: string
  progress: Record<string, PlotProgress>
  motion: PlotMotion | null
}>()

/** 所有组页、汇总页各自取消勾选的组，切到别的视图再回来时保留 */
const hiddenIds = ref<string[]>([])
const summaryHiddenIds = ref<string[]>([])

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

const singleChart = computed(() => {
  const group = active.value
  if (!group) return null
  const pop = props.motion?.groupId === group.id ? props.motion.pop : 1
  return groupChart(group, activeIndex.value, limits.value, saved(group.id), pop)
})

const singleLine = computed(() => singleChart.value?.series[0])

const singleTag = computed(() => {
  const group = active.value
  if (!group) return '等待操作'
  const plot = saved(group.id)
  const total = pointsOf(group).length
  if (plot.showLine && plot.lineProgress >= 1 && plot.shown >= total && total > 0) return '图像已生成'
  if (plot.shown > 0) return `描点 ${plot.shown} / ${total}`
  return '等待操作'
})

const summarySeries = computed(() =>
  props.groups
    .flatMap((group, index) => (summaryHiddenIds.value.includes(group.id) ? [] : [groupSeries(group, index)]))
    .filter((item) => item.points.length),
)

const summaryOptions = computed(() => ({
  maxX: limits.value.maxX,
  maxY: limits.value.maxY,
  emptyText: props.groups.every((group) => summaryHiddenIds.value.includes(group.id))
    ? '请勾选要显示的组'
    : '暂无数据，请先在表格中填写',
}))
</script>

<template>
  <section v-if="mode === 'single'" class="flex h-full min-h-0 flex-col rounded-2xl bg-sheet p-5 shadow-card">
    <header class="mb-3 flex items-center gap-2.5">
      <span
        v-if="singleLine"
        class="grid size-6 shrink-0 place-items-center rounded-full"
        :style="{ background: tint(singleLine.color, 0.18) }"
        aria-hidden="true"
      >
        <MarkerIcon class="size-3" :marker="singleLine.marker" :color="singleLine.color" />
      </span>
      <h3 class="text-xl font-bold text-ink">{{ active?.name }} <QtyText class="font-medium text-muted" text="*m*–*V* 图像" /></h3>
      <span
        class="ml-auto inline-flex h-8 items-center rounded-full px-3.5 text-base font-semibold"
        :class="singleTag === '图像已生成' ? 'bg-live-soft text-live' : singleTag === '等待操作' ? 'bg-soft text-muted' : 'bg-primary-soft text-primary'"
      >
        {{ singleTag }}
      </span>
    </header>
    <ChartCanvas v-if="singleChart" :series="singleChart.series" :options="singleChart.options" />
    <div class="mt-3 flex flex-wrap gap-2 text-base">
      <span
        v-if="singleLine?.points.length"
        class="inline-flex h-8 items-center gap-2 rounded-full px-3.5 font-medium text-ink"
        :style="{ background: tint(singleLine.color, 0.14) }"
      >
        <MarkerIcon class="size-3" :marker="singleLine.marker" :color="singleLine.color" />
        {{ singleLine.name }}
      </span>
    </div>
  </section>

  <AllCharts v-else-if="mode === 'all'" v-model:hidden="hiddenIds" :groups="groups" />

  <section v-else class="flex h-full min-h-0 flex-col rounded-2xl bg-sheet p-5 shadow-card">
    <header class="mb-3">
      <h3 class="text-xl font-bold text-ink">全部组汇总 <QtyText class="font-medium text-muted" text="*m*–*V* 图像" /></h3>
    </header>
    <ChartCanvas :series="summarySeries" :options="summaryOptions" />
    <GroupPicker v-model:hidden="summaryHiddenIds" class="mt-3" :groups="groups" />
  </section>
</template>

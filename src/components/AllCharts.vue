<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Maximize2, Minimize2 } from '@lucide/vue'
import ChartCanvas from './ChartCanvas.vue'
import GroupPicker from './GroupPicker.vue'
import MarkerIcon from './MarkerIcon.vue'
import { FULL_PLOT, groupChart } from '../lib/groupChart'
import { colorFor, sharedLimits, tint } from '../lib/lab'
import { markerOf } from '../lib/markers'
import type { Group } from '../types'

const props = defineProps<{
  groups: Group[]
}>()

/** 取消勾选的组 id。记未勾选的一侧，新加的组默认就会显示 */
const hidden = defineModel<string[]>('hidden', { default: () => [] })

/** 单独放大显示的组，空串表示显示全部勾选的组 */
const focusId = ref('')

const limits = computed(() => sharedLimits(props.groups))

const entries = computed(() =>
  props.groups.map((group, index) => ({
    group,
    color: colorFor(index),
    marker: markerOf(group.name),
    checked: !hidden.value.includes(group.id),
    chart: groupChart(group, index, limits.value, FULL_PLOT, 1, group.id === focusId.value),
  })),
)

const shown = computed(() => {
  const checked = entries.value.filter((entry) => entry.checked)
  const target = checked.find((entry) => entry.group.id === focusId.value)
  return target ? [target] : checked
})

const focused = computed(() => shown.value.length === 1 && shown.value[0]?.group.id === focusId.value)

/** 图少时放大：1 张占满，2～3 张一行，4 张 2×2，更多时每行 3 张 */
const columns = computed(() => {
  const count = shown.value.length
  return count === 4 ? 2 : Math.min(Math.max(count, 1), 3)
})

// 勾选变化后退出单独显示，直接看到新的组合
watch(hidden, () => {
  focusId.value = ''
})

/**
 * 点一张图单独显示这一组，再点一次回到勾选的各组。
 * @param id - 组 id
 */
const toggleFocus = (id: string): void => {
  focusId.value = focusId.value === id ? '' : id
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3">
    <GroupPicker v-model:hidden="hidden" :groups="groups" />

    <p v-if="!shown.length" class="grid flex-1 place-items-center rounded-2xl bg-sheet text-lg text-muted shadow-card">请勾选要显示的组</p>
    <div
      v-else
      class="grid min-h-0 flex-1 auto-rows-[minmax(13.5rem,1fr)] gap-4 overflow-y-auto"
      :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
    >
      <article
        v-for="entry in shown"
        :key="entry.group.id"
        role="button"
        tabindex="0"
        class="flex min-h-0 cursor-pointer flex-col rounded-2xl bg-sheet shadow-card transition-shadow outline-none hover:shadow-[0_10px_28px_rgb(47_107_255/0.14)] focus-visible:shadow-[0_0_0_3px_rgb(47_107_255/0.35)]"
        :class="focused ? 'p-5' : 'p-3.5'"
        :aria-pressed="focused"
        :title="focused ? '再次点击，返回勾选的各组' : '点击单独显示这一组'"
        @click="toggleFocus(entry.group.id)"
        @keydown.enter.prevent="toggleFocus(entry.group.id)"
        @keydown.space.prevent="toggleFocus(entry.group.id)"
      >
        <header class="flex items-center gap-2 px-1" :class="focused ? 'mb-3' : 'mb-1.5'">
          <span
            class="grid shrink-0 place-items-center rounded-full"
            :class="focused ? 'size-6' : 'size-5'"
            :style="{ background: tint(entry.color, 0.18) }"
            aria-hidden="true"
          >
            <MarkerIcon :class="focused ? 'size-3' : 'size-2.5'" :marker="entry.marker" :color="entry.color" />
          </span>
          <h3 class="min-w-0 truncate font-bold text-ink" :class="focused ? 'text-xl' : 'text-base'">{{ entry.group.name }}</h3>
          <span class="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted">
            <component :is="focused ? Minimize2 : Maximize2" class="size-3.5" />
            {{ focused ? '返回' : '放大' }}
          </span>
        </header>
        <ChartCanvas :series="entry.chart.series" :options="entry.chart.options" />
      </article>
    </div>
  </div>
</template>

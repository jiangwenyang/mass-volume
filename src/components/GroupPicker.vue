<script setup lang="ts">
import { computed } from 'vue'
import MarkerIcon from './MarkerIcon.vue'
import { colorFor, tint } from '../lib/lab'
import { markerOf } from '../lib/markers'
import type { Group } from '../types'

const props = defineProps<{
  groups: Group[]
}>()

/** 取消勾选的组 id。记未勾选的一侧，新加的组默认就会显示 */
const hidden = defineModel<string[]>('hidden', { default: () => [] })

const entries = computed(() =>
  props.groups.map((group, index) => ({
    id: group.id,
    name: group.name,
    color: colorFor(index),
    marker: markerOf(group.name),
    checked: !hidden.value.includes(group.id),
  })),
)

/**
 * 勾选或取消一组。
 * @param id - 组 id
 */
const toggle = (id: string): void => {
  hidden.value = hidden.value.includes(id) ? hidden.value.filter((item) => item !== id) : [...hidden.value, id]
}
</script>

<template>
  <div class="flex shrink-0 flex-wrap items-center gap-1.5" role="group" aria-label="选择要显示的组">
    <label
      v-for="entry in entries"
      :key="entry.id"
      class="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full pr-2.5 pl-2 text-[13px] font-medium transition-colors"
      :class="entry.checked ? 'text-ink' : 'bg-soft text-muted hover:bg-deep'"
      :style="entry.checked ? { background: tint(entry.color, 0.14) } : undefined"
    >
      <input
        type="checkbox"
        class="size-3.5 cursor-pointer"
        :style="{ accentColor: entry.color }"
        :checked="entry.checked"
        @change="toggle(entry.id)"
      />
      <MarkerIcon class="size-2.5 shrink-0" :marker="entry.marker" :color="entry.color" />
      {{ entry.name }}
    </label>
  </div>
</template>

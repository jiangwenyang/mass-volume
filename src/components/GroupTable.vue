<script setup lang="ts">
import { computed, ref } from 'vue'
import { Crosshair, LineChart, Plus, Trash2 } from '@lucide/vue'
import CellInput from './CellInput.vue'
import QtyText from './QtyText.vue'
import { isOriginRow, ratioText, rowFilled, tint } from '../lib/lab'
import type { CellField, Group } from '../types'

/** 表头与参考表格一致，一对星号标出物理量符号 */
const COLUMNS = ['物块', '体积*V*/cm³', '质量*m*/g', '*m*/*V*(g/cm³)'] as const

const props = defineProps<{
  group: Group
  color: string
  large?: boolean
  active?: boolean
  showPlot?: boolean
  flashes?: string[]
  /** 当前停在这组填写页的平板数 */
  joined?: number
}>()

const emit = defineEmits<{
  patch: [row: number, field: CellField, value: number | null]
  add: []
  remove: [row: number]
  plot: []
  line: []
  select: []
}>()

const pendingRemove = ref<number | null>(null)

/** 单元格高度。紧凑版跟随外层的 --cell，好让数据表页按屏幕高度收放 */
const cellSize = computed(() => (props.large ? 'h-12 rounded-xl text-lg' : 'h-[var(--cell,2.25rem)] rounded-lg text-[15px]'))

/**
 * 空行直接删，有数字的行先问一句。原点行不能删。
 * @param index - 行下标
 */
const askRemove = (index: number): void => {
  if (isOriginRow(index) || props.group.rows.length <= 1) return
  const row = props.group.rows[index]
  if (row && rowFilled(row)) {
    pendingRemove.value = index
    return
  }
  emit('remove', index)
}

/**
 * 确认删掉刚才点中的那一行。
 */
const confirmRemove = (): void => {
  if (pendingRemove.value == null) return
  emit('remove', pendingRemove.value)
  pendingRemove.value = null
}
</script>

<template>
  <article
    class="overflow-hidden rounded-2xl bg-sheet shadow-card motion-safe:transition-shadow"
    :class="active ? 'shadow-[0_10px_28px_rgb(47_107_255/0.14)]' : ''"
    :style="large ? undefined : { fontSize: 'min(15px, calc(var(--cell, 2.25rem) * 0.5))', lineHeight: 1 }"
    @click="emit('select')"
  >
    <header
      class="flex items-center gap-x-1.5 gap-y-1 transition-colors"
      :class="large ? 'flex-wrap px-5 py-4' : 'h-[calc(var(--cell,2.25rem)_+_0.375rem)] px-3'"
      :style="active ? { background: tint(color, 0.12) } : undefined"
    >
      <div class="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          class="grid shrink-0 place-items-center rounded-full"
          :class="large ? 'size-6' : 'size-5'"
          :style="{ background: tint(color, 0.18) }"
          aria-hidden="true"
        >
          <i class="rounded-full" :class="large ? 'size-2.5' : 'size-2'" :style="{ background: color }" />
        </span>
        <h2 class="min-w-0 truncate font-bold text-ink" :class="large ? 'text-xl' : 'leading-none'">
          {{ group.name }}
        </h2>
      </div>
      <span v-if="joined" class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-live-soft px-2.5 text-xs font-semibold text-live">
        <span class="size-1.5 rounded-full bg-live" />
        已加入<template v-if="joined > 1"> · {{ joined }}</template>
      </span>
      <button
        v-if="showPlot"
        type="button"
        class="inline-flex h-6 shrink-0 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-muted transition-colors hover:bg-primary-soft hover:text-primary focus-visible:bg-primary-soft focus-visible:text-primary"
        @click.stop="emit('plot')"
      >
        <Crosshair class="size-3.5" />
        描点
      </button>
      <button
        v-if="showPlot"
        type="button"
        class="inline-flex h-6 shrink-0 items-center gap-1 rounded-lg px-1.5 text-xs font-semibold text-muted transition-colors hover:bg-primary-soft hover:text-primary focus-visible:bg-primary-soft focus-visible:text-primary"
        @click.stop="emit('line')"
      >
        <LineChart class="size-3.5" />
        生成图像
      </button>
      <button
        v-if="!large"
        type="button"
        class="inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-primary-soft hover:text-primary focus-visible:bg-primary-soft focus-visible:text-primary"
        aria-label="添加一行"
        title="添加一行"
        @click.stop="emit('add')"
      >
        <Plus class="size-4" />
      </button>
    </header>

    <div :class="large ? 'px-4 pb-4' : 'overflow-x-auto px-2.5 pb-2'">
      <table
        class="w-full border-separate text-center tabular-nums"
        :class="large ? 'border-spacing-y-1 text-lg' : 'border-spacing-y-0.5 leading-none'"
      >
        <thead>
          <tr class="text-muted">
            <th
              v-for="(column, index) in COLUMNS"
              :key="column"
              class="sticky top-0 z-10 bg-sheet whitespace-nowrap"
              :class="[
                large ? 'py-3 text-base' : 'h-[calc(var(--cell,2.25rem)*0.8)] overflow-hidden leading-none',
                index === 0 ? 'w-[14%]' : index < 3 ? 'w-[25%]' : '',
                index === 3 ? 'font-bold text-result' : 'font-medium',
              ]"
            >
              <QtyText :text="column" />
            </th>
            <th class="sticky top-0 z-10 bg-sheet" :class="large ? 'w-14 py-3' : 'w-8'" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in group.rows" :key="index" :class="row.v === 0 && row.m === 0 ? 'text-muted' : 'text-ink'">
            <td class="font-medium text-muted" :class="large && 'py-1'">{{ isOriginRow(index) ? '/' : index }}</td>
            <template v-if="isOriginRow(index)">
              <td v-for="field in ['v', 'm'] as const" :key="field" class="px-1" :class="large && 'py-1'">
                <span class="flex w-full items-center justify-center bg-soft/60 font-semibold text-muted" :class="cellSize">
                  {{ row[field] ?? 0 }}
                </span>
              </td>
              <td />
              <td />
            </template>
            <template v-else>
              <td class="px-1" :class="large && 'py-1'">
                <CellInput
                  :value="row.v"
                  :label="`${group.name} 第 ${index} 行体积`"
                  :large="large"
                  :flash="flashes?.includes(`${group.id}:${index}:v`)"
                  @commit="emit('patch', index, 'v', $event)"
                  @click.stop
                />
              </td>
              <td class="px-1" :class="large && 'py-1'">
                <CellInput
                  :value="row.m"
                  :label="`${group.name} 第 ${index} 行质量`"
                  :large="large"
                  :flash="flashes?.includes(`${group.id}:${index}:m`)"
                  @commit="emit('patch', index, 'm', $event)"
                  @click.stop
                />
              </td>
              <td class="px-1">
                <span
                  v-if="ratioText(row)"
                  class="inline-flex items-center justify-center rounded-full bg-result-soft font-bold text-result"
                  :class="large ? 'h-10 min-w-20 px-3 text-xl' : 'h-[calc(var(--cell,2.25rem)_-_0.25rem)] min-w-14 px-2'"
                >
                  {{ ratioText(row) }}
                </span>
                <span v-else class="text-muted/50">—</span>
              </td>
              <td>
                <button
                  type="button"
                  class="touch-manipulation inline-flex items-center justify-center rounded-lg text-muted/70 transition-colors hover:bg-result-soft hover:text-result focus-visible:bg-result-soft focus-visible:text-result disabled:opacity-30"
                  :class="large ? 'size-12' : 'size-[var(--cell,2rem)] max-w-8'"
                  :disabled="group.rows.length <= 1"
                  :aria-label="`删除第 ${index} 行`"
                  @click.stop="askRemove(index)"
                >
                  <Trash2 :class="large ? 'size-5' : 'size-3.5'" />
                </button>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="pendingRemove != null"
      class="mx-3 mb-3 flex items-center justify-between gap-3 rounded-xl bg-result-soft px-3 py-2 text-sm font-medium text-result"
      @click.stop
    >
      <span>删除第 {{ pendingRemove }} 行已填写的数据？</span>
      <span class="flex gap-2">
        <button type="button" class="h-9 rounded-lg px-3 text-muted transition-colors hover:bg-sheet focus-visible:bg-sheet" @click="pendingRemove = null">
          取消
        </button>
        <button type="button" class="h-9 rounded-lg bg-result px-3 font-semibold text-white focus-visible:bg-result/80" @click="confirmRemove">
          删除
        </button>
      </span>
    </div>
  </article>
</template>

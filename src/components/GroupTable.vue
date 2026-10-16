<script setup lang="ts">
import { ref } from 'vue'
import { Crosshair, LineChart, Plus, Trash2 } from '@lucide/vue'
import CellInput from './CellInput.vue'
import { ratioText, rowFilled, tint } from '../lib/lab'
import type { CellField, Group } from '../types'

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

/**
 * 空行直接删，有数字的行先问一句。
 * @param index - 行下标
 */
const askRemove = (index: number): void => {
  if (props.group.rows.length <= 1) return
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
    @click="emit('select')"
  >
    <header
      class="flex flex-wrap items-center gap-x-2 gap-y-1.5 transition-colors"
      :class="large ? 'px-5 py-4' : 'px-4 py-3'"
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
        <h2 class="min-w-0 truncate font-bold text-ink" :class="large ? 'text-xl' : 'text-base'">
          {{ group.name }}
        </h2>
      </div>
      <span v-if="joined" class="inline-flex h-6 items-center gap-1.5 rounded-full bg-live-soft px-2.5 text-xs font-semibold text-live">
        <span class="size-1.5 rounded-full bg-live" />
        已加入<template v-if="joined > 1"> · {{ joined }}</template>
      </span>
      <button
        v-if="showPlot"
        type="button"
        class="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:bg-primary-soft hover:text-primary focus-visible:bg-primary-soft focus-visible:text-primary"
        @click.stop="emit('plot')"
      >
        <Crosshair class="size-3.5" />
        描点
      </button>
      <button
        v-if="showPlot"
        type="button"
        class="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:bg-primary-soft hover:text-primary focus-visible:bg-primary-soft focus-visible:text-primary"
        @click.stop="emit('line')"
      >
        <LineChart class="size-3.5" />
        生成图像
      </button>
    </header>

    <div :class="large ? 'px-4 pb-4' : 'overflow-x-auto px-3 pb-1'">
      <table class="w-full border-separate border-spacing-y-1 text-center tabular-nums" :class="large ? 'text-lg' : 'text-[15px]'">
        <thead>
          <tr class="text-muted">
            <th class="sticky top-0 z-10 w-[14%] bg-sheet font-medium" :class="large ? 'py-3 text-base' : 'py-2 text-xs'">物块</th>
            <th class="sticky top-0 z-10 w-[24%] bg-sheet font-medium" :class="large ? 'py-3 text-base' : 'py-2 text-xs'">V (cm³)</th>
            <th class="sticky top-0 z-10 w-[24%] bg-sheet font-medium" :class="large ? 'py-3 text-base' : 'py-2 text-xs'">m (g)</th>
            <th
              class="sticky top-0 z-10 bg-sheet font-bold whitespace-nowrap text-result"
              :class="large ? 'py-3 text-base' : 'py-2 text-xs'"
            >
              m/V (g/cm³)
            </th>
            <th class="sticky top-0 z-10 bg-sheet" :class="large ? 'w-14 py-3' : 'w-10 py-2'" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in group.rows" :key="index" :class="row.v === 0 && row.m === 0 ? 'text-muted' : 'text-ink'">
            <td class="py-1 font-medium text-muted">{{ index }}</td>
            <td class="px-1 py-1">
              <CellInput
                :value="row.v"
                :label="`${group.name} 第 ${index} 行体积`"
                :large="large"
                :flash="flashes?.includes(`${group.id}:${index}:v`)"
                @commit="emit('patch', index, 'v', $event)"
                @click.stop
              />
            </td>
            <td class="px-1 py-1">
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
                :class="large ? 'h-10 min-w-20 px-3 text-xl' : 'h-7 min-w-14 px-2 text-[15px]'"
              >
                {{ ratioText(row) }}
              </span>
              <span v-else class="text-muted/50">—</span>
            </td>
            <td class="py-1">
              <button
                type="button"
                class="touch-manipulation inline-flex items-center justify-center rounded-lg text-muted/70 transition-colors hover:bg-result-soft hover:text-result focus-visible:bg-result-soft focus-visible:text-result disabled:opacity-30"
                :class="large ? 'size-12' : 'size-8'"
                :disabled="group.rows.length <= 1"
                :aria-label="`删除第 ${index} 行`"
                @click.stop="askRemove(index)"
              >
                <Trash2 :class="large ? 'size-5' : 'size-3.5'" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!large" class="px-3 pb-3">
      <button
        type="button"
        class="inline-flex h-9 w-full items-center justify-center gap-1 rounded-xl text-sm font-medium text-muted transition-colors hover:bg-primary-soft hover:text-primary focus-visible:bg-primary-soft focus-visible:text-primary"
        @click.stop="emit('add')"
      >
        <Plus class="size-4" />
        添加一行
      </button>
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

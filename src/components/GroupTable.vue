<script setup lang="ts">
import { ref } from 'vue'
import { Crosshair, LineChart, Plus, Trash2 } from '@lucide/vue'
import CellInput from './CellInput.vue'
import { ratioText, rowFilled } from '../lib/lab'
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
    class="rounded-xl border-2 bg-white shadow-sm transition"
    :class="active ? 'border-blue-600 shadow-[0_6px_18px_rgba(37,99,235,0.18)]' : 'border-transparent'"
    @click="emit('select')"
  >
    <header class="flex flex-wrap items-center gap-2 px-3 pt-3">
      <span class="size-2.5 rounded-full" :style="{ background: color }" />
      <h2 class="min-w-0 flex-1 truncate font-semibold text-slate-700" :class="large ? 'text-xl' : 'text-sm'">
        {{ group.name }}
      </h2>
      <span
        v-if="joined"
        class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"
      >
        <span class="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
        已加入<template v-if="joined > 1"> · {{ joined }}</template>
      </span>
      <button
        v-if="showPlot"
        type="button"
        class="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 transition active:translate-y-px"
        @click.stop="emit('plot')"
      >
        <Crosshair class="size-3.5" />
        描点
      </button>
      <button
        v-if="showPlot"
        type="button"
        class="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 transition active:translate-y-px"
        @click.stop="emit('line')"
      >
        <LineChart class="size-3.5" />
        生成图像
      </button>
    </header>

    <div class="px-2 py-2" :class="large ? '' : 'overflow-x-auto'">
      <table class="w-full border-collapse text-center" :class="large ? 'text-lg' : 'text-sm'">
        <thead>
          <tr class="text-slate-500">
            <th class="sticky top-0 z-10 w-[14%] rounded-l-md bg-slate-50 py-1.5 font-medium">物块</th>
            <th class="sticky top-0 z-10 w-[24%] bg-slate-50 py-1.5 font-medium">V/cm³</th>
            <th class="sticky top-0 z-10 w-[24%] bg-slate-50 py-1.5 font-medium">m/g</th>
            <th class="sticky top-0 z-10 bg-red-100 py-1.5 font-bold text-red-700" :class="large ? '' : 'text-xs'">m/V</th>
            <th class="sticky top-0 z-10 w-14 rounded-r-md bg-slate-50 py-1.5 font-medium" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in group.rows" :key="index" :class="row.v === 0 && row.m === 0 ? 'text-slate-400' : ''">
            <td class="py-1">{{ index }}</td>
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
            <td class="bg-red-50 px-1 font-extrabold text-red-700" :class="large ? 'text-xl' : 'text-base'">
              {{ ratioText(row) || '—' }}
            </td>
            <td class="py-1">
              <button
                type="button"
                class="touch-manipulation inline-flex items-center justify-center rounded-lg text-slate-400 transition active:bg-red-50 active:text-red-600 disabled:opacity-30"
                :class="large ? 'size-11 text-lg' : 'size-8 text-sm'"
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
        class="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 py-1.5 text-sm text-slate-500 transition active:bg-slate-50"
        @click.stop="emit('add')"
      >
        <Plus class="size-4" />
        添加一行
      </button>
    </div>

    <div
      v-if="pendingRemove != null"
      class="mx-3 mb-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
      @click.stop
    >
      <span>删除第 {{ pendingRemove }} 行已填写的数据？</span>
      <span class="flex gap-2">
        <button type="button" class="rounded-md px-2 py-1" @click="pendingRemove = null">取消</button>
        <button type="button" class="rounded-md bg-red-600 px-2 py-1 font-semibold text-white" @click="confirmRemove">
          删除
        </button>
      </span>
    </div>
  </article>
</template>

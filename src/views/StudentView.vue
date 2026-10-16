<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft, Cloud, Plus, Tablet } from '@lucide/vue'
import GroupTable from '../components/GroupTable.vue'
import { useRoom } from '../composables/useRoom'
import { colorFor, validCount } from '../lib/lab'
import type { CellField } from '../types'

const STORAGE_KEY = 'physics-lab-group'

const { room, connected, saving, notice, flashes, joined, patchCell, addRow, removeRow, claimSeat } = useRoom()
const selectedId = ref(localStorage.getItem(STORAGE_KEY) ?? '')

const groups = computed(() => room.value?.groups ?? [])
const selected = computed(() => groups.value.find((group) => group.id === selectedId.value) ?? null)
const selectedIndex = computed(() => groups.value.findIndex((group) => group.id === selectedId.value))

watch(
  selectedId,
  (id) => {
    localStorage.setItem(STORAGE_KEY, id)
    claimSeat(id || null)
  },
  { immediate: true },
)

onUnmounted(() => {
  claimSeat(null)
})

watch(groups, (list) => {
  if (selectedId.value && !list.some((group) => group.id === selectedId.value)) selectedId.value = ''
})

/**
 * 进入某一组的记录表。
 * @param id - 组 id
 */
const choose = (id: string): void => {
  selectedId.value = id
}

/**
 * 回到选组。
 */
const back = (): void => {
  selectedId.value = ''
}

/**
 * 把当前组的一格交给服务。
 * @param row - 行下标
 * @param field - 体积或质量
 * @param value - 新值
 */
const commitCell = (row: number, field: CellField, value: number | null): void => {
  const group = selected.value
  if (!group) return
  patchCell(group.id, row, field, value)
}

/**
 * 删除当前组的一行。
 * @param row - 行下标
 */
const dropRow = (row: number): void => {
  const group = selected.value
  if (!group) return
  removeRow(group.id, row)
}

/**
 * 给当前组加一行。
 */
const appendRow = (): void => {
  const group = selected.value
  if (!group) return
  addRow(group.id)
}
</script>

<template>
  <div class="flex h-dvh flex-col bg-[#eef2f8] text-slate-800">
    <header
      class="flex items-center gap-3 bg-gradient-to-r from-blue-950 via-blue-600 to-blue-500 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white"
    >
      <button
        v-if="selected"
        type="button"
        class="touch-manipulation inline-flex items-center gap-1 rounded-xl bg-white/15 px-4 py-2 text-base active:bg-white/25"
        @click="back"
      >
        <ChevronLeft class="size-5" />
        选组
      </button>
      <h1 class="min-w-0 flex-1 truncate text-center text-xl font-semibold">
        {{ selected ? selected.name : '选择本组' }}
      </h1>
      <span class="inline-flex shrink-0 items-center gap-1 text-sm text-blue-100">
        <Cloud class="size-4" />
        {{ saving ? '正在发送' : connected ? '已同步' : '正在连接' }}
      </span>
    </header>

    <p v-if="notice" class="bg-amber-50 px-5 py-2 text-base text-amber-900">{{ notice }}</p>

    <main class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      <div v-if="!room" class="grid h-full place-items-center text-lg text-slate-500">正在连接实验服务…</div>

      <div v-else-if="!selected" class="mx-auto grid max-w-5xl grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        <button
          v-for="(group, index) in groups"
          :key="group.id"
          type="button"
          class="touch-manipulation flex min-h-36 flex-col items-start justify-between rounded-3xl bg-white p-5 text-left shadow-sm transition active:scale-[0.98]"
          @click="choose(group.id)"
        >
          <span class="size-4 rounded-full" :style="{ background: colorFor(index) }" />
          <span class="text-2xl font-semibold text-slate-800">{{ group.name }}</span>
          <span class="flex w-full items-center justify-between text-base text-slate-500">
            <span>已填 {{ validCount(group) }} 个点</span>
            <span v-if="joined[group.id]" class="inline-flex items-center gap-1 text-emerald-700">
              <Tablet class="size-4" />
              {{ joined[group.id] }} 人
            </span>
          </span>
        </button>
      </div>

      <div v-else class="mx-auto w-full max-w-[960px]">
        <GroupTable
          :group="selected"
          :color="colorFor(Math.max(selectedIndex, 0))"
          large
          active
          :flashes="flashes"
          @patch="commitCell"
          @remove="dropRow"
          @add="appendRow"
        />
      </div>
    </main>

    <footer
      v-if="selected"
      class="border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
    >
      <button
        type="button"
        class="touch-manipulation mx-auto flex h-14 w-full max-w-[960px] items-center justify-center gap-2 rounded-2xl bg-blue-600 text-lg font-semibold text-white active:bg-blue-700"
        @click="appendRow"
      >
        <Plus class="size-5" />
        添加一行
      </button>
    </footer>
  </div>
</template>

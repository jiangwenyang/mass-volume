<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { ChevronLeft, Cloud, Plus, Tablet } from '@lucide/vue'
import GroupTable from '../components/GroupTable.vue'
import { useRoom } from '../composables/useRoom'
import { colorFor, tint, validCount } from '../lib/lab'
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
  <div class="flex h-dvh flex-col bg-paper text-ink">
    <header
      class="grid shrink-0 grid-cols-[7.5rem_minmax(0,1fr)_7.5rem] items-center gap-3 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2"
    >
      <div>
        <button
          v-if="selected"
          type="button"
          class="touch-manipulation inline-flex h-11 items-center gap-0.5 rounded-xl bg-sheet pr-4 pl-2 text-base font-medium text-primary shadow-card transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft active:bg-primary-soft"
          @click="back"
        >
          <ChevronLeft class="size-5" />
          选组
        </button>
      </div>
      <h1 class="truncate text-center text-xl font-bold text-ink">
        {{ selected ? selected.name : '选择本组' }}
      </h1>
      <span class="flex justify-end">
        <span
          class="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-medium"
          :class="connected && !saving ? 'bg-live-soft text-live' : 'bg-soft text-muted'"
        >
          <Cloud class="size-4" />
          {{ saving ? '正在发送' : connected ? '已同步' : '正在连接' }}
        </span>
      </span>
    </header>

    <p v-if="notice" class="mx-5 rounded-xl bg-notice px-4 py-2 text-base text-notice-ink">{{ notice }}</p>

    <main class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      <div v-if="!room" class="grid h-full place-items-center text-lg text-muted">正在连接实验服务…</div>

      <div v-else-if="!selected" class="mx-auto grid max-w-5xl grid-cols-2 gap-4 lg:grid-cols-3">
        <button
          v-for="(group, index) in groups"
          :key="group.id"
          type="button"
          class="touch-manipulation flex min-h-40 flex-col justify-between rounded-2xl bg-sheet p-5 text-left shadow-card transition-[background-color,transform] duration-150 hover:bg-(--tile) focus-visible:bg-(--tile) active:scale-[0.98] active:bg-(--tile) motion-reduce:active:scale-100"
          :style="{ '--tile': tint(colorFor(index), 0.1) }"
          @click="choose(group.id)"
        >
          <span class="flex items-center gap-3">
            <span class="grid size-11 shrink-0 place-items-center rounded-full" :style="{ background: tint(colorFor(index), 0.18) }">
              <i class="size-4 rounded-full" :style="{ background: colorFor(index) }" />
            </span>
            <span class="min-w-0 truncate text-[1.7rem] leading-none font-bold text-ink">{{ group.name }}</span>
          </span>
          <span class="flex w-full items-center justify-between text-base text-muted">
            <span>已填 <b class="font-bold tabular-nums text-ink">{{ validCount(group) }}</b> 个点</span>
            <span v-if="joined[group.id]" class="inline-flex h-8 items-center gap-1.5 rounded-full bg-live-soft px-3 text-sm font-semibold text-live">
              <Tablet class="size-4" />
              <span class="tabular-nums">{{ joined[group.id] }} 人</span>
            </span>
          </span>
        </button>
      </div>

      <div v-else class="mx-auto w-full max-w-[960px]">
        <GroupTable
          :group="selected"
          :color="colorFor(Math.max(selectedIndex, 0))"
          large
          :flashes="flashes"
          @patch="commitCell"
          @remove="dropRow"
          @add="appendRow"
        />
      </div>
    </main>

    <footer v-if="selected" class="px-5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        class="touch-manipulation mx-auto flex h-14 w-full max-w-[960px] items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-semibold text-white shadow-[0_10px_24px_rgb(47_107_255/0.3)] transition-colors hover:bg-primary-strong focus-visible:bg-primary-strong active:bg-primary-strong"
        @click="appendRow"
      >
        <Plus class="size-5" />
        添加一行
      </button>
    </footer>
  </div>
</template>

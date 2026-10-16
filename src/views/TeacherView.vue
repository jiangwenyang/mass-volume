<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { QrCode, Wifi } from '@lucide/vue'
import QRCode from 'qrcode'
import ChartStage from '../components/ChartStage.vue'
import GroupSettingsDialog from '../components/GroupSettingsDialog.vue'
import GroupTable from '../components/GroupTable.vue'
import JoinedRail from '../components/JoinedRail.vue'
import TeacherToolbar from '../components/TeacherToolbar.vue'
import { joinUrl, useRoom } from '../composables/useRoom'
import { usePlot } from '../composables/usePlot'
import { colorFor, pointsOf, rowFilled } from '../lib/lab'
import type { Group } from '../types'

type Mode = 'table' | 'single' | 'all' | 'summary'
type ConfirmKind = 'reset' | 'sample' | null

const {
  room,
  info,
  clients,
  joined,
  connected,
  notice,
  flashes,
  statusText,
  patchCell,
  addRow,
  removeRow,
  setGroups,
  resetData,
  loadSample,
} = useRoom()
const { progress, motion, startPlot, genLine, stop } = usePlot()

const mode = ref<Mode>('table')
const activeId = ref('')
const settingsOpen = ref(false)
const qrOpen = ref(false)
const qrImage = ref('')
const confirmKind = ref<ConfirmKind>(null)
const hint = ref('')

const groups = computed(() => room.value?.groups ?? [])
const active = computed(() => groups.value.find((group) => group.id === activeId.value) ?? groups.value[0])
const primaryIp = computed(() => info.value.ips[0] ?? '')
const url = computed(() => (primaryIp.value ? joinUrl(primaryIp.value) : ''))
const joinedTotal = computed(() => Object.values(joined.value).filter((count) => count > 0).length)
const hasAnyData = computed(() => groups.value.some((group) => group.rows.some(rowFilled)))

watch(
  groups,
  (list) => {
    if (!list.some((group) => group.id === activeId.value)) activeId.value = list[0]?.id ?? ''
  },
  { immediate: true },
)

watch(
  url,
  async (value) => {
    qrImage.value = value
      ? await QRCode.toDataURL(value, { margin: 1, width: 480, color: { dark: '#1e3a8a', light: '#ffffff' } })
      : ''
  },
  { immediate: true },
)

/**
 * 选中一组并打开它的图像区。
 * @param group - 被点中的组
 */
const selectGroup = (group: Group): void => {
  activeId.value = group.id
  mode.value = 'single'
  hint.value = ''
}

/**
 * 没有有效点时给出说明，否则开始逐点描点。
 * @param group - 要描的组
 */
const plotGroup = async (group: Group): Promise<void> => {
  activeId.value = group.id
  mode.value = 'single'
  hint.value = pointsOf(group).length ? '' : `${group.name}还没有有效数据（体积和质量都要大于 0）`
  await startPlot(group)
}

/**
 * 补点并生成拟合直线。
 * @param group - 要出图的组
 */
const lineGroup = async (group: Group): Promise<void> => {
  activeId.value = group.id
  mode.value = 'single'
  hint.value = pointsOf(group).length ? '' : `${group.name}还没有有效数据（体积和质量都要大于 0）`
  await genLine(group)
}

/**
 * 回到数据表。
 */
const showTable = (): void => {
  stop()
  mode.value = 'table'
}

/**
 * 并排看每一组的图像。
 */
const showAll = (): void => {
  stop()
  mode.value = 'all'
}

/**
 * 把所有组叠在同一张图上。
 */
const showSummary = (): void => {
  stop()
  mode.value = 'summary'
}

/**
 * 有数据时先确认，再清空或载入示例。
 * @param kind - 要确认的动作
 */
const ask = (kind: Exclude<ConfirmKind, null>): void => {
  if (!hasAnyData.value) {
    if (kind === 'reset') resetData()
    else loadSample()
    return
  }
  confirmKind.value = kind
}

/**
 * 执行刚才确认的清空或示例。
 */
const runConfirmed = (): void => {
  if (confirmKind.value === 'reset') resetData()
  if (confirmKind.value === 'sample') loadSample()
  confirmKind.value = null
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex items-center gap-4 bg-gradient-to-r from-blue-950 via-blue-600 to-blue-500 px-4 py-2.5 text-white shadow-md">
      <div>
        <h1 class="text-lg font-semibold tracking-wide">探究物质的质量与体积的关系</h1>
        <p class="text-xs text-blue-100">m–V 图像 · 分组实验</p>
      </div>
      <div class="ml-auto flex items-center gap-3">
        <button type="button" class="flex items-center gap-3 rounded-xl bg-white/15 px-2 py-1 text-left" @click="qrOpen = true">
          <img v-if="qrImage" :src="qrImage" alt="学生页二维码" class="size-14 rounded-md bg-white p-1" />
          <span v-else class="grid size-14 place-items-center rounded-md bg-white text-blue-800">
            <QrCode class="size-7" />
          </span>
          <span class="max-w-72">
            <span class="block text-xs text-blue-100">平板扫码填写</span>
            <span class="block truncate text-sm font-medium">{{ url || '正在获取局域网地址' }}</span>
          </span>
        </button>
        <span class="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs">
          <Wifi class="size-3.5" :class="connected ? 'text-emerald-300' : 'text-amber-200'" />
          {{ statusText }} · 已加入 {{ joinedTotal }} 组
          <span class="text-blue-100">{{ clients }} 台</span>
        </span>
      </div>
    </header>

    <TeacherToolbar
      :hint="hint"
      @table="showTable"
      @plot="active && plotGroup(active)"
      @line="active && lineGroup(active)"
      @all="showAll"
      @summary="showSummary"
      @settings="settingsOpen = true"
      @sample="ask('sample')"
      @reset="ask('reset')"
    />

    <JoinedRail v-if="room" :groups="groups" :joined="joined" @select="selectGroup" />

    <p v-if="notice" class="bg-amber-50 px-4 py-2 text-sm text-amber-900">{{ notice }}</p>

    <div v-if="!room" class="grid flex-1 place-items-center text-slate-500">正在连接实验服务…</div>
    <div v-else class="flex min-h-0 flex-1">
      <aside
        v-show="mode === 'table' || mode === 'single'"
        class="min-h-0 overflow-y-auto p-3 transition-all duration-300"
        :class="mode === 'table' ? 'w-full' : 'w-[34%] min-w-[280px] max-w-[420px]'"
      >
        <div :class="mode === 'table' ? 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3' : 'grid gap-2'">
          <GroupTable
            v-for="(group, index) in groups"
            :key="group.id"
            :group="group"
            :color="colorFor(index)"
            :active="group.id === activeId"
            show-plot
            :flashes="flashes"
            :joined="joined[group.id] ?? 0"
            @select="selectGroup(group)"
            @plot="plotGroup(group)"
            @line="lineGroup(group)"
            @add="addRow(group.id)"
            @remove="removeRow(group.id, $event)"
            @patch="(row, field, value) => patchCell(group.id, row, field, value)"
          />
        </div>
      </aside>
      <section v-show="mode !== 'table'" class="flex min-h-0 min-w-0 flex-1 flex-col p-3">
        <ChartStage
          class="min-h-0 flex-1"
          :groups="groups"
          :mode="mode === 'table' ? 'single' : mode"
          :active-id="activeId"
          :progress="progress"
          :motion="motion"
        />
      </section>
    </div>

    <GroupSettingsDialog v-model:open="settingsOpen" :groups="groups" @save="(count, names, force) => setGroups(count, names, force)" />

    <div v-if="qrOpen" class="fixed inset-0 z-30 grid place-items-center bg-slate-900/50 p-8" @click="qrOpen = false">
      <div class="rounded-3xl bg-white px-10 py-8 text-center shadow-2xl" @click.stop>
        <p class="text-sm text-slate-500">请各组用平板扫描</p>
        <img v-if="qrImage" :src="qrImage" alt="放大的学生页二维码" class="mx-auto mt-4 size-72" />
        <p class="mt-4 text-xl font-semibold text-blue-950">{{ url }}</p>
        <p v-if="info.ips.length > 1" class="mt-2 text-sm text-slate-500">其他地址：{{ info.ips.slice(1).join('、') }}</p>
        <button type="button" class="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" @click="qrOpen = false">
          收起
        </button>
      </div>
    </div>

    <div v-if="confirmKind" class="fixed inset-0 z-30 grid place-items-center bg-slate-900/40 p-6">
      <div class="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 class="text-lg font-semibold">{{ confirmKind === 'reset' ? '清空全部数据？' : '载入示例数据？' }}</h2>
        <p class="mt-2 text-sm text-slate-600">
          {{ confirmKind === 'reset' ? '各组已经填写的体积和质量会被清掉，分组和行数还在。' : '会换成原型里的 9 组数据，当前填写会被覆盖。' }}
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button type="button" class="rounded-lg px-4 py-2 text-sm" @click="confirmKind = null">取消</button>
          <button type="button" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white" @click="runConfirmed">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

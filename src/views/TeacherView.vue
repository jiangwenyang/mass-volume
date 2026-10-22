<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import { Power, QrCode, ScatterChart, Wifi } from '@lucide/vue'
import QRCode from 'qrcode'
import ChartStage from '../components/ChartStage.vue'
import GroupSettingsDialog from '../components/GroupSettingsDialog.vue'
import GroupTable from '../components/GroupTable.vue'
import JoinedRail from '../components/JoinedRail.vue'
import QtyText from '../components/QtyText.vue'
import TeacherToolbar from '../components/TeacherToolbar.vue'
import { joinUrl, pageHost, useRoom } from '../composables/useRoom'
import { usePlot } from '../composables/usePlot'
import { useTableFit } from '../composables/useTableFit'
import { colorFor, groupHasData, pointsOf } from '../lib/lab'
import type { Group } from '../types'

type Mode = 'table' | 'single' | 'all' | 'summary'
type ConfirmKind = 'reset' | 'sample' | null

/** 记住老师选中的二维码地址 */
const QR_HOST_KEY = 'mass-volume:qr-host'

/**
 * 读出上次选中的二维码地址。
 * @returns 地址；没有记录或读不到存储时为空串
 */
const readChosenHost = (): string => {
  try {
    return localStorage.getItem(QR_HOST_KEY) ?? ''
  } catch {
    return ''
  }
}

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
const boardRef = useTemplateRef<HTMLElement>('board')
const activeId = ref('')
const settingsOpen = ref(false)
const qrOpen = ref(false)
const qrImage = ref('')
const confirmKind = ref<ConfirmKind>(null)
const hint = ref('')

/**
 * 只有 Windows 上的桌面窗口需要退出按钮。平板浏览器没有这个对象，也不该被关掉。
 * @returns 当前页面跑在 Windows 的 Tauri 窗口里时为 true
 */
const windowsDesktop = (): boolean =>
  '__TAURI_INTERNALS__' in window && /Windows/i.test(navigator.userAgent)

const showQuit = windowsDesktop()

/**
 * 关掉教师窗口。窗口关闭后进程退出。
 */
const quitApp = async (): Promise<void> => {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  } catch {
    hint.value = '没能关闭，请再点一次退出'
  }
}

const groups = computed(() => room.value?.groups ?? [])
const tableMode = computed(() => mode.value === 'table')
const { columns: tableColumns, cellPx } = useTableFit(boardRef, groups, tableMode)
const tableGridStyle = computed(() => {
  if (!tableMode.value) return undefined
  const cols = tableColumns.value
  const rows = Math.ceil(groups.value.length / cols) || 1
  return {
    '--cell': `${cellPx.value}px`,
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
  }
})
const active = computed(() => groups.value.find((group) => group.id === activeId.value) ?? groups.value[0])
const activeColor = computed(() => colorFor(Math.max(groups.value.findIndex((group) => group.id === active.value?.id), 0)))
const hosts = computed(() => {
  if (info.value.ips.length) return info.value.ips
  const host = pageHost()
  return host ? [host] : []
})
const chosenIp = ref(readChosenHost())
const primaryIp = computed(() => (hosts.value.includes(chosenIp.value) ? chosenIp.value : (hosts.value[0] ?? '')))
const url = computed(() => (primaryIp.value ? joinUrl(primaryIp.value) : ''))
const joinedTotal = computed(() => Object.values(joined.value).filter((count) => count > 0).length)
const hasAnyData = computed(() => groups.value.some(groupHasData))

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
      ? await QRCode.toDataURL(value, { margin: 1, width: 480, color: { dark: '#16213e', light: '#ffffff' } })
      : ''
  },
  { immediate: true },
)

/**
 * 换一个地址生成二维码，并记住这次选择。
 * @param ip - 服务报出的地址之一
 */
const chooseHost = (ip: string): void => {
  chosenIp.value = ip
  try {
    localStorage.setItem(QR_HOST_KEY, ip)
  } catch {
    /* 存不下时只在本次生效 */
  }
}

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
 * 补点并生成从原点出发的连线。
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
 * 只看当前组的图像，保留已描的点。
 */
const showSingle = (): void => {
  mode.value = 'single'
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
  <div class="flex h-full min-h-0 flex-col overflow-hidden bg-paper text-ink">
    <header class="flex shrink-0 items-center gap-6 px-5 pt-4 pb-2">
      <div class="flex min-w-0 items-center gap-3.5">
        <span
          class="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary text-white shadow-[0_8px_20px_rgb(47_107_255/0.3)]"
          aria-hidden="true"
        >
          <ScatterChart class="size-6" />
        </span>
        <div class="min-w-0">
          <h1 class="truncate text-[1.6rem] leading-tight font-bold text-ink">探究物质的质量与体积的关系</h1>
          <p class="mt-0.5 text-sm text-muted"><QtyText text="*m*–*V* 图像 · 分组实验" /></p>
        </div>
      </div>
      <div class="ml-auto flex shrink-0 items-center gap-3">
        <div class="flex flex-col items-end gap-1.5 text-sm">
          <span
            class="inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium"
            :class="connected ? 'bg-live-soft text-live' : 'bg-result-soft text-result'"
          >
            <Wifi class="size-3.5" />
            {{ statusText }}
          </span>
          <span class="pr-1 text-muted">已加入 <b class="font-semibold text-ink">{{ joinedTotal }}</b> 组 · {{ clients }} 台平板</span>
        </div>
        <button
          type="button"
          class="flex items-center gap-3 rounded-2xl bg-sheet py-1.5 pr-4 pl-1.5 text-left shadow-card transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft"
          @click="qrOpen = true"
        >
          <img v-if="qrImage" :src="qrImage" alt="学生页二维码" class="size-14 rounded-xl" />
          <span v-else class="grid size-14 place-items-center rounded-xl bg-soft text-primary">
            <QrCode class="size-7" />
          </span>
          <span class="max-w-60">
            <span class="block text-xs font-medium text-primary">平板扫码填写</span>
            <span class="block truncate text-sm font-semibold text-ink">{{ url || '正在获取局域网地址' }}</span>
          </span>
        </button>
        <button
          v-if="showQuit"
          type="button"
          class="inline-flex h-11 items-center gap-1.5 rounded-xl bg-sheet px-4 text-sm font-semibold whitespace-nowrap text-ink shadow-card transition-colors hover:bg-result-soft hover:text-result focus-visible:bg-result-soft focus-visible:text-result"
          @click="quitApp"
        >
          <Power class="size-4" />
          退出
        </button>
      </div>
    </header>

    <TeacherToolbar
      :hint="hint"
      :mode="mode"
      :active-name="active?.name"
      :active-color="activeColor"
      @table="showTable"
      @single="showSingle"
      @plot="active && plotGroup(active)"
      @line="active && lineGroup(active)"
      @all="showAll"
      @summary="showSummary"
      @settings="settingsOpen = true"
      @sample="ask('sample')"
      @reset="ask('reset')"
    />

    <JoinedRail v-if="room" :groups="groups" :joined="joined" @select="selectGroup" />

    <p v-if="notice" class="mx-5 mt-1 rounded-xl bg-notice px-4 py-2 text-sm text-notice-ink">{{ notice }}</p>

    <div v-if="!room" class="grid flex-1 place-items-center text-base text-muted">正在连接实验服务…</div>
    <div v-else class="flex min-h-0 flex-1">
      <aside
        v-show="mode === 'table' || mode === 'single'"
        class="min-h-0 px-5 motion-safe:transition-[width] motion-safe:duration-200"
        :class="
          mode === 'table'
            ? 'flex w-full flex-col overflow-hidden pt-1 pb-3'
            : 'w-[34%] min-w-[300px] max-w-[440px] overflow-y-auto pt-2 pr-3 pb-5'
        "
      >
        <div
          ref="board"
          class="grid"
          :class="mode === 'table' ? 'h-full min-h-0 flex-1 gap-x-3 gap-y-2 overflow-hidden' : 'gap-3'"
          :style="tableGridStyle"
        >
          <GroupTable
            v-for="(group, index) in groups"
            :key="group.id"
            :class="mode === 'table' ? 'h-full min-h-0' : undefined"
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
      <section
        v-show="mode !== 'table'"
        class="flex min-h-0 min-w-0 flex-1 flex-col"
        :class="mode === 'single' ? 'pt-2 pr-5 pb-5 pl-2' : 'px-5 pt-2 pb-5'"
      >
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

    <div v-if="qrOpen" class="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-8 backdrop-blur-sm" @click="qrOpen = false">
      <div class="rounded-3xl bg-sheet px-10 py-8 text-center shadow-pop" @click.stop>
        <p class="text-sm font-medium text-primary">请各组用平板扫描</p>
        <img v-if="qrImage" :src="qrImage" alt="放大的学生页二维码" class="mx-auto mt-4 size-72 rounded-2xl bg-soft p-3" />
        <p class="mt-4 text-lg font-bold text-ink">{{ url }}</p>
        <div v-if="hosts.length > 1" class="mt-4">
          <div class="flex max-w-md flex-wrap justify-center gap-2" role="group" aria-label="二维码地址">
            <button
              v-for="ip in hosts"
              :key="ip"
              type="button"
              class="inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors"
              :class="ip === primaryIp ? 'bg-primary text-white' : 'bg-soft text-ink hover:bg-primary-soft focus-visible:bg-primary-soft'"
              :aria-pressed="ip === primaryIp"
              @click="chooseHost(ip)"
            >
              {{ ip }}
            </button>
          </div>
          <p class="mt-2 text-sm text-muted">扫不开时换一个地址试试，平板要和电脑连同一个网络</p>
        </div>
        <button
          type="button"
          class="mt-5 h-11 rounded-xl bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-primary-strong focus-visible:bg-primary-strong"
          @click="qrOpen = false"
        >
          收起
        </button>
      </div>
    </div>

    <div v-if="confirmKind" class="fixed inset-0 z-30 grid place-items-center bg-ink/40 p-6 backdrop-blur-sm">
      <div class="w-full max-w-md rounded-3xl bg-sheet p-6 shadow-pop">
        <h2 class="text-lg font-bold text-ink">{{ confirmKind === 'reset' ? '清空全部数据？' : '载入示例数据？' }}</h2>
        <p class="mt-2 text-sm leading-relaxed text-muted">
          {{ confirmKind === 'reset' ? '各组已经填写的体积和质量会被清掉，分组、行数和原点还在。' : '会换成参考表格里铜、铝、木各 3 组的数据，当前填写会被覆盖。' }}
        </p>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="h-11 rounded-xl px-4 text-sm font-medium text-muted transition-colors hover:bg-soft focus-visible:bg-soft" @click="confirmKind = null">
            取消
          </button>
          <button
            type="button"
            class="h-11 rounded-xl px-5 text-sm font-semibold text-white transition-colors"
            :class="confirmKind === 'reset' ? 'bg-result hover:bg-result/90 focus-visible:bg-result/80' : 'bg-primary hover:bg-primary-strong focus-visible:bg-primary-strong'"
            @click="runConfirmed"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

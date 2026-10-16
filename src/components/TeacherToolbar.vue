<script setup lang="ts">
import type { Component } from 'vue'
import {
  Crosshair,
  Eraser,
  FlaskConical,
  Layers,
  LayoutGrid,
  LineChart,
  ScatterChart,
  Settings,
  Table2,
} from '@lucide/vue'

type Mode = 'table' | 'single' | 'all' | 'summary'

defineProps<{
  hint: string
  mode: Mode
  /** 描点和出图针对的组名 */
  activeName?: string
  /** 当前组的颜色 */
  activeColor?: string
}>()

const emit = defineEmits<{
  table: []
  single: []
  plot: []
  line: []
  all: []
  summary: []
  settings: []
  sample: []
  reset: []
}>()

const views: { mode: Mode; label: string; icon: Component }[] = [
  { mode: 'table', label: '数据表', icon: Table2 },
  { mode: 'single', label: '单组图像', icon: ScatterChart },
  { mode: 'all', label: '所有组', icon: LayoutGrid },
  { mode: 'summary', label: '汇总', icon: Layers },
]

/**
 * 切到对应视图。
 * @param mode - 目标视图
 */
const switchTo = (mode: Mode): void => {
  if (mode === 'table') emit('table')
  else if (mode === 'single') emit('single')
  else if (mode === 'all') emit('all')
  else emit('summary')
}
</script>

<template>
  <div class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2">
    <nav class="inline-flex rounded-xl bg-soft p-1" aria-label="视图">
      <button
        v-for="view in views"
        :key="view.mode"
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-colors"
        :class="
          mode === view.mode
            ? 'bg-sheet text-primary shadow-card'
            : 'text-muted hover:text-ink focus-visible:bg-deep focus-visible:text-ink'
        "
        :aria-pressed="mode === view.mode"
        @click="switchTo(view.mode)"
      >
        <component :is="view.icon" class="size-4" />
        {{ view.label }}
      </button>
    </nav>

    <div class="flex items-center gap-2">
      <span v-if="activeName" class="inline-flex items-center gap-1.5 pr-1 text-sm text-muted">
        <i class="size-2 rounded-full" :style="{ background: activeColor }" />
        <span class="font-medium text-ink">{{ activeName }}</span>
      </span>
      <button
        type="button"
        class="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary-soft px-4 text-sm font-semibold whitespace-nowrap text-primary transition-colors hover:bg-deep focus-visible:bg-deep"
        @click="emit('plot')"
      >
        <Crosshair class="size-4" />
        描点
      </button>
      <button
        type="button"
        class="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold whitespace-nowrap text-white shadow-[0_6px_16px_rgb(47_107_255/0.28)] transition-colors hover:bg-primary-strong focus-visible:bg-primary-strong"
        @click="emit('line')"
      >
        <LineChart class="size-4" />
        生成图像
      </button>
    </div>

    <span v-if="hint" class="min-w-0 rounded-lg bg-notice px-3 py-1.5 text-sm text-notice-ink">{{ hint }}</span>

    <div class="ml-auto flex items-center gap-1">
      <button
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm whitespace-nowrap text-muted transition-colors hover:bg-sheet hover:text-ink focus-visible:bg-sheet focus-visible:text-ink"
        @click="emit('settings')"
      >
        <Settings class="size-4" />
        分组
      </button>
      <button
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm whitespace-nowrap text-muted transition-colors hover:bg-sheet hover:text-ink focus-visible:bg-sheet focus-visible:text-ink"
        @click="emit('sample')"
      >
        <FlaskConical class="size-4" />
        示例
      </button>
      <button
        type="button"
        class="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm whitespace-nowrap text-muted transition-colors hover:bg-result-soft hover:text-result focus-visible:bg-result-soft focus-visible:text-result"
        @click="emit('reset')"
      >
        <Eraser class="size-4" />
        清空
      </button>
    </div>
  </div>
</template>

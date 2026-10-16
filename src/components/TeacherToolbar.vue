<script setup lang="ts">
import {
  Crosshair,
  Eraser,
  FlaskConical,
  Layers,
  LayoutGrid,
  LineChart,
  Settings,
  Table2,
} from '@lucide/vue'

defineProps<{
  hint: string
}>()

const emit = defineEmits<{
  table: []
  plot: []
  line: []
  all: []
  summary: []
  settings: []
  sample: []
  reset: []
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
    <button type="button" class="tool tool-primary" @click="emit('table')">
      <Table2 class="size-4" />
      返回数据表
    </button>
    <button type="button" class="tool" @click="emit('plot')">
      <Crosshair class="size-4" />
      描点
    </button>
    <button type="button" class="tool" @click="emit('line')">
      <LineChart class="size-4" />
      生成该组图像
    </button>
    <button type="button" class="tool" @click="emit('all')">
      <LayoutGrid class="size-4" />
      所有组
    </button>
    <button type="button" class="tool" @click="emit('summary')">
      <Layers class="size-4" />
      汇总
    </button>
    <span class="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
    <button type="button" class="tool" @click="emit('settings')">
      <Settings class="size-4" />
      分组
    </button>
    <button type="button" class="tool" @click="emit('sample')">
      <FlaskConical class="size-4" />
      示例
    </button>
    <button type="button" class="tool" @click="emit('reset')">
      <Eraser class="size-4" />
      清空
    </button>
    <span v-if="hint" class="ml-auto text-xs text-slate-500">{{ hint }}</span>
  </div>
</template>

<style scoped>
.tool {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 0.6rem;
  border: 1px solid #cbd5e1;
  background: white;
  padding: 0.45rem 0.7rem;
  font-size: 0.875rem;
  color: #334155;
  white-space: nowrap;
}

.tool:active {
  transform: translateY(1px);
}

.tool-primary {
  border-color: #2563eb;
  background: #2563eb;
  color: white;
  font-weight: 600;
}
</style>

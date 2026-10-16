<script setup lang="ts">
import { computed } from 'vue'
import { Tablet, Users } from '@lucide/vue'
import { colorFor } from '../lib/lab'
import type { Group } from '../types'

const props = defineProps<{
  groups: Group[]
  joined: Record<string, number>
}>()

const emit = defineEmits<{
  select: [group: Group]
}>()

const online = computed(() =>
  props.groups.flatMap((group, index) => {
    const count = props.joined[group.id] ?? 0
    if (count <= 0) return []
    return [{ group, count, color: colorFor(index) }]
  }),
)
</script>

<template>
  <section class="flex items-center gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-2">
    <span class="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-700">
      <Users class="size-4 text-blue-700" />
      已加入 {{ online.length }} 组
    </span>
    <div v-if="online.length" class="flex min-w-0 flex-1 gap-2 overflow-x-auto">
      <button
        v-for="item in online"
        :key="item.group.id"
        type="button"
        class="join-chip"
        :style="{ borderColor: item.color, color: item.color }"
        @click="emit('select', item.group)"
      >
        <span class="relative flex size-2">
          <span class="absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping" :style="{ background: item.color }" />
          <span class="relative size-2 rounded-full" :style="{ background: item.color }" />
        </span>
        {{ item.group.name }}
        <span class="inline-flex items-center gap-0.5 text-xs opacity-80">
          <Tablet class="size-3.5" />
          {{ item.count }}
        </span>
      </button>
    </div>
    <p v-else class="truncate text-sm text-slate-400">各组扫码后选择本组，名字会在这里亮起</p>
  </section>
</template>

<style scoped>
.join-chip {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.4rem;
  border-radius: 999px;
  border: 1.5px solid;
  background: white;
  padding: 0.3rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  animation: join-in 0.35s ease;
}

@keyframes join-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>

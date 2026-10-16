<script setup lang="ts">
import { computed } from 'vue'
import { Tablet } from '@lucide/vue'
import { colorFor, tint } from '../lib/lab'
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
  <section class="flex min-h-11 shrink-0 items-center gap-3 px-5">
    <span class="inline-flex shrink-0 items-center gap-2 text-sm">
      <span class="relative flex size-2">
        <span v-if="online.length" class="absolute inset-0 rounded-full bg-live opacity-60 motion-safe:animate-ping" />
        <span class="relative size-2 rounded-full" :class="online.length ? 'bg-live' : 'bg-muted/40'" />
      </span>
      <span class="font-medium text-ink">已加入</span>
      <span class="tabular-nums text-muted">{{ online.length }} / {{ groups.length }}</span>
    </span>
    <div v-if="online.length" class="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1.5">
      <button
        v-for="item in online"
        :key="item.group.id"
        type="button"
        class="motion-safe:animate-join inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-sm font-semibold text-ink transition-[filter] hover:brightness-95 focus-visible:brightness-90"
        :style="{ background: tint(item.color, 0.16) }"
        @click="emit('select', item.group)"
      >
        <i class="size-2 rounded-full" :style="{ background: item.color }" />
        {{ item.group.name }}
        <span class="inline-flex items-center gap-0.5 text-xs font-medium text-muted">
          <Tablet class="size-3.5" />
          <span class="tabular-nums">{{ item.count }}</span>
        </span>
      </button>
    </div>
    <p v-else class="truncate text-sm text-muted">扫码后在平板上选择本组</p>
  </section>
</template>

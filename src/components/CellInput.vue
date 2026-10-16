<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'
import { ref } from 'vue'
import { displayCell, parseCell } from '../lib/lab'

const props = defineProps<{
  value: number | null
  label: string
  large?: boolean
  flash?: boolean
}>()

const emit = defineEmits<{
  commit: [value: number | null]
}>()

const draft = ref(displayCell(props.value))
const inputRef = useTemplateRef<HTMLInputElement>('input')

watch(
  () => props.value,
  (value) => {
    if (document.activeElement === inputRef.value) return
    draft.value = displayCell(value)
  },
)

/**
 * 输入过程中能解析才提交，小数点打到一半先留在框里。
 * @param event - 输入事件
 */
const onInput = (event: Event): void => {
  const raw = (event.target as HTMLInputElement).value
  draft.value = raw
  const parsed = parseCell(raw)
  if (parsed === 'invalid') return
  emit('commit', parsed)
}
</script>

<template>
  <input
    ref="input"
    :value="draft"
    :aria-label="label"
    inputmode="decimal"
    autocomplete="off"
    autocapitalize="off"
    spellcheck="false"
    class="w-full rounded-lg border border-slate-200 bg-slate-50 text-center text-slate-900 outline-none transition focus:border-blue-600 focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)]"
    :class="[
      large ? 'h-12 text-lg' : 'h-8 text-sm',
      flash ? 'cell-flash' : '',
    ]"
    @input="onInput"
  />
</template>

<style scoped>
.cell-flash {
  animation: cell-flash 0.8s ease;
}

@keyframes cell-flash {
  from {
    background-color: #dbeafe;
  }
  to {
    background-color: #f8fafc;
  }
}
</style>

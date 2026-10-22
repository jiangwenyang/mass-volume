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
    class="w-full bg-soft text-center font-semibold text-ink tabular-nums outline-none transition-colors duration-150 placeholder:text-muted/40 hover:bg-deep focus:bg-primary-soft focus:text-primary"
    :class="[
      large ? 'h-12 touch-manipulation rounded-xl text-lg' : 'h-[var(--cell,2.25rem)] rounded-lg leading-none',
      flash ? 'motion-safe:animate-cell' : '',
    ]"
    @input="onInput"
  />
</template>

<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue'
import { colorFor } from '../lib/lab'
import type { Group } from '../types'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  groups: Group[]
}>()

const emit = defineEmits<{
  save: [count: number, names: string[], force: boolean]
}>()

const count = ref(6)
const names = ref<string[]>([])
const askDrop = ref(false)
const countInput = useTemplateRef<HTMLInputElement>('countInput')

watch(open, (visible) => {
  if (!visible) return
  count.value = props.groups.length || 1
  names.value = props.groups.map((group) => group.name)
  askDrop.value = false
  syncNames()
})

/**
 * 让组名列表长度和组数一致。新增的组用「第 N 组」。
 */
const syncNames = (): void => {
  const next = names.value.slice(0, count.value)
  while (next.length < count.value) {
    next.push(`第${next.length + 1}组`)
  }
  names.value = next
}

/**
 * 把组数改成不少于 1 的整数，并补齐组名。
 * @param next - 目标组数
 */
const setCount = (next: number): void => {
  if (!Number.isFinite(next) || next < 1) return
  count.value = Math.floor(next)
  syncNames()
  askDrop.value = false
}

/**
 * 组数加减，最少 1 组。
 * @param delta - 变化量
 */
const step = (delta: number): void => {
  setCount(count.value + delta)
}

/**
 * 把数字框里的组数写回状态。未填完时保持原组数。
 */
const commitTypedCount = (): void => {
  const raw = countInput.value?.valueAsNumber
  if (raw == null || !Number.isFinite(raw)) return
  setCount(raw)
}

/**
 * 末尾将被删掉的组里是否已经有数据。
 * @returns 需要教师确认时为真
 */
const droppingHasData = (): boolean =>
  props.groups.slice(count.value).some((group) => group.rows.some((row) => row.v != null || row.m != null))

/**
 * 保存分组。会删数据时先在对话框里确认。
 */
const submit = (): void => {
  commitTypedCount()
  if (droppingHasData() && !askDrop.value) {
    askDrop.value = true
    return
  }
  emit('save', count.value, names.value, askDrop.value)
  open.value = false
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-6 backdrop-blur-sm" @click.self="open = false">
    <form class="flex max-h-[85vh] w-full max-w-lg flex-col rounded-3xl bg-sheet p-6 shadow-pop" @submit.prevent="submit">
      <h2 class="text-lg font-bold text-ink">分组设置</h2>
      <p class="mt-1.5 text-sm leading-relaxed text-muted">组数不限，至少 1 组。新组先有 5 行空白，之后可以继续加行。</p>
      <div class="mt-5 flex items-center gap-3">
        <button type="button" class="inline-flex size-11 items-center justify-center rounded-xl bg-primary-soft text-xl font-semibold text-primary transition-colors hover:bg-deep focus-visible:bg-deep" @click="step(-1)">−</button>
        <input
          type="number"
          min="1"
          step="1"
          ref="countInput"
          :value="count"
          aria-label="组数"
          class="h-12 w-20 rounded-xl bg-soft text-center text-2xl font-bold text-ink tabular-nums outline-none transition-colors focus:bg-primary-soft focus:text-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          @change="commitTypedCount"
        />
        <button type="button" class="inline-flex size-11 items-center justify-center rounded-xl bg-primary-soft text-xl font-semibold text-primary transition-colors hover:bg-deep focus-visible:bg-deep" @click="step(1)">+</button>
        <span class="text-sm text-muted">组</span>
      </div>
      <div class="mt-5 grid flex-1 grid-cols-2 gap-x-3 gap-y-3 overflow-y-auto pr-1">
        <label v-for="(_, index) in names" :key="index" class="block text-xs font-medium text-muted">
          <span class="inline-flex items-center gap-1.5">
            <i class="size-2 rounded-full" :style="{ background: colorFor(index) }" />
            第 {{ index + 1 }} 组
          </span>
          <input
            v-model="names[index]"
            maxlength="20"
            class="mt-1.5 h-11 w-full rounded-xl bg-soft px-3 text-base font-medium text-ink outline-none transition-colors focus:bg-primary-soft"
          />
        </label>
      </div>
      <p v-if="askDrop" class="mt-3 rounded-xl bg-notice px-3 py-2 text-sm text-notice-ink">
        减少分组会删除末尾已填写的数据。再点一次「保存」确认。
      </p>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="h-11 rounded-xl px-4 text-sm font-medium text-muted transition-colors hover:bg-soft focus-visible:bg-soft" @click="open = false">取消</button>
        <button type="submit" class="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-strong focus-visible:bg-primary-strong">保存</button>
      </div>
    </form>
  </div>
</template>

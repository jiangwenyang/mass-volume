<script setup lang="ts">
import { ref, useTemplateRef, watch } from 'vue'
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
  <div v-if="open" class="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-6" @click.self="open = false">
    <form class="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl" @submit.prevent="submit">
      <h2 class="text-lg font-semibold text-slate-800">分组设置</h2>
      <p class="mt-1 text-sm text-slate-500">组数不限，至少 1 组。新组先有 5 行空白，之后可以继续加行。</p>
      <div class="mt-4 flex items-center gap-3">
        <button type="button" class="size-10 rounded-lg border border-slate-300 text-lg" @click="step(-1)">−</button>
        <input
          type="number"
          min="1"
          step="1"
          ref="countInput"
          :value="count"
          aria-label="组数"
          class="w-20 rounded-lg border border-slate-200 py-1 text-center text-2xl font-semibold tabular-nums outline-none focus:border-blue-600"
          @change="commitTypedCount"
        />
        <button type="button" class="size-10 rounded-lg border border-slate-300 text-lg" @click="step(1)">+</button>
        <span class="text-sm text-slate-500">组</span>
      </div>
      <div class="mt-4 grid flex-1 grid-cols-2 gap-2 overflow-y-auto pr-1">
        <label v-for="(_, index) in names" :key="index" class="block text-sm text-slate-600">
          第 {{ index + 1 }} 组
          <input
            v-model="names[index]"
            maxlength="20"
            class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-base text-slate-900 outline-none focus:border-blue-600"
          />
        </label>
      </div>
      <p v-if="askDrop" class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        减少分组会删除末尾已填写的数据。再点一次「保存」确认。
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="rounded-lg px-4 py-2 text-sm text-slate-600" @click="open = false">取消</button>
        <button type="submit" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">保存</button>
      </div>
    </form>
  </div>
</template>

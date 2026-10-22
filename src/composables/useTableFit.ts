import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { boardColumns, cellSizeFor } from '../lib/board'
import type { Group } from '../types'

/**
 * 数据表页随容器高度收放格子，让每一组都留在当前这一屏里。
 * @param board - 放各组表格的网格
 * @param groups - 当前分组
 * @param active - 正在看数据表时才测量
 * @returns 列数，以及算好的单元格高度（像素）
 */
export const useTableFit = (
  board: Readonly<Ref<HTMLElement | null>>,
  groups: Readonly<Ref<readonly Group[]>>,
  active: Readonly<Ref<boolean>>,
): { columns: ComputedRef<number>; cellPx: Ref<number> } => {
  const cellPx = ref(32)
  const columns = computed(() => boardColumns(groups.value.length))

  /**
   * 用网格的实际高度重算格子。容器还没撑开时先跳过。
   */
  const measure = (): void => {
    const el = board.value
    if (!el || !active.value || el.clientHeight < 1) return
    const count = groups.value.length
    if (!count) return
    const cardRows = Math.ceil(count / columns.value)
    const dataRows = Math.max(...groups.value.map((group) => group.rows.length))
    cellPx.value = cellSizeFor(el.clientHeight, cardRows, dataRows)
  }

  watch(
    board,
    (el, _, onCleanup) => {
      if (!el) return
      const observer = new ResizeObserver(() => measure())
      observer.observe(el)
      measure()
      onCleanup(() => observer.disconnect())
    },
    { flush: 'post' },
  )

  watch(
    () => [active.value, groups.value.length, ...groups.value.map((group) => group.rows.length)] as const,
    () => measure(),
    { flush: 'post' },
  )

  return { columns, cellPx }
}

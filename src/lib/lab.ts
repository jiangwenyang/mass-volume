import type { Group, Point, Row } from '../types'

/** 各组在图像上的颜色，按组的顺序循环使用 */
export const GROUP_COLORS = [
  '#3b7bff',
  '#ff5a4e',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#65a30d',
  '#f97316',
  '#6366f1',
  '#14b8a6',
  '#d946ef',
] as const

/** 默认组名，与服务端 state.rs 的 DEFAULT_NAMES 保持一致 */
const DEFAULT_GROUP_NAMES = [
  '第1组（铜）',
  '第2组（铜）',
  '第3组（铜）',
  '第4组（铝）',
  '第5组（铝）',
  '第6组（铝）',
  '第7组（木）',
  '第8组（木）',
  '第9组（木）',
] as const

/**
 * 第 N 组的默认名称。前 9 组带材料，之后是「第 N 组」。
 * @param index - 组下标，从 0 开始
 * @returns 默认组名
 */
export const defaultGroupName = (index: number): string => DEFAULT_GROUP_NAMES[index] ?? `第${index + 1}组`

/**
 * 给组色加透明度，做浅底标签用。
 * @param color - 六位十六进制颜色
 * @param alpha - 0 到 1 的不透明度
 * @returns 八位十六进制颜色
 */
export const tint = (color: string, alpha: number): string =>
  `${color}${Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0')}`

/**
 * 取某一组的颜色。
 * @param index - 组在列表中的下标
 * @returns 十六进制颜色
 */
export const colorFor = (index: number): string => {
  const color = GROUP_COLORS[index % GROUP_COLORS.length]
  return color ?? '#3b7bff'
}

/**
 * 把数字收成适合表格和坐标轴的短字符串。
 * @param value - 原始数字
 * @returns 去掉多余小数后的文本
 */
export const formatNumber = (value: number): string => {
  if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value))
  return String(Math.round(value * 100) / 100)
}

/**
 * 计算一行的 m/V。体积或质量还没填好时返回空字符串。
 * @param row - 一行数据
 * @returns 保留两位的比值，或空
 */
export const ratioText = (row: Row): string => {
  if (row.v == null || row.m == null || row.v <= 0 || row.m <= 0) return ''
  return (row.m / row.v).toFixed(2)
}

/**
 * 这一行是否已经写过数。
 * @param row - 一行数据
 * @returns 体积或质量有值时为真
 */
export const rowFilled = (row: Row): boolean => row.v != null || row.m != null

/**
 * 第 0 行固定是原点，不可编辑也不可删除。
 * @param index - 行下标
 * @returns 是原点行时为真
 */
export const isOriginRow = (index: number): boolean => index === 0

/**
 * 这一组除原点外是否已经写过数。
 * @param group - 实验组
 * @returns 有填写时为真
 */
export const groupHasData = (group: Group): boolean => group.rows.some((row, index) => !isOriginRow(index) && rowFilled(row))

/**
 * 取出可以描点的数据：体积和质量都大于 0。
 * @param group - 实验组
 * @returns 坐标点，按表格顺序
 */
export const pointsOf = (group: Group): Point[] =>
  group.rows.flatMap((row) =>
    row.v != null && row.m != null && row.v > 0 && row.m > 0 ? [{ x: row.v, y: row.m }] : [],
  )

/**
 * 统计已经描得出的点数。
 * @param group - 实验组
 * @returns 有效点数量
 */
export const validCount = (group: Group): number => pointsOf(group).length

/**
 * 把坐标上限收成整齐的刻度。
 * @param maxValue - 数据最大值，含余量
 * @param ticks - 希望的刻度段数
 * @returns 轴的最大值和步长
 */
export const niceScale = (maxValue: number, ticks: number): { max: number; step: number } => {
  if (!(maxValue > 0)) return { max: 1, step: 0.2 }
  const raw = maxValue / ticks
  const exp = Math.floor(Math.log(raw) / Math.LN10)
  const base = 10 ** exp
  const n = raw / base
  const nice =
    n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10
  const step = nice * base
  return { max: Math.ceil(maxValue / step - 1e-9) * step, step }
}

/**
 * 所有图共用的坐标上限，好让斜率能够直接比较。
 * @param groups - 全部分组
 * @returns 横轴、纵轴在取整刻度之前的上限
 */
export const sharedLimits = (groups: Group[]): { maxX: number; maxY: number } => {
  let maxX = 0
  let maxY = 0
  for (const group of groups) {
    for (const point of pointsOf(group)) {
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }
  return {
    maxX: maxX > 0 ? maxX * 1.15 : 14,
    maxY: maxY > 0 ? maxY * 1.15 : 110,
  }
}

/**
 * 解析平板或大屏输入。输到一半的小数点先不提交。
 * @param raw - 输入框里的原文
 * @returns 数字、清空，或 `invalid` 表示先别提交
 */
export const parseCell = (raw: string): number | null | 'invalid' => {
  const trimmed = raw.trim().replace(/。/g, '.')
  if (!trimmed) return null
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === '.') return 'invalid'
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return 'invalid'
  return Math.round(value * 10000) / 10000
}

/**
 * 把单元格数字变成输入框文本。
 * @param value - 体积或质量
 * @returns 空值时为空字符串
 */
export const displayCell = (value: number | null): string => (value == null ? '' : String(value))

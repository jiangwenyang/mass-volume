import { paintLineLabels, roundRect, type LineLabel } from './chartLabels'
import { formatNumber, niceScale } from './lab'
import { traceMarker, type Marker } from './markers'
import { fillQty } from './quantity'
import type { Point } from '../types'

/** 一条要画出来的数据 */
export interface Series {
  name: string
  color: string
  marker: Marker
  points: Point[]
  /** 是否画出从原点出发、按体积依次连接各点的折线 */
  line: boolean
  /** 折线从原点长出的进度，0 到 1 */
  lineProgress: number
}

/** 描点时留在坐标轴上的辅助线 */
export interface Guide {
  x: number
  y: number
  color: string
}

/** 一张图的绘制参数 */
export interface ChartOptions {
  maxX: number
  maxY: number
  guides?: Guide[]
  showValues?: boolean
  /** 最后一个点的出现进度，0 到 1 */
  pop?: number
  emptyText?: string
}

/** 与页面一致：英文和数字用 Times New Roman 正体，中文回落到苹方；物理量符号经 fillQty 另设斜体 */
const FONT = '"Times New Roman",Times,"PingFang SC","Microsoft YaHei",serif'

/** 画布配色，与 style.css 的主题色保持一致 */
const INK = {
  sheet: '#ffffff',
  grid: '#e8eefb',
  axis: '#b4c0d8',
  label: '#66728c',
  title: '#16213e',
  chip: '#edf2fd',
} as const

/** 坐标轴上一段已被数值标签占用的区间，像素 */
type Span = [number, number]

/**
 * 新标签所在区间是否与已有标签都不重叠。
 * @param taken - 已占用的区间
 * @param span - 新标签的区间
 * @returns 不重叠时为真
 */
const isFree = (taken: Span[], span: Span): boolean => taken.every(([from, to]) => span[1] <= from || span[0] >= to)

/**
 * 按画布大小求统一的缩放比例。字号、边距、点和线都乘它，大图小图因此是同一套样式。
 * @param width - 画布宽
 * @param height - 画布高
 * @returns 0.6 到 1 之间的比例，约 720×480 以上为 1
 */
const scaleOf = (width: number, height: number): number => Math.min(Math.max(Math.min(width / 720, height / 480), 0.6), 1)

/** 期望的刻度段数。与图的大小无关，同一组数据在大图小图上的范围和步长一致 */
const TICKS = 7

/**
 * 刻度太密时隔几格标一个数字，网格线照画。
 * @param stepPixels - 相邻刻度的像素距离
 * @param need - 一个数字需要的像素空间
 * @returns 每隔多少格标一次，至少为 1
 */
const labelEvery = (stepPixels: number, need: number): number => Math.max(1, Math.ceil(need / stepPixels))

/**
 * 在空白画布中央写提示。
 * @param ctx - 画布上下文
 * @param width - 画布宽
 * @param height - 画布高
 * @param text - 提示文字，可用换行
 * @param scale - 统一缩放比例
 */
const paintHint = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  scale: number,
): void => {
  ctx.fillStyle = INK.label
  ctx.font = `${19 * scale}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = text.split('\n')
  const lineHeight = 30 * scale
  const start = height / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, index) => {
    ctx.fillText(line, width / 2, start + index * lineHeight)
  })
}

/**
 * 按长度比例描出折线路径的前一段，不负责描边。
 * @param ctx - 画布上下文
 * @param path - 像素坐标下的折点，第一个是起点
 * @param progress - 已画出的长度占总长的比例，0 到 1
 */
const tracePath = (ctx: CanvasRenderingContext2D, path: Point[], progress: number): void => {
  const first = path[0]
  if (!first) return
  const lengths = path.slice(1).map((point, index) => {
    const from = path[index] ?? first
    return Math.hypot(point.x - from.x, point.y - from.y)
  })
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.min(Math.max(progress, 0), 1)
  ctx.beginPath()
  ctx.moveTo(first.x, first.y)
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1] ?? first
    const to = path[index] ?? first
    const length = lengths[index - 1] ?? 0
    if (remaining >= length) {
      ctx.lineTo(to.x, to.y)
      remaining -= length
      continue
    }
    const share = length > 0 ? remaining / length : 0
    ctx.lineTo(from.x + (to.x - from.x) * share, from.y + (to.y - from.y) * share)
    return
  }
}

/**
 * 把一组序列画到画布上。画布尺寸跟着元素的显示大小走。
 * @param canvas - 目标画布
 * @param series - 要绘制的序列
 * @param options - 比例尺、辅助线和动画进度
 */
export const drawChart = (
  canvas: HTMLCanvasElement,
  series: Series[],
  options: ChartOptions,
): void => {
  const rect = canvas.getBoundingClientRect()
  const width = Math.floor(rect.width)
  const height = Math.floor(rect.height)
  if (width < 30 || height < 30) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // 底色与卡片相同，图表不再像一块白卡片嵌在页面里
  ctx.fillStyle = INK.sheet
  ctx.fillRect(0, 0, width, height)

  const s = scaleOf(width, height)
  // 左边距要同时放下纵轴标题和最宽的质量数值标签
  const pad = { l: 98 * s, r: 24 * s, t: 18 * s, b: 58 * s }
  const plotWidth = width - pad.l - pad.r
  const plotHeight = height - pad.t - pad.b
  if (plotWidth < 20 || plotHeight < 20) return

  const hasPoint = series.some((item) => item.points.length > 0)
  if (!hasPoint) {
    paintHint(ctx, width, height, options.emptyText || '暂无数据', s)
    return
  }

  const scaleX = niceScale(options.maxX, TICKS)
  const scaleY = niceScale(options.maxY, TICKS)
  const xOf = (value: number): number => pad.l + (value / scaleX.max) * plotWidth
  const yOf = (value: number): number => pad.t + plotHeight - (value / scaleY.max) * plotHeight
  const stepsX = Math.round(scaleX.max / scaleX.step)
  const stepsY = Math.round(scaleY.max / scaleY.step)

  ctx.lineWidth = 1
  ctx.strokeStyle = INK.grid
  ctx.font = `${16 * s}px ${FONT}`
  ctx.fillStyle = INK.label
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  const everyY = labelEvery(plotHeight / stepsY, 16 * s * 1.4)
  for (let index = 0; index <= stepsY; index += 1) {
    const y = index * scaleY.step
    const py = yOf(y)
    ctx.beginPath()
    ctx.moveTo(pad.l, py)
    ctx.lineTo(pad.l + plotWidth, py)
    ctx.stroke()
    if (index % everyY === 0) ctx.fillText(formatNumber(y), pad.l - 6 * s, py)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const widestX = ctx.measureText(formatNumber(scaleX.max)).width
  const everyX = labelEvery(plotWidth / stepsX, widestX + 10 * s)
  for (let index = 0; index <= stepsX; index += 1) {
    const x = index * scaleX.step
    const px = xOf(x)
    ctx.beginPath()
    ctx.moveTo(px, pad.t)
    ctx.lineTo(px, pad.t + plotHeight)
    ctx.stroke()
    if (index % everyX === 0) ctx.fillText(formatNumber(x), px, pad.t + plotHeight + 6 * s)
  }

  ctx.strokeStyle = INK.axis
  ctx.lineWidth = 2 * s
  ctx.beginPath()
  ctx.moveTo(pad.l, pad.t)
  ctx.lineTo(pad.l, pad.t + plotHeight)
  ctx.lineTo(pad.l + plotWidth, pad.t + plotHeight)
  ctx.stroke()

  const titleFont = `600 ${18 * s}px ${FONT}`
  ctx.fillStyle = INK.title
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  fillQty(ctx, '体积*V*/cm³', pad.l + plotWidth / 2, pad.t + plotHeight + 30 * s, titleFont)
  ctx.save()
  ctx.translate(16 * s, pad.t + plotHeight / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.textBaseline = 'middle'
  fillQty(ctx, '质量*m*/g', 0, 0, titleFont)
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(pad.l - 12 * s, pad.t - 12 * s, plotWidth + 24 * s, plotHeight + 24 * s)
  ctx.clip()

  const guides = options.guides ?? []
  if (guides.length) {
    ctx.save()
    ctx.setLineDash([6 * s, 5 * s])
    ctx.lineWidth = 2 * s
    for (const guide of guides) {
      const gx = xOf(guide.x)
      const gy = yOf(guide.y)
      ctx.strokeStyle = guide.color
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.moveTo(gx, gy)
      ctx.lineTo(gx, pad.t + plotHeight)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(gx, gy)
      ctx.lineTo(pad.l, gy)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = guide.color
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(gx, pad.t + plotHeight, 5 * s, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(pad.l, gy, 5 * s, 0, Math.PI * 2)
      ctx.fill()
      ctx.setLineDash([6 * s, 5 * s])
    }
    ctx.restore()
  }

  const labels: LineLabel[] = []
  for (const item of series) {
    if (!item.line || item.points.length < 1 || item.lineProgress <= 0) continue
    const sorted = [...item.points].sort((a, b) => a.x - b.x || a.y - b.y)
    const path = [{ x: 0, y: 0 }, ...sorted].map((point) => ({ x: xOf(point.x), y: yOf(point.y) }))
    const end = path[path.length - 1]
    const alpha = Math.min(Math.max((item.lineProgress - 0.6) / 0.4, 0), 1)
    if (end && alpha > 0) labels.push({ text: item.name, color: item.color, anchor: end, alpha })
    tracePath(ctx, path, item.lineProgress)
    ctx.strokeStyle = item.color
    ctx.lineWidth = 3.6 * s
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.85
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  series.forEach((item, seriesIndex) => {
    item.points.forEach((point, pointIndex) => {
      const isLast = seriesIndex === series.length - 1 && pointIndex === item.points.length - 1
      const pop = isLast ? (options.pop ?? 1) : 1
      const radius = 7.5 * s * (0.35 + 0.65 * pop)
      if (isLast && pop < 1) {
        ctx.beginPath()
        ctx.arc(xOf(point.x), yOf(point.y), 18 * s * pop, 0, Math.PI * 2)
        ctx.fillStyle = item.color
        ctx.globalAlpha = 0.16
        ctx.fill()
        ctx.globalAlpha = 1
      }
      traceMarker(ctx, item.marker, xOf(point.x), yOf(point.y), radius)
      ctx.fillStyle = item.color
      ctx.fill()
      ctx.strokeStyle = INK.sheet
      ctx.lineWidth = 2.5 * s
      ctx.lineJoin = 'round'
      ctx.stroke()
    })
  })
  ctx.restore()

  const labelSize = 15 * s
  paintLineLabels(
    ctx,
    labels,
    { left: pad.l + 4 * s, top: pad.t, right: width - 4 * s, bottom: pad.t + plotHeight - 2 * s },
    `600 ${labelSize}px ${FONT}`,
    labelSize,
  )

  if (options.showValues && guides.length) {
    ctx.save()
    ctx.font = `bold ${16 * s}px ${FONT}`
    const chip = 23 * s
    const takenX: Span[] = []
    const takenY: Span[] = []
    // 从最新的点往前排，挤不下的旧数值让位给新数值
    for (const guide of [...guides].reverse()) {
      const px = xOf(guide.x)
      const py = yOf(guide.y)
      const volume = formatNumber(guide.x)
      const volumeWidth = ctx.measureText(volume).width
      const volumeSpan: Span = [px - volumeWidth / 2 - 6 * s, px + volumeWidth / 2 + 6 * s]
      if (isFree(takenX, volumeSpan)) {
        takenX.push(volumeSpan)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = INK.chip
        roundRect(ctx, volumeSpan[0], pad.t + plotHeight + 4 * s, volumeSpan[1] - volumeSpan[0], chip, 5 * s)
        ctx.fill()
        ctx.fillStyle = guide.color
        ctx.fillText(volume, px, pad.t + plotHeight + 7 * s)
      }

      const massSpan: Span = [py - chip / 2, py + chip / 2]
      if (!isFree(takenY, massSpan)) continue
      takenY.push(massSpan)
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      const mass = formatNumber(guide.y)
      const massWidth = ctx.measureText(mass).width
      ctx.fillStyle = INK.chip
      roundRect(ctx, pad.l - massWidth - 20 * s, massSpan[0], massWidth + 12 * s, chip, 5 * s)
      ctx.fill()
      ctx.fillStyle = guide.color
      ctx.fillText(mass, pad.l - 14 * s, py)
    }
    ctx.restore()
  }
}

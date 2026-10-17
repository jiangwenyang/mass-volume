import { formatNumber, niceScale } from './lab'
import type { Point } from '../types'

/** 一条要画出来的数据 */
export interface Series {
  name: string
  color: string
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
  small?: boolean
  guides?: Guide[]
  showValues?: boolean
  /** 最后一个点的出现进度，0 到 1 */
  pop?: number
  emptyText?: string
}

/** 与页面一致：英文和数字用 Times New Roman，中文回落到苹方 */
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

/**
 * 画圆角矩形路径，不负责填充。
 * @param ctx - 画布上下文
 * @param x - 左上角横坐标
 * @param y - 左上角纵坐标
 * @param width - 宽
 * @param height - 高
 * @param radius - 圆角
 */
const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/**
 * 在空白画布中央写提示。
 * @param ctx - 画布上下文
 * @param width - 画布宽
 * @param height - 画布高
 * @param text - 提示文字，可用换行
 * @param small - 小图用更小的字
 */
const paintHint = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  small: boolean,
): void => {
  ctx.fillStyle = INK.label
  ctx.font = `${small ? 14 : 19}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = text.split('\n')
  const lineHeight = small ? 21 : 30
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

  const small = !!options.small
  const pad = small ? { l: 44, r: 12, t: 12, b: 32 } : { l: 76, r: 24, t: 18, b: 58 }
  const plotWidth = width - pad.l - pad.r
  const plotHeight = height - pad.t - pad.b
  if (plotWidth < 20 || plotHeight < 20) return

  const hasPoint = series.some((item) => item.points.length > 0)
  if (!hasPoint) {
    paintHint(ctx, width, height, options.emptyText || '暂无数据', small)
    return
  }

  const scaleX = niceScale(options.maxX, small ? 5 : 7)
  const scaleY = niceScale(options.maxY, small ? 5 : 7)
  const xOf = (value: number): number => pad.l + (value / scaleX.max) * plotWidth
  const yOf = (value: number): number => pad.t + plotHeight - (value / scaleY.max) * plotHeight

  ctx.lineWidth = 1
  ctx.strokeStyle = INK.grid
  ctx.font = `${small ? 12 : 16}px ${FONT}`
  ctx.fillStyle = INK.label
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let y = 0; y <= scaleY.max + 1e-9; y += scaleY.step) {
    const py = yOf(y)
    ctx.beginPath()
    ctx.moveTo(pad.l, py)
    ctx.lineTo(pad.l + plotWidth, py)
    ctx.stroke()
    ctx.fillText(formatNumber(y), pad.l - 6, py)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let x = 0; x <= scaleX.max + 1e-9; x += scaleX.step) {
    const px = xOf(x)
    ctx.beginPath()
    ctx.moveTo(px, pad.t)
    ctx.lineTo(px, pad.t + plotHeight)
    ctx.stroke()
    ctx.fillText(formatNumber(x), px, pad.t + plotHeight + 6)
  }

  ctx.strokeStyle = INK.axis
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pad.l, pad.t)
  ctx.lineTo(pad.l, pad.t + plotHeight)
  ctx.lineTo(pad.l + plotWidth, pad.t + plotHeight)
  ctx.stroke()

  if (!small) {
    ctx.fillStyle = INK.title
    ctx.font = `600 18px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('V (cm³)', pad.l + plotWidth / 2, pad.t + plotHeight + 30)
    ctx.save()
    ctx.translate(16, pad.t + plotHeight / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textBaseline = 'middle'
    ctx.fillText('m (g)', 0, 0)
    ctx.restore()
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(pad.l - 12, pad.t - 12, plotWidth + 24, plotHeight + 24)
  ctx.clip()

  const guides = options.guides ?? []
  if (guides.length) {
    ctx.save()
    ctx.setLineDash([6, 5])
    ctx.lineWidth = 2
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
      ctx.arc(gx, pad.t + plotHeight, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(pad.l, gy, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.setLineDash([6, 5])
    }
    ctx.restore()
  }

  for (const item of series) {
    if (!item.line || item.points.length < 1 || item.lineProgress <= 0) continue
    const sorted = [...item.points].sort((a, b) => a.x - b.x || a.y - b.y)
    const path = [{ x: 0, y: 0 }, ...sorted].map((point) => ({ x: xOf(point.x), y: yOf(point.y) }))
    tracePath(ctx, path, item.lineProgress)
    ctx.strokeStyle = item.color
    ctx.lineWidth = small ? 2.6 : 3.6
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
      const radius = (small ? 5 : 7.5) * (0.35 + 0.65 * pop)
      if (isLast && pop < 1) {
        ctx.beginPath()
        ctx.arc(xOf(point.x), yOf(point.y), 18 * pop, 0, Math.PI * 2)
        ctx.fillStyle = item.color
        ctx.globalAlpha = 0.16
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.beginPath()
      ctx.arc(xOf(point.x), yOf(point.y), radius, 0, Math.PI * 2)
      ctx.fillStyle = item.color
      ctx.fill()
      ctx.strokeStyle = INK.sheet
      ctx.lineWidth = small ? 2 : 2.5
      ctx.stroke()
    })
  })
  ctx.restore()

  if (options.showValues && !small && guides.length) {
    ctx.save()
    ctx.font = `bold 16px ${FONT}`
    for (const guide of guides) {
      const px = xOf(guide.x)
      const py = yOf(guide.y)
      const volume = formatNumber(guide.x)
      const volumeWidth = ctx.measureText(volume).width
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = INK.chip
      roundRect(ctx, px - volumeWidth / 2 - 6, pad.t + plotHeight + 4, volumeWidth + 12, 23, 5)
      ctx.fill()
      ctx.fillStyle = guide.color
      ctx.fillText(volume, px, pad.t + plotHeight + 7)

      ctx.save()
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      const mass = formatNumber(guide.y)
      const massWidth = ctx.measureText(mass).width
      ctx.fillStyle = INK.chip
      roundRect(ctx, pad.l - massWidth - 20, py - 11.5, massWidth + 12, 23, 5)
      ctx.fill()
      ctx.fillStyle = guide.color
      ctx.fillText(mass, pad.l - 14, py)
      ctx.restore()
    }
    ctx.restore()
  }
}

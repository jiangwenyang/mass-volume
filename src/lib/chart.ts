import { fitK, formatNumber, niceScale } from './lab'
import type { Point } from '../types'

/** 一条要画出来的数据 */
export interface Series {
  name: string
  color: string
  points: Point[]
  /** 是否画出过原点的拟合直线 */
  line: boolean
  /** 直线从原点长出的进度，0 到 1 */
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

const FONT = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif'

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
  ctx.fillStyle = '#94a3b8'
  ctx.font = `${small ? 12 : 15}px ${FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lines = text.split('\n')
  const lineHeight = small ? 18 : 24
  const start = height / 2 - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, index) => {
    ctx.fillText(line, width / 2, start + index * lineHeight)
  })
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
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const small = !!options.small
  const pad = small ? { l: 38, r: 12, t: 12, b: 28 } : { l: 62, r: 24, t: 18, b: 46 }
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
  ctx.strokeStyle = '#eef2f7'
  ctx.font = `${small ? 10 : 12}px ${FONT}`
  ctx.fillStyle = '#94a3b8'
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

  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(pad.l, pad.t)
  ctx.lineTo(pad.l, pad.t + plotHeight)
  ctx.lineTo(pad.l + plotWidth, pad.t + plotHeight)
  ctx.stroke()

  if (!small) {
    ctx.fillStyle = '#475569'
    ctx.font = `13px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('V / cm³', pad.l + plotWidth / 2, pad.t + plotHeight + 22)
    ctx.save()
    ctx.translate(16, pad.t + plotHeight / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textBaseline = 'middle'
    ctx.fillText('m / g', 0, 0)
    ctx.restore()
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(pad.l - 8, pad.t - 8, plotWidth + 16, plotHeight + 16)
  ctx.clip()

  const guides = options.guides ?? []
  if (guides.length) {
    ctx.save()
    ctx.setLineDash([5, 5])
    ctx.lineWidth = 1.3
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
      ctx.arc(gx, pad.t + plotHeight, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(pad.l, gy, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.setLineDash([5, 5])
    }
    ctx.restore()
  }

  for (const item of series) {
    if (!item.line || item.points.length < 2 || item.lineProgress <= 0) continue
    const slope = fitK(item.points)
    if (!(slope > 0)) continue
    let xEnd = scaleX.max
    if (slope * xEnd > scaleY.max) xEnd = scaleY.max / slope
    xEnd *= item.lineProgress
    ctx.beginPath()
    ctx.moveTo(xOf(0), yOf(0))
    ctx.lineTo(xOf(xEnd), yOf(slope * xEnd))
    ctx.strokeStyle = item.color
    ctx.lineWidth = small ? 1.6 : 2.2
    ctx.globalAlpha = 0.8
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  series.forEach((item, seriesIndex) => {
    item.points.forEach((point, pointIndex) => {
      const isLast = seriesIndex === series.length - 1 && pointIndex === item.points.length - 1
      const pop = isLast ? (options.pop ?? 1) : 1
      const radius = (small ? 3.5 : 5) * (0.35 + 0.65 * pop)
      if (isLast && pop < 1) {
        ctx.beginPath()
        ctx.arc(xOf(point.x), yOf(point.y), 12 * pop, 0, Math.PI * 2)
        ctx.fillStyle = item.color
        ctx.globalAlpha = 0.16
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.beginPath()
      ctx.arc(xOf(point.x), yOf(point.y), radius, 0, Math.PI * 2)
      ctx.fillStyle = item.color
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.6
      ctx.stroke()
    })
  })
  ctx.restore()

  if (options.showValues && !small && guides.length) {
    ctx.save()
    ctx.font = `bold 12px ${FONT}`
    for (const guide of guides) {
      const px = xOf(guide.x)
      const py = yOf(guide.y)
      const volume = formatNumber(guide.x)
      const volumeWidth = ctx.measureText(volume).width
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = guide.color
      ctx.lineWidth = 1
      roundRect(ctx, px - volumeWidth / 2 - 4, pad.t + plotHeight + 16, volumeWidth + 8, 18, 4)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = guide.color
      ctx.fillText(volume, px, pad.t + plotHeight + 19)

      ctx.save()
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      const mass = formatNumber(guide.y)
      const massWidth = ctx.measureText(mass).width
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = guide.color
      roundRect(ctx, pad.l - massWidth - 20, py - 9, massWidth + 10, 18, 4)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = guide.color
      ctx.fillText(mass, pad.l - 14, py)
      ctx.restore()
    }
    ctx.restore()
  }
}

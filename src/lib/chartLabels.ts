import type { Point } from '../types'

/** 线末端要写的组名 */
export interface LineLabel {
  text: string
  color: string
  /** 线末端的像素坐标 */
  anchor: Point
  /** 0 到 1，跟着连线长出来淡入 */
  alpha: number
}

/** 组名可以摆放的绘图区，像素坐标 */
export interface LabelArea {
  left: number
  top: number
  right: number
  bottom: number
}

/** 排好位置的组名框 */
interface Placed extends LineLabel {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 画圆角矩形路径，不负责填充。
 * @param ctx - 画布上下文
 * @param x - 左上角横坐标
 * @param y - 左上角纵坐标
 * @param width - 宽
 * @param height - 高
 * @param radius - 圆角
 */
export const roundRect = (
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
 * 两个组名框在水平方向上是否有重叠。
 * @param a - 组名框
 * @param b - 组名框
 * @returns 有重叠时为真
 */
const sharesColumn = (a: Placed, b: Placed): boolean => a.left < b.left + b.width && b.left < a.left + a.width

/**
 * 先把组名放在线末端右侧，放不下就放到左上方；再上下错开，避免几条线终点相近时叠在一起。
 * @param ctx - 已设置好字体的画布上下文
 * @param labels - 各条线的组名
 * @param area - 允许摆放的范围
 * @param height - 组名框高度
 * @returns 带位置的组名框
 */
const placeLabels = (ctx: CanvasRenderingContext2D, labels: LineLabel[], area: LabelArea, height: number): Placed[] => {
  const gap = 8
  const placed = labels
    .map((label): Placed => {
      const width = ctx.measureText(label.text).width + 12
      const fitsRight = label.anchor.x + gap + width <= area.right
      return {
        ...label,
        width,
        height,
        left: fitsRight ? label.anchor.x + gap : Math.max(area.left, label.anchor.x - gap - width),
        top: fitsRight ? label.anchor.y - height / 2 : label.anchor.y - height - gap,
      }
    })
    .sort((a, b) => a.top - b.top)
  placed.forEach((label, index) => {
    for (const other of placed.slice(0, index)) {
      if (sharesColumn(label, other)) label.top = Math.max(label.top, other.top + other.height + 2)
    }
  })
  for (let index = placed.length - 1; index >= 0; index -= 1) {
    const label = placed[index]
    if (!label) continue
    let limit = area.bottom
    for (const other of placed.slice(index + 1)) {
      if (sharesColumn(label, other)) limit = Math.min(limit, other.top - 2)
    }
    label.top = Math.max(area.top, Math.min(label.top, limit - label.height))
  }
  return placed
}

/**
 * 在每条线末端写上组名。组名被挤开时用细线连回线末端。
 * @param ctx - 画布上下文
 * @param labels - 各条线的组名
 * @param area - 允许摆放的范围
 * @param font - 组名字体，如 `600 15px ...`
 * @param fontSize - 字号，用来定框高
 */
export const paintLineLabels = (
  ctx: CanvasRenderingContext2D,
  labels: LineLabel[],
  area: LabelArea,
  font: string,
  fontSize: number,
): void => {
  if (!labels.length) return
  ctx.save()
  ctx.font = font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (const label of placeLabels(ctx, labels, area, fontSize + 8)) {
    ctx.globalAlpha = label.alpha
    const middle = label.top + label.height / 2
    const nearX = label.left > label.anchor.x ? label.left : label.left + label.width
    if (Math.abs(middle - label.anchor.y) > label.height / 2) {
      ctx.strokeStyle = label.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(label.anchor.x, label.anchor.y)
      ctx.lineTo(nearX, middle)
      ctx.stroke()
    }
    ctx.fillStyle = '#ffffff'
    roundRect(ctx, label.left, label.top, label.width, label.height, 5)
    ctx.fill()
    ctx.strokeStyle = label.color
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = label.color
    ctx.fillText(label.text, label.left + 6, middle + 0.5)
  }
  ctx.restore()
}

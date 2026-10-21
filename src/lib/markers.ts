/** 数据点形状：铜用圆点，铝用菱形，木用三角形 */
export type Marker = 'circle' | 'diamond' | 'triangle'

/** 组名里的材料关键字与点形状，按顺序匹配 */
const MATERIAL_MARKERS: readonly (readonly [RegExp, Marker])[] = [
  [/铜|copper|\bCu\b/i, 'circle'],
  [/铝|alumin|\bAl\b/i, 'diamond'],
  [/木|wood/i, 'triangle'],
]

/**
 * 按组名里的材料决定点形状。认不出材料的自定义组名回落为圆点。
 * @param name - 组名，如「第4组（铝）」
 * @returns 点形状
 */
export const markerOf = (name: string): Marker =>
  MATERIAL_MARKERS.find(([pattern]) => pattern.test(name))?.[1] ?? 'circle'

/**
 * 描出一个数据点的轮廓，不负责填充和描边。菱形、三角形按与圆面积相近放大，看起来一样大。
 * @param ctx - 画布上下文
 * @param marker - 点形状
 * @param x - 中心横坐标
 * @param y - 中心纵坐标
 * @param radius - 圆点半径
 */
export const traceMarker = (ctx: CanvasRenderingContext2D, marker: Marker, x: number, y: number, radius: number): void => {
  ctx.beginPath()
  if (marker === 'diamond') {
    const reach = radius * 1.28
    ctx.moveTo(x, y - reach)
    ctx.lineTo(x + reach, y)
    ctx.lineTo(x, y + reach)
    ctx.lineTo(x - reach, y)
    ctx.closePath()
    return
  }
  if (marker === 'triangle') {
    const reach = radius * 1.5
    const half = reach * Math.sin(Math.PI / 3)
    ctx.moveTo(x, y - reach)
    ctx.lineTo(x + half, y + reach / 2)
    ctx.lineTo(x - half, y + reach / 2)
    ctx.closePath()
    return
  }
  ctx.arc(x, y, radius, 0, Math.PI * 2)
}

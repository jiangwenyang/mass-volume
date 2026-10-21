/** 带物理量符号的文字片段 */
export interface QtySegment {
  text: string
  /** 物理量符号（m、V 等）用斜体，单位和其余文字用正体 */
  italic: boolean
}

/**
 * 拆分带标记的文字：一对星号包住的是物理量符号，例如表头「体积 V/cm³」写作 `体积*V*` 加单位。
 * @param source - 带标记的原文
 * @returns 依次排列的正体、斜体片段
 */
export const parseQty = (source: string): QtySegment[] =>
  source.split('*').flatMap((text, index) => (text ? [{ text, italic: index % 2 === 1 }] : []))

/**
 * 在画布上写带物理量符号的文字，符号用斜体，其余保持 `font` 原样。按当前 textAlign 对齐整段。
 * @param ctx - 画布上下文
 * @param source - 带标记的原文
 * @param x - 对齐点横坐标
 * @param y - 基线纵坐标
 * @param font - 正体字体，如 `600 18px ...`
 */
export const fillQty = (ctx: CanvasRenderingContext2D, source: string, x: number, y: number, font: string): void => {
  const segments = parseQty(source).map((segment) => {
    ctx.font = segment.italic ? `italic ${font}` : font
    return { ...segment, width: ctx.measureText(segment.text).width }
  })
  const total = segments.reduce((sum, segment) => sum + segment.width, 0)
  const align = ctx.textAlign
  let cursor = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x
  ctx.save()
  ctx.textAlign = 'left'
  for (const segment of segments) {
    ctx.font = segment.italic ? `italic ${font}` : font
    ctx.fillText(segment.text, cursor, y)
    cursor += segment.width
  }
  ctx.restore()
}

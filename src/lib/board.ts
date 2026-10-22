/** 卡片标题比格子高出的高度，对应 `h-[calc(var(--cell)+0.375rem)]` */
const HEADER_EXTRA_PX = 6
/** 表格底部留白，对应 `pb-2` */
const CARD_PADDING_BOTTOM_PX = 8
/** 表头与数据行之间的间距，对应 `border-spacing-y-0.5` */
const ROW_GAP_PX = 2
/** 卡片之间的行距，对应 `gap-y-2` */
const CARD_GAP_PX = 8
/** 少算几个像素，避免四舍五入后撑出滚动条 */
const SLACK_PX = 4

/**
 * 一屏网格的列数。4 张用 2×2，其余每行最多 3 张。
 * @param count - 要摆下的张数
 * @returns 列数，至少 1
 */
export const boardColumns = (count: number): number => (count === 4 ? 2 : Math.min(Math.max(count, 1), 3))

/**
 * 按网格高度反推单元格高度，让每张表的标题、列头和全部数据行落在分配到的那一格里。
 * 标题算 1 格，列头算 0.8 格，每个数据行算 1 格。
 * @param height - 网格容器的内容高度（像素）
 * @param cardRows - 纵向有几排卡片
 * @param dataRows - 一张表里有几行数据（含原点）
 * @returns 单元格高度（像素），向下取整，不会小于 0
 */
export const cellSizeFor = (height: number, cardRows: number, dataRows: number): number => {
  const rows = Math.max(cardRows, 1)
  const bodyRows = Math.max(dataRows, 1)
  const available = height - CARD_GAP_PX * (rows - 1) - SLACK_PX
  const perCard = available / rows
  const spacing = (bodyRows + 2) * ROW_GAP_PX
  const fixed = HEADER_EXTRA_PX + CARD_PADDING_BOTTOM_PX + spacing
  const units = 1.8 + bodyRows
  return Math.max(0, Math.floor((perCard - fixed) / units))
}

import type { PlotProgress } from '../composables/usePlot'
import type { ChartOptions, Series } from './chart'
import { colorFor, pointsOf } from './lab'
import { markerOf } from './markers'
import type { Group } from '../types'

/** 一张单组图要交给画布的序列与参数 */
export interface GroupChart {
  series: Series[]
  options: ChartOptions
}

/** 坐标上限，各图共用以便比较斜率 */
export interface ChartLimits {
  maxX: number
  maxY: number
}

/** 点已全部描完、连线已画好的进度 */
export const FULL_PLOT: PlotProgress = { shown: Infinity, showLine: true, lineProgress: 1 }

/**
 * 一组数据对应的序列：颜色按组的位置，点形状按组名里的材料。
 * @param group - 实验组
 * @param index - 组在全部分组中的下标
 * @param plot - 描点进度，缺省为全部画完
 * @returns 序列
 */
export const groupSeries = (group: Group, index: number, plot: PlotProgress = FULL_PLOT): Series => ({
  name: group.name,
  color: colorFor(index),
  marker: markerOf(group.name),
  points: pointsOf(group).slice(0, plot.shown),
  line: plot.showLine,
  lineProgress: plot.lineProgress,
})

/**
 * 单组图的完整配置。单组图像页和所有组页的每张图都由它生成，保证样式一致。
 * @param group - 实验组
 * @param index - 组在全部分组中的下标
 * @param limits - 共用的坐标上限
 * @param plot - 描点进度，缺省为全部画完
 * @param pop - 最新一个点的出现进度
 * @param withGuides - 是否画虚线辅助线和数值标签，所有组里未放大的小图不画
 * @returns 序列与绘制参数
 */
export const groupChart = (
  group: Group,
  index: number,
  limits: ChartLimits,
  plot: PlotProgress = FULL_PLOT,
  pop = 1,
  withGuides = true,
): GroupChart => {
  const series = groupSeries(group, index, plot)
  return {
    series: [series],
    options: {
      maxX: limits.maxX,
      maxY: limits.maxY,
      guides: withGuides ? series.points.map((point) => ({ x: point.x, y: point.y, color: series.color })) : [],
      showValues: withGuides,
      pop,
      emptyText: pointsOf(group).length ? '点击「描点」或「生成该组图像」' : '暂无数据，请先在表格中填写',
    },
  }
}

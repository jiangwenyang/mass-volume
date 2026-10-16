import { ref } from 'vue'
import { pointsOf } from '../lib/lab'
import type { Group } from '../types'

/** 某一组已经画到哪一步 */
export interface PlotProgress {
  shown: number
  showLine: boolean
  lineProgress: number
}

/** 正在播放的点出现动画 */
export interface PlotMotion {
  groupId: string
  pop: number
}

const progress = ref<Record<string, PlotProgress>>({})
const motion = ref<PlotMotion | null>(null)
let token = 0

/**
 * 系统是否要求减少动画。
 * @returns 需要立即出图时为真
 */
const reducedMotion = (): boolean =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 等待若干毫秒，动画被新的操作打断时提前结束。
 * @param ms - 等待时间
 * @param mine - 这一轮动画的记号
 * @returns 记号仍然有效时为真
 */
const wait = (ms: number, mine: number): Promise<boolean> =>
  new Promise((resolve) => {
    window.setTimeout(() => resolve(token === mine), ms)
  })

/**
 * 把 0 到 1 的时间收成先快后慢的曲线。
 * @param amount - 线性进度
 * @returns 缓动后的进度
 */
const easeOut = (amount: number): number => 1 - (1 - amount) ** 3

/**
 * 让最新一个点缩放出现。
 * @param groupId - 正在描的组
 * @param mine - 动画记号
 * @param duration - 持续时间
 * @returns 没有被打断时为真
 */
const animatePop = async (groupId: string, mine: number, duration: number): Promise<boolean> => {
  const start = performance.now()
  while (token === mine) {
    const amount = Math.min(1, (performance.now() - start) / duration)
    motion.value = { groupId, pop: easeOut(amount) }
    if (amount >= 1) return true
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
  return false
}

/**
 * 拟合直线从原点长出。
 * @param groupId - 正在出图的组
 * @param mine - 动画记号
 * @returns 没有被打断时为真
 */
const animateLine = async (groupId: string, mine: number): Promise<boolean> => {
  const start = performance.now()
  while (token === mine) {
    const amount = Math.min(1, (performance.now() - start) / 700)
    const current = progress.value[groupId]
    if (!current) return false
    progress.value = {
      ...progress.value,
      [groupId]: { ...current, showLine: true, lineProgress: easeOut(amount) },
    }
    if (amount >= 1) return true
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
  return false
}

/**
 * 读取一组的出图进度，没有操作过就是空白。
 * @param groupId - 组 id
 * @returns 已显示的点数和直线进度
 */
export const plotOf = (groupId: string): PlotProgress =>
  progress.value[groupId] ?? { shown: 0, showLine: false, lineProgress: 0 }

/**
 * 教师端的描点和出图动画。进度按组记住，切换视图不会丢。
 * @returns 动画状态和两个播放动作
 */
export const usePlot = () => {
  /**
   * 停掉正在播放的动画。
   */
  const stop = (): void => {
    token += 1
    motion.value = null
  }

  /**
   * 逐点描出一组数据，辅助线会随着已出现的点保留。
   * @param group - 要描的组
   */
  const startPlot = async (group: Group): Promise<void> => {
    const mine = ++token
    const total = pointsOf(group).length
    progress.value = {
      ...progress.value,
      [group.id]: { shown: 0, showLine: false, lineProgress: 0 },
    }
    motion.value = null
    if (!total) return
    if (reducedMotion()) {
      progress.value = {
        ...progress.value,
        [group.id]: { shown: total, showLine: false, lineProgress: 0 },
      }
      return
    }
    for (let shown = 1; shown <= total; shown += 1) {
      if (token !== mine) return
      progress.value = {
        ...progress.value,
        [group.id]: { shown, showLine: false, lineProgress: 0 },
      }
      const alive = await animatePop(group.id, mine, 320)
      if (!alive) return
      if (shown < total) {
        const still = await wait(780, mine)
        if (!still) return
      }
    }
    motion.value = null
  }

  /**
   * 较快补完剩余的点，再画出过原点的拟合直线。
   * @param group - 要出图的组
   */
  const genLine = async (group: Group): Promise<void> => {
    const mine = ++token
    const total = pointsOf(group).length
    const current = plotOf(group.id)
    let shown = Math.min(current.shown, total)
    progress.value = {
      ...progress.value,
      [group.id]: { shown, showLine: false, lineProgress: 0 },
    }
    if (!total) {
      motion.value = null
      return
    }
    if (reducedMotion()) {
      progress.value = {
        ...progress.value,
        [group.id]: { shown: total, showLine: true, lineProgress: 1 },
      }
      motion.value = null
      return
    }
    if (shown === 0) {
      shown = 1
      progress.value = {
        ...progress.value,
        [group.id]: { shown, showLine: false, lineProgress: 0 },
      }
      if (!(await animatePop(group.id, mine, 220))) return
    }
    while (shown < total) {
      if (!(await wait(120, mine))) return
      shown += 1
      progress.value = {
        ...progress.value,
        [group.id]: { shown, showLine: false, lineProgress: 0 },
      }
      if (!(await animatePop(group.id, mine, 180))) return
    }
    motion.value = null
    await animateLine(group.id, mine)
  }

  return { progress, motion, plotOf, startPlot, genLine, stop }
}

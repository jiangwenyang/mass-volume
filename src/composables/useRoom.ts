import { computed, ref } from 'vue'
import type { CellField, ClientMessage, RoomState, ServerInfo, ServerMessage } from '../types'

/** 还没发出去的单元格，避免服务回包把正在输入的数字盖掉 */
interface PendingCell {
  groupId: string
  row: number
  field: CellField
  value: number | null
  timer: number
}

const room = ref<RoomState | null>(null)
const info = ref<ServerInfo>({ port: 0, ips: [] })
const clients = ref(0)
const joined = ref<Record<string, number>>({})
const connected = ref(false)
const notice = ref('')
const needsConfirm = ref(false)
const flashes = ref<string[]>([])
const saving = ref(false)
let flashTimer = 0

let socket: WebSocket | null = null
let started = false
let closed = false
let retryMs = 400
let noticeTimer = 0
/** 平板当前选中的组。教师端保持 undefined，不参与“已加入” */
let heldSeat: string | null | undefined
const pending = new Map<string, PendingCell>()

/**
 * 单元格在待发送表里的键。
 * @param groupId - 组 id
 * @param row - 行下标
 * @param field - 体积或质量
 * @returns 唯一键
 */
const cellKey = (groupId: string, row: number, field: CellField): string => `${groupId}:${row}:${field}`

/**
 * 短暂显示一条提示。
 * @param message - 提示文字
 */
const showNotice = (message: string): void => {
  notice.value = message
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
  }, 3200)
}

/**
 * 把待发送的格子盖回本地状态，防止回包冲掉输入。
 * @param state - 服务发来的房间
 * @returns 盖好待发送值之后的房间
 */
const overlayPending = (state: RoomState): RoomState => {
  if (!pending.size) return state
  const groups = state.groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({ ...row })),
  }))
  for (const item of pending.values()) {
    const group = groups.find((entry) => entry.id === item.groupId)
    const row = group?.rows[item.row]
    if (!row) {
      pending.delete(cellKey(item.groupId, item.row, item.field))
      continue
    }
    row[item.field] = item.value
  }
  return { ...state, groups }
}

/**
 * 立刻改本地格子，输入不用等网络。
 * @param groupId - 组 id
 * @param row - 行下标
 * @param field - 体积或质量
 * @param value - 新值
 */
const applyLocal = (groupId: string, row: number, field: CellField, value: number | null): void => {
  const current = room.value
  if (!current) return
  room.value = {
    ...current,
    groups: current.groups.map((group) => {
      if (group.id !== groupId) return group
      return {
        ...group,
        rows: group.rows.map((item, index) => (index === row ? { ...item, [field]: value } : item)),
      }
    }),
  }
}

/**
 * 发送一条指令。连接还没好时先丢弃，重连后会收到全量状态。
 * @param message - 客户端指令
 */
const send = (message: ClientMessage): void => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

/**
 * 标出别人刚改过的格子，自己正在输入的不闪。
 * @param previous - 当前画面上的房间
 * @param next - 服务发来的房间
 */
const markFlash = (previous: RoomState | null, next: RoomState): void => {
  if (!previous) return
  const keys: string[] = []
  for (const group of next.groups) {
    const old = previous.groups.find((item) => item.id === group.id)
    group.rows.forEach((row, index) => {
      const before = old?.rows[index]
      if (!before) return
      ;(['v', 'm'] as const).forEach((field) => {
        if (before[field] !== row[field] && !pending.has(cellKey(group.id, index, field))) {
          keys.push(cellKey(group.id, index, field))
        }
      })
    })
  }
  if (!keys.length) return
  flashes.value = keys
  window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => {
    flashes.value = []
  }, 800)
}

const handleMessage = (message: ServerMessage): void => {
  if (message.type === 'state') {
    markFlash(room.value, message.state)
    room.value = overlayPending(message.state)
    return
  }
  if (message.type === 'presence') {
    clients.value = message.clients
    const next: Record<string, number> = {}
    for (const item of message.joined ?? []) next[item.groupId] = item.count
    joined.value = next
    return
  }
  if (message.code === 'needs-confirm') needsConfirm.value = true
  showNotice(message.message)
}

/**
 * 读取局域网地址。
 */
const loadInfo = async (): Promise<void> => {
  try {
    const response = await fetch('/api/info')
    if (!response.ok) return
    info.value = (await response.json()) as ServerInfo
  } catch {
    /* 服务还没起来时会失败，等重连后再读 */
  }
}

/**
 * 建立 WebSocket，断开后自动重连。
 */
const connect = (): void => {
  if (closed) return
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const next = new WebSocket(`${protocol}://${location.host}/ws`)
  socket = next
  next.onopen = () => {
    connected.value = true
    retryMs = 400
    void loadInfo()
    if (heldSeat !== undefined) send({ type: 'seat', groupId: heldSeat })
  }
  next.onmessage = (event: MessageEvent<string>) => {
    try {
      handleMessage(JSON.parse(event.data) as ServerMessage)
    } catch {
      /* 忽略无法解析的帧 */
    }
  }
  next.onclose = () => {
    if (socket === next) socket = null
    connected.value = false
    if (closed) return
    window.setTimeout(connect, retryMs)
    retryMs = Math.min(5000, retryMs * 1.6)
  }
}

/**
 * 保证全应用只连一次服务。
 */
const ensureStarted = (): void => {
  if (started) return
  started = true
  connect()
}

/**
 * 教室房间：实时状态、在线人数和写入操作。
 * @returns 响应式房间和操作函数
 */
export const useRoom = () => {
  ensureStarted()

  /**
   * 提交一个单元格，150 毫秒内的连续输入合并成一次。
   * @param groupId - 组 id
   * @param row - 行下标
   * @param field - 体积或质量
   * @param value - 新值，空为 null
   */
  const patchCell = (groupId: string, row: number, field: CellField, value: number | null): void => {
    const key = cellKey(groupId, row, field)
    const previous = pending.get(key)
    if (previous) window.clearTimeout(previous.timer)
    applyLocal(groupId, row, field, value)
    const timer = window.setTimeout(() => {
      pending.delete(key)
      saving.value = pending.size > 0
      send({ type: 'patch', groupId, row, field, value })
    }, 150)
    pending.set(key, { groupId, row, field, value, timer })
    saving.value = true
  }

  /**
   * 给一组加一行。
   * @param groupId - 组 id
   */
  const addRow = (groupId: string): void => {
    send({ type: 'row-add', groupId })
  }

  /**
   * 删掉一组里的一行。
   * @param groupId - 组 id
   * @param row - 行下标
   */
  const removeRow = (groupId: string, row: number): void => {
    send({ type: 'row-remove', groupId, row })
  }

  /**
   * 设置组数和组名。
   * @param count - 目标组数
   * @param names - 按顺序的组名
   * @param force - 是否允许删掉已填写的末组
   */
  const setGroups = (count: number, names: string[], force: boolean): void => {
    needsConfirm.value = false
    send({ type: 'set-groups', count, names, force })
  }

  /**
   * 清空所有单元格。
   */
  const resetData = (): void => {
    send({ type: 'reset' })
  }

  /**
   * 载入原型中的 9 组示例。
   */
  const loadSample = (): void => {
    send({ type: 'sample' })
  }

  /**
   * 告诉服务这台平板正在哪一组。传 null 表示回到选组页。
   * @param groupId - 组 id，离开时为空
   */
  const claimSeat = (groupId: string | null): void => {
    heldSeat = groupId
    send({ type: 'seat', groupId })
  }

  /**
   * 关掉“需要确认”标记，方便对话框重复打开。
   */
  const clearConfirm = (): void => {
    needsConfirm.value = false
  }

  const statusText = computed(() => {
    if (!connected.value) return '正在连接'
    return '服务已就绪'
  })

  return {
    room,
    info,
    clients,
    joined,
    connected,
    notice,
    needsConfirm,
    flashes,
    saving,
    statusText,
    patchCell,
    addRow,
    removeRow,
    setGroups,
    resetData,
    loadSample,
    claimSeat,
    clearConfirm,
  }
}

/**
 * 教师页自己的主机名。服务没有报出地址时（网页部署），平板用它加入。
 * @returns 主机名；本机回环地址对平板无用，返回空串
 */
export const pageHost = (): string => {
  const host = location.hostname
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) ? '' : host
}

/**
 * 拼出平板要打开的学生页地址。
 * @param ip - 局域网 IPv4
 * @returns 带当前页面端口的学生页链接
 */
export const joinUrl = (ip: string): string => {
  const port = location.port ? `:${location.port}` : ''
  return `${location.protocol}//${ip}${port}/s`
}

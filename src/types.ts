/** 体积或质量字段 */
export type CellField = 'v' | 'm'

/** 一行实验数据。空着的格子是 null */
export interface Row {
  v: number | null
  m: number | null
}

/** 一个实验组 */
export interface Group {
  id: string
  name: string
  rows: Row[]
}

/** 教室里同步的全部数据 */
export interface RoomState {
  groups: Group[]
  nextId: number
  updatedAt: number
}

/** 服务公布的本机地址 */
export interface ServerInfo {
  port: number
  ips: string[]
}

/** 图像上的一个有效点 */
export interface Point {
  x: number
  y: number
}

/** 发给服务的指令 */
export type ClientMessage =
  | { type: 'patch'; groupId: string; row: number; field: CellField; value: number | null }
  | { type: 'row-add'; groupId: string }
  | { type: 'row-remove'; groupId: string; row: number }
  | { type: 'set-groups'; count: number; force: boolean; names?: string[] }
  | { type: 'reset' }
  | { type: 'sample' }
  | { type: 'seat'; groupId: string | null }

/** 某个组当前有几台平板停在填写页 */
export interface JoinedGroup {
  groupId: string
  count: number
}

/** 服务推过来的消息 */
export type ServerMessage =
  | { type: 'state'; state: RoomState }
  | { type: 'presence'; clients: number; joined?: JoinedGroup[] }
  | { type: 'error'; code: string; message: string }

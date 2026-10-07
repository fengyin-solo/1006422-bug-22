/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  // 逐级流转表：当前状态允许去往的状态。不配置则沿用旧的宽松动作；
  // 余热锅炉配置后只能 待投运 → 运行中 → 已停运 → 检修中，不能跳级。
  transitions?: Record<string, string[]>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
  // 余热锅炉统一口径：与锅炉台账页、设备检修页读的是同一份判定结果。
  boiler: { status: string; count: number }[]
  boilerTotal: number
  boilerOverTemp: number
}

// 历史锅炉记录是「当时的结论」：落表后只追加不改写，展示口径后续调整也不回算。
export type BoilerHistoryEvent = {
  time: string
  code: string
  action: string
  fromStatus: string
  toStatus: string
  steamTemp: number | null
  overTempConclusion: '超限' | '正常'
  note: string
}

import { listRows, saveRows } from './local-store'
import type { EntryRow } from './types'

// 余热锅炉统一口径：列表、详情、运营概览、检修待安排清单都从这里读数，各处不再各算一遍。

export const BOILER_MODULE_KEY = 'boiler'
export const OVERHAUL_MODULE_KEY = 'overhaul'

export const BOILER_STATUSES = ['待投运', '运行中', '已停运', '检修中'] as const
export type BoilerStatus = (typeof BOILER_STATUSES)[number]

// 锅炉编号 / 关键参数字段名，整块代码里只用这一份常量。
export const BOILER_CODE_FIELD = '锅炉编号'
export const BOILER_PRESSURE_FIELD = '主蒸汽压力'
export const BOILER_TEMP_FIELD = '主蒸汽温度'
export const BOILER_FLOW_FIELD = '给水流量'
export const BOILER_STATUS_FIELD = '锅炉状态'
export const RECORD_TIME_FIELD = '记录时间'

// 主蒸汽温度报警限值（℃），实测值超过即高亮。
export const STEAM_TEMP_LIMIT = 450

// 状态只能顺向走一级：待投运 → 运行中 → 已停运 → 检修中。
const NEXT_ACTION: Record<BoilerStatus, string | null> = {
  待投运: '提交投运',
  运行中: '登记停运',
  已停运: '安排检修',
  检修中: null,
}

// 动作对应的目标状态，与模块元数据 actionTargets 保持一致。
const ACTION_TARGET: Record<string, BoilerStatus> = {
  提交投运: '运行中',
  登记停运: '已停运',
  安排检修: '检修中',
}

// 同步到检修模块时的字段与标记（标记字段不影响检修页原有的列与导出）。
export const OVERHAUL_CODE_FIELD = '检修编号'
export const OVERHAUL_EQUIPMENT_FIELD = '检修设备'
export const OVERHAUL_TYPE_FIELD = '检修类别'
export const OVERHAUL_TEAM_FIELD = '检修班组'
const SYNC_SOURCE_FIELD = '同步来源'
const SYNC_BOILER_FIELD = '来源锅炉编号'
const SYNC_SOURCE_TAG = '余热锅炉'

export type CanonicalBoiler = {
  row: EntryRow
  boilerCode: string
  status: BoilerStatus
  pressure: string
  temperature: number | null
  temperatureText: string
  feedFlow: string
  recordTime: string
  overTemp: boolean
}

export type BoilerStatusCounts = Record<BoilerStatus, number>

function normalizeStatus(value: unknown): BoilerStatus {
  return (BOILER_STATUSES as readonly string[]).includes(String(value))
    ? (String(value) as BoilerStatus)
    : '待投运'
}

export function parseSteamTemperature(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  const matched = String(value ?? '').match(/-?\d+(\.\d+)?/)
  return matched ? Number(matched[0]) : null
}

export function isOverTemp(value: unknown): boolean {
  const temp = parseSteamTemperature(value)
  return temp !== null && temp > STEAM_TEMP_LIMIT
}

// 锅炉编号固定升序；编号相同（重复登记）按记录 id 升序，保证每次进入页面顺序一致。
export function compareBoilerCode(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hans-CN', { numeric: true })
}

function toCanonical(row: EntryRow): CanonicalBoiler {
  const temperatureText = String(row[BOILER_TEMP_FIELD] ?? '')
  const temperature = parseSteamTemperature(temperatureText)
  return {
    row,
    boilerCode: String(row[BOILER_CODE_FIELD] ?? ''),
    status: normalizeStatus(row.status),
    pressure: String(row[BOILER_PRESSURE_FIELD] ?? ''),
    temperature,
    temperatureText,
    feedFlow: String(row[BOILER_FLOW_FIELD] ?? ''),
    recordTime: String(row[RECORD_TIME_FIELD] ?? ''),
    overTemp: temperature !== null && temperature > STEAM_TEMP_LIMIT,
  }
}

/**
 * 读取锅炉台账原始记录（含历史登记），并就地校准展示口径：
 * 落库的 status 与「锅炉状态」字段保持一致，列表页读到的就是落库结论；
 * 历史记录按当时结论保留，不删除、不改写其当时的状态判定。
 */
export function boilerLedgerRows(): EntryRow[] {
  const rows = [...listRows(BOILER_MODULE_KEY)]
  let changed = false
  for (const row of rows) {
    const status = normalizeStatus(row.status)
    const pending = status !== '检修中'
    const expectedStatusField = String(row[BOILER_STATUS_FIELD] ?? '')
    const validField = (BOILER_STATUSES as readonly string[]).includes(expectedStatusField)
    if (
      row.status !== status ||
      row.pending !== pending ||
      !validField ||
      expectedStatusField !== status
    ) {
      row.status = status
      row.pending = pending
      row[BOILER_STATUS_FIELD] = status
      changed = true
    }
  }
  if (changed) {
    saveRows(BOILER_MODULE_KEY, rows)
  }
  // 明细台账：按锅炉编号升序，编号相同按登记次序（id）。
  rows.sort((a, b) => {
    const byCode = compareBoilerCode(
      String(a[BOILER_CODE_FIELD] ?? ''),
      String(b[BOILER_CODE_FIELD] ?? ''),
    )
    return byCode !== 0 ? byCode : Number(a.id) - Number(b.id)
  })
  return rows
}

/** 全部登记记录（含同一编号的历史登记），按统一顺序排列。 */
export function allCanonicalBoilers(): CanonicalBoiler[] {
  return boilerLedgerRows().map(toCanonical)
}

/**
 * 唯一锅炉：同一锅炉编号重复登记只算一次，保留最新一条登记（id 最大）作为当前结论；
 * 旧记录仍完整保留在明细台账里。
 */
export function currentBoilers(): CanonicalBoiler[] {
  const latestByCode = new Map<string, CanonicalBoiler>()
  for (const item of allCanonicalBoilers()) {
    const existed = latestByCode.get(item.boilerCode)
    if (!existed || Number(item.row.id) > Number(existed.row.id)) {
      latestByCode.set(item.boilerCode, item)
    }
  }
  return [...latestByCode.values()].sort((a, b) => compareBoilerCode(a.boilerCode, b.boilerCode))
}

function emptyCounts(): BoilerStatusCounts {
  return { 待投运: 0, 运行中: 0, 已停运: 0, 检修中: 0 }
}

/** 四个状态的在役台数，运营概览与锅炉页共用这份结果。 */
export function boilerStatusCounts(): BoilerStatusCounts {
  const counts = emptyCounts()
  for (const item of currentBoilers()) {
    counts[item.status] += 1
  }
  return counts
}

export function boilerOverTempCount(): number {
  return currentBoilers().filter((item) => item.overTemp).length
}

/** 当前状态允许执行的下一个动作；已到检修中或不是最新登记的记录不允许再流转。 */
export function nextBoilerAction(status: BoilerStatus): string | null {
  return NEXT_ACTION[status]
}

/** 校验锅炉状态流转：只能顺向走一级，不能跳级也不能回退。 */
export function checkBoilerTransition(
  current: string,
  action: string,
): { ok: true; target: BoilerStatus } | { ok: false; message: string } {
  if (!(BOILER_STATUSES as readonly string[]).includes(current)) {
    return { ok: false, message: `当前锅炉状态「${current}」不在统一口径内，请先校准台账` }
  }
  const status = current as BoilerStatus
  const expectedAction = NEXT_ACTION[status]
  if (!expectedAction) {
    return { ok: false, message: '锅炉已处于「检修中」，状态流转到此结束' }
  }
  if (action !== expectedAction) {
    const target = ACTION_TARGET[action]
    if (target) {
      const targetIndex = BOILER_STATUSES.indexOf(target)
      const currentIndex = BOILER_STATUSES.indexOf(status)
      if (targetIndex > currentIndex + 1) {
        return {
          ok: false,
          message: `锅炉状态只能从「${status}」顺向走到下一级，不允许从「${status}」直接跳到「${target}」`,
        }
      }
      if (targetIndex <= currentIndex) {
        return { ok: false, message: `锅炉状态只能顺向推进，不能从「${status}」回退到「${target}」` }
      }
    }
    return { ok: false, message: `「${status}」的锅炉只能执行「${expectedAction}」，不能${action}` }
  }
  return { ok: true, target: BOILER_STATUSES[BOILER_STATUSES.indexOf(status) + 1] }
}

/** 找到某台锅炉当前（最新一条）登记；历史登记返回 null。 */
export function findCurrentBoiler(id: number): CanonicalBoiler | null {
  return currentBoilers().find((item) => Number(item.row.id) === id) ?? null
}

function isSyncedOverhaulRow(row: EntryRow): boolean {
  return String(row[SYNC_SOURCE_FIELD] ?? '') === SYNC_SOURCE_TAG
}

/**
 * 把「检修中」的锅炉同步到检修模块的待安排清单（待开工）。
 * 幂等：同一台炉只挂一条；检修那边已提交开工/完工的记录不动，按当时结论保留。
 */
export function syncMaintenanceToOverhaul(): EntryRow[] {
  const rows = [...listRows(OVERHAUL_MODULE_KEY)]
  let changed = false
  let nextId = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1

  for (const boiler of currentBoilers()) {
    if (boiler.status !== '检修中') {
      continue
    }
    const linked = rows.find(
      (row) =>
        isSyncedOverhaulRow(row) && String(row[SYNC_BOILER_FIELD] ?? '') === boiler.boilerCode,
    )
    if (linked) {
      continue
    }
    const code = `OVER-BOIL-${boiler.boilerCode}`
    rows.push({
      id: nextId++,
      status: '待开工',
      pending: true,
      abnormal: false,
      [OVERHAUL_CODE_FIELD]: code,
      [OVERHAUL_EQUIPMENT_FIELD]: `余热锅炉 ${boiler.boilerCode}`,
      [OVERHAUL_TYPE_FIELD]: '锅炉检修',
      [OVERHAUL_TEAM_FIELD]: '待安排',
      计划工期: '待安排',
      完工日期: '',
      更换备件: '待安排',
      检修状态: '待开工',
      [SYNC_SOURCE_FIELD]: SYNC_SOURCE_TAG,
      [SYNC_BOILER_FIELD]: boiler.boilerCode,
    })
    changed = true
  }

  if (changed) {
    saveRows(OVERHAUL_MODULE_KEY, rows)
  }
  return rows
}

export type MaintenancePendingItem = {
  boilerCode: string
  pressure: string
  feedFlow: string
  recordTime: string
  overTemp: boolean
  overhaulStatus: string
}

/**
 * 检修页的「锅炉检修待安排清单」：
 * 检修中的锅炉逐台列出，能看到检修单是否已安排（待开工/检修中/已完工）。
 */
export function maintenancePendingList(): MaintenancePendingItem[] {
  const overhaulRows = syncMaintenanceToOverhaul()
  const statusByCode = new Map<string, string>()
  for (const row of overhaulRows) {
    if (!isSyncedOverhaulRow(row)) {
      continue
    }
    const code = String(row[SYNC_BOILER_FIELD] ?? '')
    const status = String(row.status ?? '')
    // 同一台炉若有多条同步记录，展示流转最靠后的结论。
    const existed = statusByCode.get(code)
    if (!existed || status === '已完工' || (status === '检修中' && existed === '待开工')) {
      statusByCode.set(code, status)
    }
  }
  return currentBoilers()
    .filter((item) => item.status === '检修中')
    .map((item) => ({
      boilerCode: item.boilerCode,
      pressure: item.pressure,
      feedFlow: item.feedFlow,
      recordTime: item.recordTime,
      overTemp: item.overTemp,
      overhaulStatus: statusByCode.get(item.boilerCode) ?? '待开工',
    }))
}

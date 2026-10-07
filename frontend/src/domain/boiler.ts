import { BOILER_HISTORY_SEED } from '@/data/boiler-history-seed'
import { listRows, readJson, saveRows, writeJson } from '@/data/local-store'
import type { BoilerHistoryEvent, EntryRow } from '@/data/types'

/**
 * 余热锅炉统一展示口径（唯一事实来源）。
 * 锅炉台账页的块/明细、运营概览、检修待安排清单都从这里读数，
 * 避免各页面各算一遍导致总数、状态、顺序三处对不上。
 */

export const BOILER_KEY = 'boiler'
export const OVERHAUL_KEY = 'overhaul'
export const CODE_FIELD = '锅炉编号'
export const STATUS_FIELD = '锅炉状态'

// 状态顺序即唯一允许的流转顺序，只能顺着走一步，不能跳级、不能回退。
export const BOILER_STATUSES = ['待投运', '运行中', '已停运', '检修中'] as const
export type BoilerStatus = (typeof BOILER_STATUSES)[number]

export const STEAM_TEMP_LIMIT = 450 // ℃：主蒸汽温度超过该值在块里高亮
export const PRESSURE_UNIT = 'MPa'
export const FEEDWATER_UNIT = 't/h'
export const TEMP_UNIT = '℃'

// 各状态对应唯一的下一步动作；末态「检修中」没有后续动作。
export const NEXT_ACTION: Record<string, string> = {
  待投运: '提交投运',
  运行中: '登记停运',
  已停运: '安排检修',
}

export function nextActionOf(status: BoilerStatus): string {
  return NEXT_ACTION[status] ?? ''
}

const HISTORY_KEY = 'waste-to-energy-plant:boiler-history:v1'

export type BoilerUnit = {
  row: EntryRow
  id: number
  code: string
  status: BoilerStatus
  pressure: number
  steamTemp: number
  feedwater: number
  overTemp: boolean
}

export type BoilerRoster = {
  units: BoilerUnit[] // 按锅炉编号稳定排序、已去重（同一编号只算一次）
  duplicates: { row: EntryRow; code: string; keptId: number }[] // 被去重掉的重复登记
  total: number
  byStatus: Record<BoilerStatus, BoilerUnit[]>
  counts: Record<BoilerStatus, number>
  overTempCount: number
}

export type RegisterInput = {
  code: string
  pressure: number
  steamTemp: number
  feedwater: number
  shift: string
}

export type BoilerActionResult = { ok: boolean; message: string }

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  const matched = String(value ?? '').match(/-?\d+(\.\d+)?/)
  return matched ? Number(matched[0]) : 0
}

// 编号里抽出数字段做自然排序，抽不到的退化成字符串比较；同编号以登记 id 兜底，顺序恒定。
export function compareCode(a: string, b: string): number {
  const na = a.match(/(\d+)\s*$/)
  const nb = b.match(/(\d+)\s*$/)
  if (na && nb) {
    const diff = Number(na[1]) - Number(nb[1])
    if (diff !== 0) {
      return diff
    }
  }
  return a.localeCompare(b, 'zh-Hans-CN', { numeric: true })
}

function normalizeStatus(raw: unknown): BoilerStatus {
  return (BOILER_STATUSES as readonly string[]).includes(String(raw))
    ? (String(raw) as BoilerStatus)
    : '待投运'
}

// 落库状态与页面读取状态必须一致：以 status 为准，把行内「锅炉状态」文本字段同步修正后回写。
function reconcileRows(): EntryRow[] {
  const rows = listRows(BOILER_KEY)
  let dirty = false
  const next = rows.map((row) => {
    const status = normalizeStatus(row.status)
    const textField = String(row[STATUS_FIELD] ?? '')
    if (status !== row.status || textField !== status) {
      dirty = true
      return { ...row, status, [STATUS_FIELD]: status }
    }
    return row
  })
  if (dirty) {
    saveRows(BOILER_KEY, next)
  }
  return next
}

function toUnit(row: EntryRow): BoilerUnit {
  const steamTemp = toNumber(row['主蒸汽温度'])
  return {
    row,
    id: Number(row.id),
    code: String(row[CODE_FIELD] ?? ''),
    status: normalizeStatus(row.status),
    pressure: toNumber(row['主蒸汽压力']),
    steamTemp,
    feedwater: toNumber(row['给水流量']),
    overTemp: steamTemp > STEAM_TEMP_LIMIT,
  }
}

// 锅炉判为检修中后，检修侧必须有一条对应的「待开工」单（待安排清单），幂等补录，不多不少。
export function syncOverhaulPending(units: BoilerUnit[]): void {
  const rows = listRows(OVERHAUL_KEY)
  const linked = new Set(
    rows
      .filter((row) => row['来源模块'] === BOILER_KEY)
      .map((row) => String(row['来源编号'] ?? '')),
  )
  let nextSeq = 0
  for (const row of rows) {
    const matched = String(row['检修编号'] ?? '').match(/(\d+)\s*$/)
    if (matched) {
      nextSeq = Math.max(nextSeq, Number(matched[1]))
    }
  }
  let nextId = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0)
  const additions: EntryRow[] = []
  for (const unit of units) {
    if (unit.status !== '检修中' || linked.has(unit.code)) {
      continue
    }
    nextSeq += 1
    nextId += 1
    additions.push({
      id: nextId,
      status: '待开工',
      pending: true,
      abnormal: false,
      检修编号: `OVER-${String(nextSeq).padStart(4, '0')}`,
      检修设备: `余热锅炉 ${unit.code}`,
      检修类别: '停炉检修',
      检修班组: '锅炉检修班',
      计划工期: '3天',
      完工日期: '—',
      更换备件: '—',
      检修状态: '待开工',
      来源模块: BOILER_KEY,
      来源编号: unit.code,
    })
  }
  if (additions.length > 0) {
    saveRows(OVERHAUL_KEY, [...rows, ...additions])
  }
}

// 统一口径入口：明细台账、看板块、运营概览、检修清单全部调它。
export function boilerRoster(): BoilerRoster {
  const rows = reconcileRows()
  const sortedById = [...rows].sort((a, b) => Number(a.id) - Number(b.id))

  const kept = new Map<string, EntryRow>()
  const duplicates: BoilerRoster['duplicates'] = []
  for (const row of sortedById) {
    const code = String(row[CODE_FIELD] ?? '')
    const existing = kept.get(code)
    if (existing) {
      // 同一锅炉编号重复登记只算一次：保留首次登记那条，其余列入重复登记备查。
      duplicates.push({ row, code, keptId: Number(existing.id) })
    } else {
      kept.set(code, row)
    }
  }

  const units = [...kept.values()]
    .map(toUnit)
    .sort((a, b) => compareCode(a.code, b.code) || a.id - b.id)

  const byStatus = {
    待投运: [],
    运行中: [],
    已停运: [],
    检修中: [],
  } as Record<BoilerStatus, BoilerUnit[]>
  for (const unit of units) {
    byStatus[unit.status].push(unit)
  }
  const counts = {
    待投运: byStatus['待投运'].length,
    运行中: byStatus['运行中'].length,
    已停运: byStatus['已停运'].length,
    检修中: byStatus['检修中'].length,
  } as Record<BoilerStatus, number>

  syncOverhaulPending(units)

  return {
    units,
    duplicates,
    total: units.length,
    byStatus,
    counts,
    overTempCount: units.filter((unit) => unit.overTemp).length,
  }
}

// 锅炉编号检索（编号是唯一键）。
export function findUnit(code: string): BoilerUnit | undefined {
  return boilerRoster().units.find((unit) => unit.code === code)
}

export function boilerHistory(): BoilerHistoryEvent[] {
  return readJson<BoilerHistoryEvent[]>(HISTORY_KEY, BOILER_HISTORY_SEED)
}

function appendHistory(event: BoilerHistoryEvent): void {
  writeJson(HISTORY_KEY, [event, ...boilerHistory()])
}

function nowText(): string {
  const stamp = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(
    stamp.getHours(),
  )}:${pad(stamp.getMinutes())}`
}

function todayText(): string {
  return nowText().slice(0, 10)
}

// 登记新锅炉：编号重复直接拒绝——同一编号重复登记只算一次。
export function registerBoiler(input: RegisterInput): BoilerActionResult {
  const code = input.code.trim().toUpperCase()
  if (!code) {
    return { ok: false, message: '锅炉编号不能为空' }
  }
  if (boilerRoster().units.some((unit) => unit.code === code)) {
    return { ok: false, message: `锅炉编号 ${code} 已登记，重复登记只算一次，未写入台账` }
  }
  const rows = listRows(BOILER_KEY)
  const nextId = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const steamTemp = Number(input.steamTemp) || 0
  const row: EntryRow = {
    id: nextId,
    status: '待投运',
    pending: true,
    abnormal: false,
    [CODE_FIELD]: code,
    主蒸汽压力: Number(input.pressure) || 0,
    主蒸汽温度: steamTemp,
    给水流量: Number(input.feedwater) || 0,
    排污量: 0,
    运行班次: input.shift.trim() || '未排班',
    记录时间: todayText(),
    [STATUS_FIELD]: '待投运',
  }
  saveRows(BOILER_KEY, [...rows, row])
  appendHistory({
    time: nowText(),
    code,
    action: '登记台账',
    fromStatus: '—',
    toStatus: '待投运',
    steamTemp: steamTemp > 0 ? steamTemp : null,
    overTempConclusion: steamTemp > STEAM_TEMP_LIMIT ? '超限' : '正常',
    note: '新登记入库，待投运',
  })
  return { ok: true, message: `锅炉 ${code} 已登记，当前状态「待投运」` }
}

// 锅炉状态流转：只能顺着走一步（待投运→运行中→已停运→检修中），跳级或回退一律拒绝。
export function advanceBoiler(id: number): BoilerActionResult {
  const rows = listRows(BOILER_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的余热锅炉记录` }
  }
  const current = normalizeStatus(rows[index].status)
  const order = BOILER_STATUSES.indexOf(current)
  if (order < 0 || order >= BOILER_STATUSES.length - 1) {
    return { ok: false, message: '「检修中」是末态，不能再流转' }
  }
  const target = BOILER_STATUSES[order + 1]
  const action = NEXT_ACTION[current]
  const steamTemp = toNumber(rows[index]['主蒸汽温度'])
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== '检修中',
    abnormal: false,
    [STATUS_FIELD]: target, // 落库状态与列表页读到的状态同步
  }
  const next = [...rows]
  next[index] = updated
  saveRows(BOILER_KEY, next)
  const code = String(updated[CODE_FIELD] ?? '')
  appendHistory({
    time: nowText(),
    code,
    action,
    fromStatus: current,
    toStatus: target,
    steamTemp: steamTemp > 0 ? steamTemp : null,
    overTempConclusion: steamTemp > STEAM_TEMP_LIMIT ? '超限' : '正常',
    note: target === '检修中' ? '已同步检修待安排清单' : '逐级流转',
  })
  // 立即重算并同步检修待安排清单，保证检修页与锅炉页读到同一个判定结果。
  boilerRoster()
  return { ok: true, message: `锅炉 ${code} 已${action}，当前状态「${target}」` }
}

// 检修待安排清单：来自锅炉统一口径，检修侧不再自己按锅炉状态重算。
export function overhaulPendingBoilers(): BoilerUnit[] {
  return boilerRoster().byStatus['检修中']
}

export function exportRosterCsv(): { filename: string; content: string } {
  const roster = boilerRoster()
  const header = ['锅炉编号', '主蒸汽压力(MPa)', '主蒸汽温度(℃)', '给水流量(t/h)', '锅炉状态', '温度判定']
  const lines = [header.join(',')]
  for (const unit of roster.units) {
    lines.push(
      [
        unit.code,
        unit.pressure,
        unit.steamTemp,
        unit.feedwater,
        unit.status,
        unit.overTemp ? '超限' : '正常',
      ].join(','),
    )
  }
  return { filename: '余热锅炉统一台账.csv', content: `\uFEFF${lines.join('\n')}` }
}
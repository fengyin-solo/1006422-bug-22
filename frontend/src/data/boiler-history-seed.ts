import type { BoilerHistoryEvent } from './types'

// 余热锅炉历史记录：只追加、不回算。
// 展示口径改过之后，历史条目仍按当时的结论保留——
// 例如最后一条是旧口径（限值 440℃）下判出的「超限」，现在按 450℃ 的口径也不会被改写。
export const BOILER_HISTORY_SEED: BoilerHistoryEvent[] = [
  {
    time: '2026-10-02 08:20',
    code: 'BOIL-1001',
    action: '登记台账',
    fromStatus: '—',
    toStatus: '待投运',
    steamTemp: null,
    overTempConclusion: '正常',
    note: '首次登记入库',
  },
  {
    time: '2026-10-02 09:05',
    code: 'BOIL-1001',
    action: '提交投运',
    fromStatus: '待投运',
    toStatus: '运行中',
    steamTemp: 428.4,
    overTempConclusion: '正常',
    note: '升温并网',
  },
  {
    time: '2026-10-03 22:40',
    code: 'BOIL-1004',
    action: '安排检修',
    fromStatus: '已停运',
    toStatus: '检修中',
    steamTemp: 55.0,
    overTempConclusion: '正常',
    note: '按计划停炉检修，已同步检修待安排清单',
  },
  {
    time: '2026-10-05 14:12',
    code: 'BOIL-1006',
    action: '登记停运',
    fromStatus: '运行中',
    toStatus: '已停运',
    steamTemp: 182.7,
    overTempConclusion: '正常',
    note: '负荷低谷停运备用',
  },
  {
    time: '2026-10-06 10:31',
    code: 'BOIL-1003',
    action: '超限判定',
    fromStatus: '运行中',
    toStatus: '运行中',
    steamTemp: 453.2,
    overTempConclusion: '超限',
    note: '主蒸汽温度越过限值，台账高亮',
  },
  {
    time: '2026-09-28 16:02',
    code: 'BOIL-1007',
    action: '超限判定（旧口径）',
    fromStatus: '运行中',
    toStatus: '运行中',
    steamTemp: 446.9,
    overTempConclusion: '超限',
    note: '旧口径限值 440℃ 时判为超限，结论按当时保留，不按新口径回算',
  },
]

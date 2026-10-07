<template>
  <section class="page" data-module="overhaul">
    <header class="page-head">
      <div>
        <h2>设备检修管理</h2>
        <p class="page-desc">维护检修记录，围绕检修编号、检修设备、检修类别、检修班组做登记、筛选与状态流转；锅炉检修待安排清单与余热锅炉状态判定同源。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记检修记录</button>
        <button class="btn" type="button" @click="exportRows">导出设备检修清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <!-- 锅炉检修待安排清单：判定结果由锅炉状态统一同步过来，检修侧不再自己按锅炉状态重算 -->
    <section class="sync-panel">
      <header class="sync-head">
        <h3>锅炉检修待安排清单</h3>
        <span class="sync-hint">来源：余热锅炉台账中「检修中」的锅炉（共 {{ pendingItems.length }} 台），同一锅炉编号重复登记只算一次</span>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>锅炉编号</th>
            <th>主蒸汽压力</th>
            <th>给水流量</th>
            <th>主蒸汽温度</th>
            <th>判定时间</th>
            <th>检修单状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in pendingItems" :key="item.boilerCode" :class="{ 'row-alarm': item.overTemp }">
            <td>{{ item.boilerCode }}</td>
            <td>{{ item.pressure || '—' }}<em class="unit">MPa</em></td>
            <td>{{ item.feedFlow || '—' }}<em class="unit">t/h</em></td>
            <td :class="{ 'alarm-text': item.overTemp }">
              {{ item.overTemp ? '主蒸汽温度超限' : '正常' }}
            </td>
            <td>{{ item.recordTime || '—' }}</td>
            <td>
              <span class="tag" :class="overhaulTagClass(item.overhaulStatus)">{{ item.overhaulStatus }}</span>
            </td>
          </tr>
          <tr v-if="!pendingItems.length">
            <td colspan="6" class="empty-state">暂无判定为「检修中」的余热锅炉</td>
          </tr>
        </tbody>
      </table>
    </section>

    <h3 class="section-title">检修记录明细</h3>
    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>来源</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td>
            <span v-if="isSynced(row)" class="tag tag-current">锅炉状态同步</span>
            <span v-else class="tag tag-history">检修登记</span>
          </td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无检修记录数据，可先登记检修记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条检修记录；锅炉进入「检修中」后自动挂入上方待安排清单，历史检修结论保留不变</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  maintenancePendingList,
  syncMaintenanceToOverhaul,
} from '@/data/boiler-domain'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('overhaul')
const columns = ['检修编号', '检修设备', '检修类别', '检修班组', '计划工期', '完工日期', '更换备件', '检修状态']
const actions = ['提交开工', '确认完工', '申请延期']
const statuses = ['待开工', '检修中', '已完工', '已延期']

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const pendingItems = ref(maintenancePendingList())

const stats = computed(() => [
  { label: '待开工检修', value: rows.value.filter((row) => String(row.status) === '待开工').length },
  { label: '检修中记录', value: rows.value.filter((row) => String(row.status) === '检修中').length },
  { label: '锅炉待安排', value: pendingItems.value.length },
])

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function isSynced(row: EntryRow): boolean {
  return String(row['同步来源'] ?? '') === '余热锅炉'
}

function overhaulTagClass(status: string): string {
  if (status === '待开工') {
    return 'tag-pending'
  }
  if (status === '检修中') {
    return 'tag-running'
  }
  if (status === '已完工') {
    return 'tag-done'
  }
  return 'tag-history'
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '检修记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    // 先对齐锅炉状态判定结果，再读检修列表，两边台数始终一致。
    syncMaintenanceToOverhaul()
    pendingItems.value = maintenancePendingList()
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '检修列表读取失败'
  }
}

onMounted(reload)
</script>

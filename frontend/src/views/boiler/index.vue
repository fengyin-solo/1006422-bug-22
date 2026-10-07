<template>
  <section class="page" data-module="boiler">
    <header class="page-head">
      <div>
        <h2>余热锅炉运行管理</h2>
        <p class="page-desc">待投运、运行中、已停运、检修中的余热锅炉按锅炉编号并排列出；主蒸汽温度超过 {{ tempLimit }}℃ 的锅炉红色高亮。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记余热锅炉记录</button>
        <button class="btn" type="button" @click="exportRows">导出余热锅炉运行清单</button>
      </div>
    </header>

    <!-- 统一展示口径：四个状态分块，数量、块内锅炉、运营概览、检修清单都来自同一份逐台台账 -->
    <div class="stat-row">
      <article v-for="item in statusStats" :key="item.status" class="stat-card">
        <span class="stat-label">{{ item.status }}锅炉</span>
        <strong class="stat-value">{{ item.count }}</strong>
        <span class="stat-sub" v-if="item.status === '运行中'">主蒸汽温度超限 {{ overTempCount }} 台</span>
        <span class="stat-sub" v-else>在役台数（重复编号只算一台）</span>
      </article>
    </div>

    <section class="board">
      <div v-for="column in statusColumns" :key="column.status" class="board-column">
        <header class="board-column-head">
          <strong>{{ column.status }}</strong>
          <span class="board-count">{{ column.boilers.length }} 台</span>
        </header>
        <div v-if="!column.boilers.length" class="board-empty">暂无{{ column.status }}锅炉</div>
        <button
          v-for="boiler in column.boilers"
          :key="String(boiler.row.id)"
          type="button"
          class="boiler-card"
          :class="{ active: selectedId === boiler.row.id, alarm: boiler.overTemp }"
          @click="selectedId = boiler.row.id"
        >
          <div class="boiler-card-head">
            <strong>{{ boiler.boilerCode }}</strong>
            <span v-if="boiler.overTemp" class="tag tag-alarm">主蒸汽温度超限</span>
          </div>
          <dl class="boiler-metrics">
            <div><dt>主蒸汽压力</dt><dd>{{ boiler.pressure || '—' }}<em>MPa</em></dd></div>
            <div><dt>主蒸汽温度</dt><dd :class="{ 'alarm-text': boiler.overTemp }">{{ boiler.temperatureText || '—' }}<em>℃</em></dd></div>
            <div><dt>给水流量</dt><dd>{{ boiler.feedFlow || '—' }}<em>t/h</em></dd></div>
          </dl>
        </button>
      </div>
    </section>

    <!-- 详情面板：读的是块里同一条台账记录，块、明细、看板不会再读出三个值 -->
    <section class="detail-panel" v-if="selected">
      <header class="detail-head">
        <div>
          <strong>{{ selected.boilerCode }}</strong>
          <span class="tag" :class="`tag-status-${statusIndex(selected.status)}`">{{ selected.status }}</span>
          <span v-if="selected.overTemp" class="tag tag-alarm">主蒸汽温度超限（{{ selected.temperatureText }}℃ ＞ {{ tempLimit }}℃）</span>
        </div>
        <span class="detail-time">最近登记：{{ selected.recordTime || '—' }}</span>
      </header>
      <dl class="detail-metrics">
        <div><dt>主蒸汽压力</dt><dd>{{ selected.pressure || '—' }}<em>MPa</em></dd></div>
        <div><dt>主蒸汽温度</dt><dd :class="{ 'alarm-text': selected.overTemp }">{{ selected.temperatureText || '—' }}<em>℃</em></dd></div>
        <div><dt>给水流量</dt><dd>{{ selected.feedFlow || '—' }}<em>t/h</em></dd></div>
      </dl>
      <footer class="detail-actions">
        <span class="detail-hint">数值与下方明细台账逐台一致；状态只能顺向走到下一级，不允许跳级。</span>
        <button
          v-if="nextAction(selected.status)"
          class="btn primary"
          type="button"
          @click="runAction(String(nextAction(selected.status)), selected.row)"
        >
          {{ nextAction(selected.status) }}
        </button>
        <span v-else class="detail-hint">已到「检修中」，流转结束并同步至检修待安排清单</span>
      </footer>
    </section>

    <h3 class="section-title">明细台账（含历史登记，按锅炉编号固定排序）</h3>
    <p class="status-legend">
      <span v-for="item in statusStats" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
      <span class="legend-item legend-total">登记记录 {{ ledgerRows.length }} 条 / 在役锅炉 {{ current.length }} 台</span>
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
          <th>登记结论</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in ledgerView"
          :key="String(row.id)"
          :class="{ 'row-history': !isCurrent(row), 'row-alarm': isOverTemp(row[tempField]) }"
        >
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td>
            <span v-if="isCurrent(row)" class="tag tag-current">当前结论</span>
            <span v-else class="tag tag-history">历史登记保留</span>
          </td>
          <td class="row-actions">
            <template v-if="isCurrent(row)">
              <button
                v-if="nextAction(String(row.status))"
                class="link"
                type="button"
                @click="runAction(String(nextAction(String(row.status))), row)"
              >
                {{ nextAction(String(row.status)) }}
              </button>
              <span v-else class="muted-text">已到检修中</span>
            </template>
            <span v-else class="muted-text">历史登记不可操作</span>
          </td>
        </tr>
        <tr v-if="!ledgerView.length">
          <td :colspan="columns.length + 3" class="empty-state">暂无符合条件的余热锅炉记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ ledgerRows.length }} 条登记记录，在役锅炉 {{ current.length }} 台（同一锅炉编号重复登记只算一次，历史记录按当时结论保留）</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { downloadEntries, filterRows, runAction as applyAction } from '@/api/local-service'
import {
  BOILER_CODE_FIELD,
  BOILER_PRESSURE_FIELD,
  BOILER_STATUSES,
  BOILER_TEMP_FIELD,
  STEAM_TEMP_LIMIT,
  boilerLedgerRows,
  boilerStatusCounts,
  boilerOverTempCount,
  currentBoilers,
  isOverTemp,
  nextBoilerAction,
} from '@/data/boiler-domain'
import type { EntryRow } from '@/data/types'

const moduleKey = 'boiler'
const tempLimit = STEAM_TEMP_LIMIT
const tempField = BOILER_TEMP_FIELD
const columns = ['锅炉编号', '主蒸汽压力', '主蒸汽温度', '给水流量', '排污量', '运行班次', '记录时间']
const filterFields = [BOILER_CODE_FIELD, BOILER_PRESSURE_FIELD, BOILER_TEMP_FIELD]

const ledgerRows = ref<EntryRow[]>([])
const current = ref(currentBoilers().slice(0, 0))
const selectedId = ref<number | null>(null)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})

const statusStats = computed(() => {
  const counts = boilerStatusCounts()
  return BOILER_STATUSES.map((status) => ({ status, count: counts[status] }))
})

const overTempCount = computed(() => boilerOverTempCount())

const statusColumns = computed(() =>
  BOILER_STATUSES.map((status) => ({
    status,
    boilers: current.value.filter((item) => item.status === status),
  })),
)

const currentIds = computed(() => new Set(current.value.map((item) => Number(item.row.id))))

const selected = computed(() => {
  if (selectedId.value === null) {
    return current.value[0] ?? null
  }
  return current.value.find((item) => Number(item.row.id) === selectedId.value) ?? current.value[0] ?? null
})

const ledgerView = computed(() => filterRows(ledgerRows.value, filters.value))

function statusIndex(status: string): number {
  return BOILER_STATUSES.indexOf(status as (typeof BOILER_STATUSES)[number])
}

function nextAction(status: string): string | null {
  return nextBoilerAction(status as (typeof BOILER_STATUSES)[number])
}

function isCurrent(row: EntryRow): boolean {
  return currentIds.value.has(Number(row.id))
}

function resetFilters() {
  filters.value = {}
}

function exportRows() {
  downloadEntries(moduleKey)
}

function openCreate() {
  errorMessage.value = '余热锅炉记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(moduleKey, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  // 每次进入页面都按锅炉编号重新对齐：块、详情、明细共用同一读数，顺序固定不回跳。
  ledgerRows.value = boilerLedgerRows()
  current.value = currentBoilers()
  if (selectedId.value !== null && !current.value.some((item) => Number(item.row.id) === selectedId.value)) {
    selectedId.value = null
  }
}

onMounted(reload)
</script>

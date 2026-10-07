<template>
  <section class="page" data-module="boiler">
    <header class="page-head">
      <div>
        <h2>余热锅炉运行管理</h2>
        <p class="page-desc">
          统一展示口径：待投运、运行中、已停运、检修中的余热锅炉按锅炉编号并排列出，块、详情与运营概览同源；
          同一编号重复登记只算一次，主蒸汽温度超过 {{ tempLimit }}℃ 高亮。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="showRegister = true">登记余热锅炉</button>
        <button class="btn" type="button" @click="exportRoster">导出台账</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in countCards" :key="item.label" class="stat-card" :class="item.cls">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
        <span class="stat-sub">{{ item.sub }}</span>
      </article>
    </div>

    <!-- 四状态并排块：顺序按锅炉编号固定，重新进入页面不变 -->
    <div class="boiler-board">
      <section
        v-for="status in statuses"
        :key="status"
        class="boiler-column"
        :class="`is-${statusClass(status)}`"
      >
        <header class="column-head">
          <span class="column-title">{{ status }}</span>
          <span class="column-count">{{ roster.counts[status] }} 台</span>
        </header>
        <div class="column-body">
          <button
            v-for="unit in roster.byStatus[status]"
            :key="unit.id"
            type="button"
            class="boiler-card"
            :class="{ 'is-overtemp': unit.overTemp, 'is-active': selectedCode === unit.code }"
            @click="selectedCode = unit.code"
          >
            <span class="card-code">
              {{ unit.code }}
              <b v-if="unit.overTemp" class="overtemp-tag">温度超限</b>
            </span>
            <span class="card-metric">主蒸汽压力：{{ unit.pressure.toFixed(2) }} MPa</span>
            <span class="card-metric" :class="{ 'metric-alert': unit.overTemp }">
              主蒸汽温度：{{ unit.steamTemp.toFixed(1) }} ℃
            </span>
            <span class="card-metric">给水流量：{{ unit.feedwater.toFixed(1) }} t/h</span>
          </button>
          <p v-if="!roster.byStatus[status].length" class="column-empty">暂无</p>
        </div>
      </section>
    </div>

    <div class="boiler-main">
      <!-- 详情面板：与块、看板读的是同一个 BoilerUnit，不会出现三处三个值 -->
      <aside class="detail-panel">
        <h3>锅炉详情</h3>
        <template v-if="selected">
          <dl class="detail-list">
            <dt>锅炉编号</dt><dd>{{ selected.code }}</dd>
            <dt>当前状态</dt><dd>{{ selected.status }}</dd>
            <dt>主蒸汽压力</dt><dd>{{ selected.pressure.toFixed(2) }} MPa</dd>
            <dt>主蒸汽温度</dt>
            <dd :class="{ 'metric-alert': selected.overTemp }">
              {{ selected.steamTemp.toFixed(1) }} ℃
              <b v-if="selected.overTemp" class="overtemp-tag">超限</b>
            </dd>
            <dt>给水流量</dt><dd>{{ selected.feedwater.toFixed(1) }} t/h</dd>
            <dt>排污量</dt><dd>{{ num(selected.row['排污量']) }} t/h</dd>
            <dt>运行班次</dt><dd>{{ selected.row['运行班次'] ?? '—' }}</dd>
            <dt>记录时间</dt><dd>{{ selected.row['记录时间'] ?? '—' }}</dd>
            <dt>落库锅炉状态</dt><dd>{{ selected.row['锅炉状态'] ?? '—' }}</dd>
          </dl>
          <button
            v-if="nextAction(selected.status)"
            class="btn primary block-btn"
            type="button"
            @click="advance(selected.id)"
          >
            {{ nextAction(selected.status) }}
          </button>
          <p v-else class="column-empty">「检修中」为末态，不能再流转</p>
          <p v-if="message" class="message-text" :class="{ 'error-text': !lastOk }">{{ message }}</p>
        </template>
        <p v-else class="column-empty">点击左侧锅炉卡片查看逐台台账明细</p>
      </aside>

      <div class="ledger-wrap">
        <h3 class="section-title">台账明细（逐台核对）</h3>
        <table class="data-table ledger-table">
          <thead>
            <tr>
              <th>锅炉编号</th>
              <th>主蒸汽压力(MPa)</th>
              <th>主蒸汽温度(℃)</th>
              <th>给水流量(t/h)</th>
              <th>锅炉状态</th>
              <th>温度判定</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="unit in roster.units"
              :key="unit.id"
              :class="{ 'is-overtemp': unit.overTemp, 'is-active': selectedCode === unit.code }"
              @click="selectedCode = unit.code"
            >
              <td>{{ unit.code }}</td>
              <td>{{ unit.pressure.toFixed(2) }}</td>
              <td :class="{ 'metric-alert': unit.overTemp }">{{ unit.steamTemp.toFixed(1) }}</td>
              <td>{{ unit.feedwater.toFixed(1) }}</td>
              <td><span class="status-pill" :class="`is-${statusClass(unit.status)}`">{{ unit.status }}</span></td>
              <td>{{ unit.overTemp ? '超限' : '正常' }}</td>
            </tr>
          </tbody>
        </table>
        <footer class="page-foot">
          <span>
            在册 {{ roster.total }} 台 = 待投运 {{ roster.counts['待投运'] }} + 运行中
            {{ roster.counts['运行中'] }} + 已停运 {{ roster.counts['已停运'] }} + 检修中
            {{ roster.counts['检修中'] }}；温度超限 {{ roster.overTempCount }} 台
          </span>
        </footer>
      </div>
    </div>

    <section v-if="roster.duplicates.length" class="dup-section">
      <h3 class="section-title">重复登记（同一编号只算一次）</h3>
      <table class="data-table">
        <thead>
          <tr><th>重复记录号</th><th>锅炉编号</th><th>重复条状态</th><th>处理</th></tr>
        </thead>
        <tbody>
          <tr v-for="dup in roster.duplicates" :key="String(dup.row.id)">
            <td>#{{ dup.row.id }}</td>
            <td>{{ dup.code }}</td>
            <td>{{ dup.row.status }}</td>
            <td>不计入台账，保留首次登记 #{{ dup.keptId }} 的状态与测点</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="history-section">
      <h3 class="section-title">历史锅炉记录（按当时结论保留，不回算）</h3>
      <table class="data-table">
        <thead>
          <tr><th>时间</th><th>锅炉编号</th><th>事项</th><th>流转</th><th>当时温度(℃)</th><th>当时结论</th><th>备注</th></tr>
        </thead>
        <tbody>
          <tr v-for="(event, idx) in history" :key="`${event.time}-${event.code}-${idx}`">
            <td>{{ event.time }}</td>
            <td>{{ event.code }}</td>
            <td>{{ event.action }}</td>
            <td>{{ event.fromStatus }} → {{ event.toStatus }}</td>
            <td>{{ event.steamTemp === null ? '—' : event.steamTemp.toFixed(1) }}</td>
            <td>
              <span class="status-pill" :class="event.overTempConclusion === '超限' ? 'is-alert' : 'is-ok'">
                {{ event.overTempConclusion }}
              </span>
            </td>
            <td>{{ event.note }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <div v-if="showRegister" class="modal-mask" @click.self="showRegister = false">
      <form class="modal-card" @submit.prevent="submitRegister">
        <h3>登记余热锅炉</h3>
        <p class="page-desc">新锅炉一律从「待投运」起，状态只能逐级走到检修中。</p>
        <label class="form-item"><span>锅炉编号</span><input v-model="form.code" placeholder="如 BOIL-1008" /></label>
        <label class="form-item"><span>主蒸汽压力 (MPa)</span><input v-model.number="form.pressure" type="number" step="0.01" /></label>
        <label class="form-item"><span>主蒸汽温度 (℃)</span><input v-model.number="form.steamTemp" type="number" step="0.1" /></label>
        <label class="form-item"><span>给水流量 (t/h)</span><input v-model.number="form.feedwater" type="number" step="0.1" /></label>
        <label class="form-item"><span>运行班次</span><input v-model="form.shift" placeholder="甲班 / 乙班 / 丙班" /></label>
        <p v-if="registerMessage" class="error-text">{{ registerMessage }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="showRegister = false">取消</button>
          <button class="btn primary" type="submit">确认登记</button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  advanceBoiler,
  boilerHistory,
  boilerRoster,
  BOILER_STATUSES,
  exportRosterCsv,
  nextActionOf,
  registerBoiler,
  STEAM_TEMP_LIMIT,
  type BoilerStatus,
} from '@/domain/boiler'

const statuses = BOILER_STATUSES
const tempLimit = STEAM_TEMP_LIMIT

const tick = ref(0)
const selectedCode = ref<string>('')
const message = ref('')
const lastOk = ref(true)
const showRegister = ref(false)
const registerMessage = ref('')
const form = ref({ code: '', pressure: 0, steamTemp: 0, feedwater: 0, shift: '' })

// tick 只是为了流转、登记后强制重算；读数永远来自统一口径 boilerRoster()。
const roster = computed(() => {
  void tick.value
  return boilerRoster()
})
const history = computed(() => {
  void tick.value
  return boilerHistory()
})
const selected = computed(() =>
  roster.value.units.find((unit) => unit.code === selectedCode.value) ?? roster.value.units[0],
)

const countCards = computed(() => [
  { label: '在册锅炉', value: roster.value.total, sub: '同一编号只算一次', cls: '' },
  { label: '运行中锅炉', value: roster.value.counts['运行中'], sub: '与运营概览同源', cls: '' },
  { label: '检修中锅炉', value: roster.value.counts['检修中'], sub: '已同步检修待安排清单', cls: '' },
  { label: '温度超限', value: roster.value.overTempCount, sub: `主蒸汽温度 > ${tempLimit}℃`, cls: 'is-alert-card' },
])

function nextAction(status: BoilerStatus): string {
  return nextActionOf(status)
}

function statusClass(status: string): string {
  return { 待投运: 'idle', 运行中: 'running', 已停运: 'stopped', 检修中: 'repair' }[status] ?? 'idle'
}

function num(value: unknown): string {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n.toFixed(1) : '—'
}

function refresh() {
  tick.value += 1
}

function advance(id: number) {
  const result = advanceBoiler(id)
  message.value = result.message
  lastOk.value = result.ok
  if (result.ok) {
    refresh()
  }
}

function submitRegister() {
  const result = registerBoiler({ ...form.value })
  if (!result.ok) {
    registerMessage.value = result.message
    return
  }
  registerMessage.value = ''
  showRegister.value = false
  form.value = { code: '', pressure: 0, steamTemp: 0, feedwater: 0, shift: '' }
  message.value = result.message
  lastOk.value = true
  refresh()
}

function exportRoster() {
  const { filename, content } = exportRosterCsv()
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
</script>

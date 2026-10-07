<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常；余热锅炉投运情况与锅炉台账逐台对得上。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>

    <section class="sync-panel">
      <header class="sync-head">
        <h3>余热锅炉投运情况</h3>
        <span class="sync-hint">按锅炉编号并排列出，与锅炉台账、详情面板同一口径；主蒸汽温度超 {{ tempLimit }}℃ 高亮，重复编号只算一台</span>
      </header>
      <div class="board board-compact">
        <div v-for="column in boilerColumns" :key="column.status" class="board-column">
          <header class="board-column-head">
            <strong>{{ column.status }}</strong>
            <span class="board-count">{{ column.boilers.length }} 台</span>
          </header>
          <div v-if="!column.boilers.length" class="board-empty">暂无{{ column.status }}锅炉</div>
          <RouterLink
            v-for="boiler in column.boilers"
            :key="String(boiler.row.id)"
            :to="`/boiler?id=${boiler.row.id}`"
            class="boiler-card"
            :class="{ alarm: boiler.overTemp }"
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
          </RouterLink>
        </div>
      </div>
    </section>

    <h3 class="section-title">各业务模块登记情况</h3>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td :class="{ 'alarm-text': row.abnormal > 0 }">{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据；锅炉历史登记按当时结论保留，不计入在役台数</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { loadOverview } from '@/api/local-service'
import {
  BOILER_STATUSES,
  STEAM_TEMP_LIMIT,
  currentBoilers,
} from '@/data/boiler-domain'
import type { OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const tempLimit = STEAM_TEMP_LIMIT

const boilerColumns = ref(
  BOILER_STATUSES.map((status) => ({ status, boilers: currentBoilers().filter((item) => item.status === status) })),
)

function refresh() {
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  // 台数跟着运营概览一起重算：重新统计后块与明细仍是同一份逐台台账。
  const boilers = currentBoilers()
  boilerColumns.value = BOILER_STATUSES.map((status) => ({
    status,
    boilers: boilers.filter((item) => item.status === status),
  }))
}

onMounted(refresh)
</script>

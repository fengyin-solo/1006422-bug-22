<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
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

    <section class="sync-section">
      <h3 class="section-title">余热锅炉投运情况（统一口径）</h3>
      <p class="page-desc">
        与锅炉台账页的块、明细及检修待安排清单同源，按锅炉编号去重后逐台重算；点「重新统计」三处一起更新。
      </p>
      <div class="stat-row boiler-count-row">
        <article
          v-for="item in boilerCounts"
          :key="item.status"
          class="stat-card"
          :class="item.cls"
        >
          <span class="stat-label">{{ item.status }}</span>
          <strong class="stat-value">{{ item.count }}</strong>
          <span class="stat-sub">台</span>
        </article>
        <article class="stat-card is-alert-card">
          <span class="stat-label">主蒸汽温度超限</span>
          <strong class="stat-value">{{ boilerOverTemp }}</strong>
          <span class="stat-sub">台</span>
        </article>
      </div>
      <footer class="page-foot">
        <span>在册锅炉 {{ boilerTotal }} 台 = 四类状态之和（同一编号重复登记只算一次）</span>
      </footer>
    </section>

    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>
    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { loadOverview } from '@/api/local-service'
import type { OverviewResult } from '@/data/types'

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const boilerCountsRaw = ref<OverviewResult['boiler']>([])
const boilerTotal = ref(0)
const boilerOverTemp = ref(0)

const statusClass: Record<string, string> = {
  待投运: 'is-idle',
  运行中: 'is-running',
  已停运: 'is-stopped',
  检修中: 'is-repair',
}
const boilerCounts = computed(() =>
  boilerCountsRaw.value.map((item) => ({ ...item, cls: statusClass[item.status] ?? '' })),
)

function refresh() {
  // 列出来的台数跟着运营概览一起重算：loadOverview 内部走锅炉统一口径并同步检修清单。
  const payload = loadOverview()
  cards.value = payload.cards
  moduleRows.value = payload.modules
  boilerCountsRaw.value = payload.boiler
  boilerTotal.value = payload.boilerTotal
  boilerOverTemp.value = payload.boilerOverTemp
}

onMounted(refresh)
</script>

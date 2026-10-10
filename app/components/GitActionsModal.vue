<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
  PlayCircle,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Ban,
  MinusCircle,
  RefreshCw,
  ExternalLink,
  GitBranch,
  GitCommit,
  RotateCcw,
  X,
  Search,
  ChevronRight,
  ChevronDown,
  Layers,
  ShieldAlert,
  Radio
} from 'lucide-vue-next'
import { useGitHubActions } from '~/composables/useGitHubActions'
import { useProjectExplorer } from '~/composables/useProjectExplorer'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'
import { useAppDialog } from '~/composables/useAppDialog'
import type { GitHubActionRun, GitHubActionJob } from '~/types/terminal'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
  (e: 'open-settings', tab?: string): void
}>()

const {
  runs,
  selectedRun,
  jobs,
  isLoadingRuns,
  isLoadingJobs,
  isActionBusy,
  errorMsg,
  repoInfo,
  activeBranchFilter,
  dataSource,
  runningCount,
  detectRepo,
  fetchRuns,
  selectRun,
  startPolling,
  stopPolling,
  rerunRun,
  cancelRun,
  openInBrowser
} = useGitHubActions()

const { gitBranch, gitBranchesList, fetchBranches } = useProjectExplorer()
const { activeWorkstation } = useWorkspaceStore()
const { showAppConfirm, showAppAlert } = useAppDialog()

const searchQuery = ref('')
const statusFilter = ref<'all' | 'running' | 'success' | 'failure'>('all')
const isLivePolling = ref(true)
const expandedJobs = ref<Record<string | number, boolean>>({})

const toggleJobExpand = (jobId: string | number) => {
  expandedJobs.value[jobId] = !expandedJobs.value[jobId]
}

const successCount = computed(() => runs.value.filter((r) => r.conclusion === 'success').length)
const failureCount = computed(() => runs.value.filter((r) => r.conclusion === 'failure').length)

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await fetchBranches()
      await detectRepo()
      if (gitBranch.value) {
        activeBranchFilter.value = 'all'
      }
      await fetchRuns(activeBranchFilter.value)
      if (isLivePolling.value) {
        startPolling(6000)
      }
    } else {
      stopPolling()
    }
  }
)

const toggleLivePolling = () => {
  isLivePolling.value = !isLivePolling.value
  if (isLivePolling.value) {
    startPolling(6000)
  } else {
    stopPolling()
  }
}

onUnmounted(() => {
  stopPolling()
})

const handleBranchChange = async (event: Event) => {
  const target = event.target as HTMLSelectElement
  activeBranchFilter.value = target.value
  await fetchRuns(activeBranchFilter.value)
}

const handleRefresh = async () => {
  await fetchRuns(activeBranchFilter.value)
}

const filteredRuns = computed(() => {
  let list = runs.value

  if (statusFilter.value === 'running') {
    list = list.filter((r) => r.status === 'in_progress' || r.status === 'queued')
  } else if (statusFilter.value === 'success') {
    list = list.filter((r) => r.conclusion === 'success')
  } else if (statusFilter.value === 'failure') {
    list = list.filter((r) => r.conclusion === 'failure')
  }

  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.displayTitle.toLowerCase().includes(q) ||
      r.headBranch.toLowerCase().includes(q) ||
      r.headSha.toLowerCase().includes(q)
  )
})

const formatTime = (isoString: string) => {
  if (!isoString) return '-'
  try {
    const d = new Date(isoString)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return isoString
  }
}

const formatDuration = (start?: string, end?: string) => {
  if (!start) return ''
  try {
    const s = new Date(start).getTime()
    const e = end ? new Date(end).getTime() : Date.now()
    const sec = Math.max(0, Math.floor((e - s) / 1000))
    if (sec < 60) return `${sec}s`
    const min = Math.floor(sec / 60)
    const remSec = sec % 60
    return `${min}m ${remSec}s`
  } catch {
    return ''
  }
}

const providerTitle = computed(() => {
  if (repoInfo.value?.provider === 'gitlab') return 'GitLab CI/CD'
  if (repoInfo.value?.provider === 'github') return 'GitHub Actions'
  return 'CI/CD Pipelines'
})

const providerSubtitle = computed(() => {
  if (repoInfo.value?.provider === 'gitlab') {
    return 'Pantau pipeline GitLab CI/CD, status jobs, dan riwayat commit'
  }
  return 'Pantau workflow CI/CD, status jobs, dan riwayat pipeline repository'
})

const dataSourceLabel = computed(() => {
  if (dataSource.value === 'cli') {
    return repoInfo.value?.provider === 'gitlab' ? 'glab CLI' : 'gh CLI'
  }
  return repoInfo.value?.provider === 'gitlab' ? 'GitLab API' : 'REST API'
})

const handleRerun = async () => {
  if (!selectedRun.value) return
  const isGitLab = repoInfo.value?.provider === 'gitlab'
  const confirmed = await showAppConfirm(
    `Jalankan ulang ${isGitLab ? 'pipeline' : 'workflow'} "${selectedRun.value.name}" (#${selectedRun.value.runNumber})?`,
    isGitLab ? 'Retry Pipeline' : 'Re-run Workflow',
    'primary',
    'Jalankan Ulang'
  )
  if (!confirmed) return
  const ok = await rerunRun(selectedRun.value.id)
  if (ok) {
    await showAppAlert(`Permintaan re-run berhasil dikirim ke ${isGitLab ? 'GitLab' : 'GitHub'}.`, 'CI/CD Pipelines')
  } else {
    await showAppAlert(`Gagal mengirim re-run. Pastikan token ${isGitLab ? 'GitLab' : 'GitHub'} memiliki izin write atau login di CLI.`, 'Error')
  }
}

const handleCancel = async () => {
  if (!selectedRun.value) return
  const isGitLab = repoInfo.value?.provider === 'gitlab'
  const confirmed = await showAppConfirm(
    `Batalkan ${isGitLab ? 'pipeline' : 'workflow'} "${selectedRun.value.name}" (#${selectedRun.value.runNumber})?`,
    isGitLab ? 'Cancel Pipeline' : 'Cancel Workflow',
    'warning',
    'Batalkan Run'
  )
  if (!confirmed) return
  const ok = await cancelRun(selectedRun.value.id)
  if (ok) {
    await showAppAlert(`Permintaan pembatalan ${isGitLab ? 'pipeline' : 'workflow'} berhasil dikirim.`, 'CI/CD Pipelines')
  } else {
    await showAppAlert('Gagal membatalkan run.', 'Error')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 font-sans select-none"
      @click="emit('update:open', false)"
    >
      <div
        class="bg-[#12131a] border border-border w-full max-w-6xl h-[88vh] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-100"
        @click.stop
      >
        <!-- Modal Header -->
        <div class="flex flex-wrap items-center justify-between px-4 py-3 border-b border-border/80 bg-[#161722] gap-3 shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <PlayCircle class="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-foreground">{{ providerTitle }}</span>
                <span
                  v-if="repoInfo"
                  class="text-xs px-2 py-0.5 rounded-full bg-accent/60 border border-border/60 text-muted-foreground font-mono"
                >
                  {{ repoInfo.projectPath }}
                </span>
                <span
                  v-if="dataSource"
                  class="text-[10px] px-1.5 py-0.2 rounded font-medium"
                  :class="dataSource === 'cli' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-sky-500/10 text-sky-400 border border-sky-500/20'"
                >
                  {{ dataSourceLabel }}
                </span>

                <!-- Live Running Badge in Header -->
                <span
                  v-if="runningCount > 0"
                  class="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 font-medium ml-1"
                >
                  <span class="relative flex h-2 w-2 shrink-0">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                  </span>
                  <span>{{ runningCount }} Running</span>
                </span>
              </div>
              <p class="text-[11px] text-muted-foreground">
                {{ providerSubtitle }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Filter Branch -->
            <div class="flex items-center gap-1.5 bg-background/50 border border-border/60 rounded px-2 py-1 text-xs">
              <GitBranch class="w-3.5 h-3.5 text-muted-foreground" />
              <select
                :value="activeBranchFilter"
                class="bg-transparent text-xs text-foreground focus:outline-hidden cursor-pointer"
                @change="handleBranchChange"
              >
                <option value="all" class="bg-[#161722] text-foreground">Semua Branch</option>
                <option
                  v-for="b in gitBranchesList"
                  :key="b"
                  :value="b"
                  class="bg-[#161722] text-foreground"
                >
                  {{ b }}
                </option>
              </select>
            </div>

            <!-- Live Polling Toggle -->
            <button
              class="flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors cursor-pointer"
              :class="isLivePolling ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-background/40 text-muted-foreground border-border/50 hover:text-foreground'"
              title="Toggle Live Auto-Refresh (setiap 6 detik)"
              @click="toggleLivePolling"
            >
              <Radio class="w-3 h-3" :class="isLivePolling && 'animate-pulse text-emerald-400'" />
              <span class="text-[11px] font-medium">{{ isLivePolling ? 'Live (6s)' : 'Pause' }}</span>
            </button>

            <!-- Refresh Button -->
            <button
              class="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              :class="isLoadingRuns && 'opacity-60 cursor-not-allowed'"
              title="Refresh Runs Sekarang"
              :disabled="isLoadingRuns"
              @click="handleRefresh"
            >
              <RefreshCw class="w-4 h-4" :class="isLoadingRuns && 'animate-spin text-primary'" />
            </button>

            <!-- Close Button -->
            <button
              class="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer ml-1"
              @click="emit('update:open', false)"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Main Body: Split View -->
        <div class="flex-1 flex overflow-hidden">
          <!-- Left Panel: Runs List -->
          <div class="w-1/2 border-r border-border/60 flex flex-col bg-[#13141f]/50">
            <!-- Search bar & Status Filter Tabs -->
            <div class="p-2.5 border-b border-border/40 space-y-2 bg-[#12131a]/80">
              <div class="relative w-full">
                <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Cari workflow, commit, atau branch..."
                  class="w-full bg-background/60 border border-border/40 rounded pl-8 pr-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:border-primary/60"
                />
              </div>

              <!-- Status Filter Pills -->
              <div class="flex items-center gap-1.5 pt-0.5">
                <button
                  class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer"
                  :class="statusFilter === 'all' ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-background/40 text-muted-foreground hover:text-foreground border border-border/30'"
                  @click="statusFilter = 'all'"
                >
                  Semua ({{ runs.length }})
                </button>

                <button
                  class="px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                  :class="statusFilter === 'running' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-background/40 text-muted-foreground hover:text-foreground border border-border/30'"
                  @click="statusFilter = 'running'"
                >
                  <span v-if="runningCount > 0" class="relative flex h-2 w-2 shrink-0">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                  </span>
                  <span>Running ({{ runningCount }})</span>
                </button>

                <button
                  class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer"
                  :class="statusFilter === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-background/40 text-muted-foreground hover:text-foreground border border-border/30'"
                  @click="statusFilter = 'success'"
                >
                  Sukses ({{ successCount }})
                </button>

                <button
                  class="px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer"
                  :class="statusFilter === 'failure' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-background/40 text-muted-foreground hover:text-foreground border border-border/30'"
                  @click="statusFilter = 'failure'"
                >
                  Gagal ({{ failureCount }})
                </button>
              </div>
            </div>

            <!-- Runs list items -->
            <div class="flex-1 overflow-y-auto divide-y divide-border/20">
              <!-- Loading State -->
              <div v-if="isLoadingRuns && runs.length === 0" class="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <Loader2 class="w-6 h-6 animate-spin text-indigo-400 mb-2" />
                <span class="text-xs">Memuat daftar GitHub Actions...</span>
              </div>

              <!-- Error State -->
              <div v-else-if="errorMsg" class="p-4 text-center">
                <div class="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex flex-col items-center gap-2">
                  <ShieldAlert class="w-5 h-5 text-rose-400" />
                  <span>{{ errorMsg }}</span>
                  <button
                    class="mt-1 px-3 py-1 bg-accent/80 hover:bg-accent rounded border border-border text-[11px] text-foreground transition-colors cursor-pointer"
                    @click="emit('open-settings', 'cli')"
                  >
                    Buka Pengaturan Token
                  </button>
                </div>
              </div>

              <!-- Empty State -->
              <div v-else-if="filteredRuns.length === 0" class="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <PlayCircle class="w-8 h-8 opacity-40 mb-2 text-muted-foreground" />
                <span class="text-xs font-medium">
                  {{ statusFilter === 'running' ? 'Tidak ada workflow yang sedang running saat ini' : 'Tidak ada workflow run ditemukan' }}
                </span>
                <span class="text-[11px] opacity-70 mt-0.5">Coba ubah tab filter atau push commit baru</span>
              </div>

              <!-- Runs List -->
              <div
                v-for="run in filteredRuns"
                :key="run.id"
                class="p-2.5 hover:bg-accent/40 cursor-pointer transition-colors relative"
                :class="[
                  selectedRun?.id === run.id ? 'bg-accent/60 border-l-2 border-indigo-400' : '',
                  run.status === 'in_progress' ? 'bg-sky-500/5' : ''
                ]"
                @click="selectRun(run)"
              >
                <div class="flex items-start gap-2.5">
                  <!-- Status Icon -->
                  <div class="mt-0.5 shrink-0">
                    <CheckCircle2 v-if="run.conclusion === 'success'" class="w-4 h-4 text-emerald-400" />
                    <XCircle v-else-if="run.conclusion === 'failure'" class="w-4 h-4 text-rose-400" />
                    <Loader2 v-else-if="run.status === 'in_progress'" class="w-4 h-4 text-sky-400 animate-spin" />
                    <Clock v-else-if="run.status === 'queued'" class="w-4 h-4 text-amber-400" />
                    <Ban v-else-if="run.conclusion === 'cancelled'" class="w-4 h-4 text-muted-foreground" />
                    <MinusCircle v-else class="w-4 h-4 text-muted-foreground/60" />
                  </div>

                  <!-- Details -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-medium text-foreground truncate">
                        {{ run.displayTitle }}
                      </span>
                      <span class="text-[10px] text-muted-foreground shrink-0 font-mono">
                        #{{ run.runNumber }}
                      </span>
                    </div>

                    <div class="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span class="text-indigo-300 font-medium truncate max-w-[140px]">
                        {{ run.name }}
                      </span>
                      <span>•</span>
                      <div class="flex items-center gap-1 shrink-0">
                        <GitBranch class="w-3 h-3" />
                        <span class="font-mono text-[10px] truncate max-w-[100px]">{{ run.headBranch }}</span>
                      </div>
                      <span v-if="run.headSha">•</span>
                      <span v-if="run.headSha" class="font-mono text-[10px] text-muted-foreground/80">
                        {{ run.headSha.slice(0, 7) }}
                      </span>
                    </div>

                    <div class="flex items-center justify-between mt-1 text-[10px] text-muted-foreground/70">
                      <span>{{ formatTime(run.createdAt) }}</span>
                      <span
                        v-if="run.status === 'in_progress'"
                        class="text-sky-400 font-medium flex items-center gap-1"
                      >
                        <Loader2 class="w-2.5 h-2.5 animate-spin" />
                        Sedang Berjalan
                      </span>
                      <span v-else class="capitalize">{{ run.event }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Panel: Run Details & Jobs -->
          <div class="w-1/2 flex flex-col bg-[#12131a] overflow-hidden">
            <template v-if="selectedRun">
              <!-- Detail Header -->
              <div class="p-4 border-b border-border/60 bg-[#161722]/50 shrink-0">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <h3 class="text-sm font-semibold text-foreground truncate">
                        {{ selectedRun.displayTitle }}
                      </h3>
                    </div>
                    <p class="text-xs text-indigo-400 font-medium mt-0.5">
                      {{ selectedRun.name }} • Run #{{ selectedRun.runNumber }}
                    </p>
                  </div>

                  <!-- Browser Link & Controls -->
                  <div class="flex items-center gap-1.5 shrink-0">
                    <button
                      v-if="selectedRun.status === 'in_progress'"
                      class="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 text-xs flex items-center gap-1 cursor-pointer transition-colors"
                      :disabled="isActionBusy"
                      @click="handleCancel"
                    >
                      <Ban class="w-3 h-3" />
                      <span>Batal</span>
                    </button>

                    <button
                      class="px-2 py-1 rounded bg-accent/60 hover:bg-accent text-foreground border border-border/60 text-xs flex items-center gap-1 cursor-pointer transition-colors"
                      :disabled="isActionBusy"
                      @click="handleRerun"
                    >
                      <RotateCcw class="w-3 h-3" />
                      <span>Re-run</span>
                    </button>

                    <button
                      class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      :title="repoInfo?.provider === 'gitlab' ? 'Buka di GitLab' : 'Buka di GitHub'"
                      @click="openInBrowser(selectedRun.url)"
                    >
                      <ExternalLink class="w-4 h-4 text-indigo-300" />
                    </button>
                  </div>
                </div>

                <!-- Meta Badges -->
                <div class="flex flex-wrap items-center gap-2 mt-3 text-xs">
                  <span
                    class="px-2 py-0.5 rounded text-[11px] font-medium flex items-center gap-1"
                    :class="{
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20': selectedRun.conclusion === 'success',
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20': selectedRun.conclusion === 'failure',
                      'bg-sky-500/10 text-sky-400 border border-sky-500/20 animate-pulse': selectedRun.status === 'in_progress',
                      'bg-amber-500/10 text-amber-400 border border-amber-500/20': selectedRun.status === 'queued',
                      'bg-muted/40 text-muted-foreground border border-border/40': !['success', 'failure'].includes(selectedRun.conclusion || '') && !['in_progress', 'queued'].includes(selectedRun.status)
                    }"
                  >
                    <CheckCircle2 v-if="selectedRun.conclusion === 'success'" class="w-3 h-3" />
                    <XCircle v-else-if="selectedRun.conclusion === 'failure'" class="w-3 h-3" />
                    <Loader2 v-else-if="selectedRun.status === 'in_progress'" class="w-3 h-3 animate-spin" />
                    <Clock v-else-if="selectedRun.status === 'queued'" class="w-3 h-3" />
                    <span class="capitalize">{{ selectedRun.status === 'in_progress' ? 'Sedang Berjalan' : (selectedRun.conclusion || selectedRun.status) }}</span>
                  </span>

                  <span class="px-2 py-0.5 rounded bg-background/60 border border-border/40 text-muted-foreground font-mono text-[11px] flex items-center gap-1">
                    <GitBranch class="w-3 h-3 text-indigo-400" />
                    {{ selectedRun.headBranch }}
                  </span>

                  <span v-if="selectedRun.headSha" class="px-2 py-0.5 rounded bg-background/60 border border-border/40 text-muted-foreground font-mono text-[11px] flex items-center gap-1">
                    <GitCommit class="w-3 h-3 text-emerald-400" />
                    {{ selectedRun.headSha.slice(0, 7) }}
                  </span>

                  <span class="text-[11px] text-muted-foreground ml-auto">
                    {{ formatDuration(selectedRun.createdAt, selectedRun.status === 'in_progress' ? undefined : selectedRun.updatedAt) }}
                  </span>
                </div>
              </div>

              <!-- Jobs List -->
              <div class="flex-1 overflow-y-auto p-3 space-y-2">
                <div class="flex items-center justify-between text-xs font-medium text-muted-foreground px-1 mb-1">
                  <div class="flex items-center gap-1.5">
                    <Layers class="w-3.5 h-3.5 text-indigo-400" />
                    <span>Jobs & Steps ({{ jobs.length }})</span>
                  </div>
                  <span v-if="isLoadingJobs || selectedRun.status === 'in_progress'" class="text-[11px] text-sky-400 animate-pulse flex items-center gap-1">
                    <Loader2 class="w-3 h-3 animate-spin" />
                    {{ selectedRun.status === 'in_progress' ? 'Live updating jobs...' : 'Memuat status jobs...' }}
                  </span>
                </div>

                <div v-if="!isLoadingJobs && jobs.length === 0" class="p-6 text-center text-muted-foreground text-xs">
                  Tidak ada data jobs untuk run ini atau log telah kedaluwarsa.
                </div>

                <!-- Job Accordion Item -->
                <div
                  v-for="job in jobs"
                  :key="job.id"
                  class="rounded-lg border border-border/50 bg-[#141622]/60 overflow-hidden"
                >
                  <!-- Job Header -->
                  <div
                    class="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
                    @click="toggleJobExpand(job.id)"
                  >
                    <div class="flex items-center gap-2 min-w-0">
                      <component
                        :is="expandedJobs[job.id] ? ChevronDown : ChevronRight"
                        class="w-3.5 h-3.5 text-muted-foreground shrink-0"
                      />
                      <CheckCircle2 v-if="job.conclusion === 'success'" class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <XCircle v-else-if="job.conclusion === 'failure'" class="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <Loader2 v-else-if="job.status === 'in_progress'" class="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0" />
                      <Clock v-else-if="job.status === 'queued'" class="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <MinusCircle v-else class="w-3.5 h-3.5 text-muted-foreground shrink-0" />

                      <span class="text-xs font-medium text-foreground truncate">{{ job.name }}</span>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                      <span class="text-[10px] text-muted-foreground font-mono">
                        {{ formatDuration(job.startedAt, job.completedAt) }}
                      </span>
                      <button
                        v-if="job.url"
                        class="p-1 hover:text-foreground text-muted-foreground transition-colors cursor-pointer"
                        :title="repoInfo?.provider === 'gitlab' ? 'Buka Job di GitLab' : 'Buka Job di GitHub'"
                        @click.stop="openInBrowser(job.url)"
                      >
                        <ExternalLink class="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <!-- Steps List (Collapsible) -->
                  <div
                    v-if="expandedJobs[job.id] && job.steps && job.steps.length > 0"
                    class="border-t border-border/30 bg-[#0d0e14]/50 divide-y divide-border/20 px-3 py-1.5 space-y-1"
                  >
                    <div
                      v-for="step in job.steps"
                      :key="step.number"
                      class="flex items-center justify-between py-1 text-[11px]"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <CheckCircle2 v-if="step.conclusion === 'success'" class="w-3 h-3 text-emerald-400 shrink-0" />
                        <XCircle v-else-if="step.conclusion === 'failure'" class="w-3 h-3 text-rose-400 shrink-0" />
                        <Loader2 v-else-if="step.status === 'in_progress'" class="w-3 h-3 text-sky-400 animate-spin shrink-0" />
                        <MinusCircle v-else class="w-3 h-3 text-muted-foreground/60 shrink-0" />
                        <span class="text-muted-foreground truncate">{{ step.name }}</span>
                      </div>
                      <span
                        class="text-[10px] capitalize shrink-0 ml-2"
                        :class="step.conclusion === 'success' ? 'text-emerald-400/80' : step.conclusion === 'failure' ? 'text-rose-400/80' : step.status === 'in_progress' ? 'text-sky-400' : 'text-muted-foreground'"
                      >
                        {{ step.status === 'in_progress' ? 'Running' : (step.conclusion || step.status) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- No Selection State -->
            <div v-else class="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <PlayCircle class="w-10 h-10 opacity-30 mb-2" />
              <span class="text-xs">Pilih salah satu workflow run di sebelah kiri</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

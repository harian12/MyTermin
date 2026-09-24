<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import {
  GitCompare,
  GitBranch,
  GitCommit,
  RotateCcw,
  X,
  FileCode,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  AlertTriangle,
  GitMerge,
  Columns2,
  Rows2,
  Sparkles
} from 'lucide-vue-next'
import { useBranchCompare } from '~/composables/useBranchCompare'
import { useProjectExplorer } from '~/composables/useProjectExplorer'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'
import { useAppDialog } from '~/composables/useAppDialog'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const {
  baseBranch,
  compareBranch,
  compareData,
  isLoading,
  isMerging,
  errorMsg,
  activeDiffFile,
  baseFileContent,
  compareFileContent,
  isDiffLoading,
  runCompare,
  loadFileDiff,
  mergeCompareBranch
} = useBranchCompare()

const { gitBranch, gitBranchesList, fetchBranches, refreshGitStatus } = useProjectExplorer()
const { activeWorkstation, activeTerminal } = useWorkspaceStore()
const { showAppConfirm, showAppAlert } = useAppDialog()

const activeTab = ref<'files' | 'ahead' | 'behind'>('files')
const renderSideBySide = ref(true)

const currentRepoPath = computed(() => {
  return activeWorkstation.value?.folderPath || activeTerminal.value?.cwd || ''
})

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await fetchBranches()
      if (!compareBranch.value) {
        compareBranch.value = gitBranch.value || 'main'
      }
      if (!baseBranch.value) {
        baseBranch.value = gitBranchesList.value.find(b => b === 'main' || b === 'master') || gitBranchesList.value[0] || 'main'
      }
      await runCompare()
    }
  }
)

const handleSelectFile = (filePath: string) => {
  loadFileDiff(filePath)
}

const swapBranches = () => {
  const temp = baseBranch.value
  baseBranch.value = compareBranch.value
  compareBranch.value = temp
  runCompare()
}

const handleMerge = async () => {
  const confirmed = await showAppConfirm(
    `Apakah Anda yakin ingin melakukan merge branch "${compareBranch.value}" ke dalam branch "${baseBranch.value}"?`,
    'Konfirmasi Merge Branch',
    'warning',
    'Merge Sekarang'
  )
  if (!confirmed) return

  const res = await mergeCompareBranch()
  if (res.success) {
    await refreshGitStatus()
    await showAppAlert(`Berhasil merge branch "${compareBranch.value}" ke dalam "${baseBranch.value}".`, 'Merge Sukses')
  } else {
    await showAppAlert(`Gagal melakukan merge: ${res.error}`, 'Merge Error')
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
        class="bg-[#12131a] border border-border w-full max-w-7xl h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-100"
        @click.stop
      >
        <!-- Modal Header -->
        <div class="flex flex-wrap items-center justify-between px-4 py-3 border-b border-border/80 bg-[#161722] gap-3 flex-shrink-0">
          <!-- Left Branch Selectors -->
          <div class="flex items-center gap-2">
            <div class="p-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30">
              <GitCompare class="w-4 h-4" />
            </div>

            <!-- Base Branch Selector -->
            <div class="flex items-center gap-1.5 bg-[#0e0f16] px-2.5 py-1 rounded-lg border border-border/80">
              <span class="text-[10px] uppercase font-bold text-muted-foreground">Base (Tujuan):</span>
              <select
                v-model="baseBranch"
                class="bg-transparent text-xs font-mono text-foreground outline-none cursor-pointer"
                @change="runCompare()"
              >
                <option v-for="b in gitBranchesList" :key="`base-${b}`" :value="b" class="bg-[#181924]">
                  {{ b }}
                </option>
              </select>
            </div>

            <!-- Swap / Flow Indicator (Compare -> Base) -->
            <button
              class="p-1.5 rounded-lg border border-border/60 hover:bg-[#1f202e] text-primary hover:text-primary transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
              title="Arah merge: Compare mengalir ke Base. Klik untuk tukar posisi."
              @click="swapBranches"
            >
              <ArrowLeft class="w-3.5 h-3.5 text-primary" />
              <ArrowLeftRight class="w-3 h-3 text-muted-foreground opacity-60 hover:opacity-100" />
            </button>

            <!-- Compare Branch Selector -->
            <div class="flex items-center gap-1.5 bg-[#0e0f16] px-2.5 py-1 rounded-lg border border-primary/50">
              <span class="text-[10px] uppercase font-bold text-primary">Compare (Asal):</span>
              <select
                v-model="compareBranch"
                class="bg-transparent text-xs font-mono text-primary font-medium outline-none cursor-pointer"
                @change="runCompare()"
              >
                <option v-for="b in gitBranchesList" :key="`cmp-${b}`" :value="b" class="bg-[#181924]">
                  {{ b }}
                </option>
              </select>
            </div>

            <!-- Reload Compare -->
            <button
              class="p-1.5 rounded-lg border border-border/80 hover:bg-[#1f202e] text-muted-foreground hover:text-foreground transition-colors cursor-pointer ml-1"
              title="Refresh Komparasi"
              @click="runCompare()"
            >
              <RotateCcw :class="['w-4 h-4', isLoading ? 'animate-spin text-primary' : '']" />
            </button>
          </div>

          <!-- Right: Summary Badges & Merge Action -->
          <div class="flex items-center gap-2">
            <!-- Ahead/Behind Badges -->
            <div v-if="compareData" class="flex items-center gap-1.5 font-mono text-xs">
              <span
                class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                title="Jumlah commit lebih maju dibanding Base"
              >
                +{{ compareData.ahead_count }} Ahead
              </span>
              <span
                class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                title="Jumlah commit tertinggal dibanding Base"
              >
                -{{ compareData.behind_count }} Behind
              </span>
            </div>

            <!-- Merge Button -->
            <button
              v-if="compareData && compareData.ahead_count > 0"
              :disabled="isMerging"
              class="flex items-center gap-1.5 px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg shadow-sm transition-colors disabled:opacity-40 cursor-pointer"
              title="Merge compare branch ke branch aktif"
              @click="handleMerge"
            >
              <GitMerge class="w-3.5 h-3.5" />
              <span>{{ isMerging ? 'Merging...' : 'Merge Branch' }}</span>
            </button>

            <!-- Close Button -->
            <button
              class="p-1.5 rounded-lg border border-border/80 hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors cursor-pointer ml-2"
              @click="emit('update:open', false)"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Main Workspace -->
        <div class="flex-1 flex overflow-hidden min-h-0 bg-[#0c0d12]">
          <!-- Left Sidebar: Changes / Commits List -->
          <div class="w-80 sm:w-88 flex flex-col border-r border-border/70 bg-[#101118] flex-shrink-0">
            <!-- Tabs -->
            <div class="flex items-center border-b border-border/60 bg-[#14151f] text-xs font-medium text-muted-foreground flex-shrink-0">
              <button
                :class="[
                  'flex-1 py-2 text-center border-b-2 transition-colors cursor-pointer',
                  activeTab === 'files'
                    ? 'border-primary text-primary font-semibold bg-[#181924]'
                    : 'border-transparent hover:text-foreground'
                ]"
                @click="activeTab = 'files'"
              >
                Files ({{ compareData?.changed_files.length || 0 }})
              </button>
              <button
                :class="[
                  'flex-1 py-2 text-center border-b-2 transition-colors cursor-pointer',
                  activeTab === 'ahead'
                    ? 'border-primary text-primary font-semibold bg-[#181924]'
                    : 'border-transparent hover:text-foreground'
                ]"
                @click="activeTab = 'ahead'"
              >
                Ahead ({{ compareData?.ahead_commits.length || 0 }})
              </button>
              <button
                :class="[
                  'flex-1 py-2 text-center border-b-2 transition-colors cursor-pointer',
                  activeTab === 'behind'
                    ? 'border-primary text-primary font-semibold bg-[#181924]'
                    : 'border-transparent hover:text-foreground'
                ]"
                @click="activeTab = 'behind'"
              >
                Behind ({{ compareData?.behind_commits.length || 0 }})
              </button>
            </div>

            <!-- Tab Content Container -->
            <div class="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
              <div v-if="isLoading" class="flex flex-col items-center justify-center h-36 text-muted-foreground gap-2">
                <RotateCcw class="w-5 h-5 animate-spin text-primary" />
                <span class="text-xs">Membandingkan branch...</span>
              </div>

              <!-- Tab 1: Files Changed List -->
              <template v-else-if="activeTab === 'files'">
                <div
                  v-for="file in compareData?.changed_files || []"
                  :key="file.path"
                  :class="[
                    'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-xs font-mono group select-none',
                    activeDiffFile === file.path
                      ? 'bg-primary/20 text-foreground border border-primary/40 font-medium'
                      : 'hover:bg-[#181924] text-muted-foreground hover:text-foreground border border-transparent'
                  ]"
                  @click="handleSelectFile(file.path)"
                >
                  <div class="flex items-center gap-2 min-w-0 flex-1 pr-2">
                    <span
                      :class="[
                        'w-2 h-2 rounded-full flex-shrink-0',
                        file.status === 'added' ? 'bg-emerald-400' :
                        file.status === 'deleted' ? 'bg-rose-400' :
                        file.status === 'renamed' ? 'bg-amber-400' : 'bg-blue-400'
                      ]"
                    />
                    <span class="truncate text-[11px]">{{ file.path }}</span>
                  </div>

                  <div class="flex items-center gap-1 font-mono text-[10px] flex-shrink-0">
                    <span v-if="file.insertions > 0" class="text-emerald-400 font-medium">+{{ file.insertions }}</span>
                    <span v-if="file.deletions > 0" class="text-rose-400 font-medium">-{{ file.deletions }}</span>
                  </div>
                </div>

                <div v-if="!compareData?.changed_files.length" class="p-4 text-center text-xs text-muted-foreground">
                  Tidak ada perbedaan file antara kedua branch ini.
                </div>
              </template>

              <!-- Tab 2: Ahead Commits List -->
              <template v-else-if="activeTab === 'ahead'">
                <div
                  v-for="c in compareData?.ahead_commits || []"
                  :key="c.hash"
                  class="p-2 rounded-lg bg-[#14151f] hover:bg-[#181924] border border-border/40 text-xs space-y-1"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-primary font-mono text-[11px]">{{ c.short_hash }}</span>
                    <span class="text-muted-foreground/60 text-[10px]">{{ c.relative_time }}</span>
                  </div>
                  <p class="text-foreground/90 font-medium truncate">{{ c.message }}</p>
                  <span class="text-muted-foreground text-[10px] block">{{ c.author }}</span>
                </div>

                <div v-if="!compareData?.ahead_commits.length" class="p-4 text-center text-xs text-muted-foreground">
                  Branch compare tidak memiliki commit ahead.
                </div>
              </template>

              <!-- Tab 3: Behind Commits List -->
              <template v-else-if="activeTab === 'behind'">
                <div
                  v-for="c in compareData?.behind_commits || []"
                  :key="c.hash"
                  class="p-2 rounded-lg bg-[#14151f] hover:bg-[#181924] border border-border/40 text-xs space-y-1"
                >
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-amber-400 font-mono text-[11px]">{{ c.short_hash }}</span>
                    <span class="text-muted-foreground/60 text-[10px]">{{ c.relative_time }}</span>
                  </div>
                  <p class="text-foreground/90 font-medium truncate">{{ c.message }}</p>
                  <span class="text-muted-foreground text-[10px] block">{{ c.author }}</span>
                </div>

                <div v-if="!compareData?.behind_commits.length" class="p-4 text-center text-xs text-muted-foreground">
                  Branch compare tidak tertinggal commit (up to date).
                </div>
              </template>
            </div>
          </div>

          <!-- Right Pane: Monaco Diff Editor -->
          <div class="flex-1 flex flex-col overflow-hidden min-h-0 bg-[#0e0f16]">
            <!-- Diff Editor Header Bar -->
            <div class="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-[#14151f] flex-shrink-0">
              <div class="flex items-center gap-2 truncate">
                <FileCode class="w-4 h-4 text-primary flex-shrink-0" />
                <span class="font-mono text-xs font-semibold text-foreground truncate">
                  {{ activeDiffFile || 'Pilih file di sebelah kiri untuk melihat komparasi diff' }}
                </span>
              </div>

              <!-- Side by Side / Inline Toggle -->
              <div v-if="activeDiffFile" class="flex items-center gap-1">
                <button
                  class="p-1 rounded hover:bg-[#1f202e] text-muted-foreground hover:text-foreground text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  :title="renderSideBySide ? 'Mode: Bersebelahan (Side by Side)' : 'Mode: Sejajar (Inline)'"
                  @click="renderSideBySide = !renderSideBySide"
                >
                  <Columns2 v-if="renderSideBySide" class="w-3.5 h-3.5 text-primary" />
                  <Rows2 v-else class="w-3.5 h-3.5 text-primary" />
                  <span class="text-[10px] hidden sm:inline">{{ renderSideBySide ? 'Side by Side' : 'Inline' }}</span>
                </button>
              </div>
            </div>

            <!-- Diff Content View -->
            <div class="flex-1 overflow-hidden relative min-h-0">
              <div v-if="isDiffLoading" class="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <RotateCcw class="w-6 h-6 animate-spin text-primary" />
                <span class="text-xs">Memuat konten file diff...</span>
              </div>

              <MonacoDiffEditor
                v-else-if="activeDiffFile"
                :original-value="baseFileContent"
                :modified-value="compareFileContent"
                :filename="activeDiffFile"
                :readonly="true"
                :render-side-by-side="renderSideBySide"
                class="w-full h-full"
              />

              <div v-else class="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-6 text-center">
                <GitCompare class="w-10 h-10 opacity-30" />
                <p class="text-xs max-w-sm">
                  Pilih salah satu file dari daftar di sebelah kiri untuk meninjau perbedaan kode antar branch secara langsung.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import {
  GitBranch,
  GitCommit,
  RotateCcw,
  X,
  User,
  Calendar,
  FileText,
  Copy,
  Check,
  ArrowRight,
  ExternalLink,
  Plus,
  Minus,
  Undo2,
  AlertTriangle
} from 'lucide-vue-next'
import { useGitGraph } from '~/composables/useGitGraph'
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
  visualNodes,
  selectedCommit,
  isLoading,
  isDetailsLoading,
  errorMsg,
  maxLanes,
  fetchGraph,
  selectCommit,
  checkoutCommit,
  revertCommit,
  resetToCommit
} = useGitGraph()

const { gitBranch, refreshGitStatus } = useProjectExplorer()
const { activeWorkstation, activeTerminal } = useWorkspaceStore()
const { showAppConfirm, showAppAlert } = useAppDialog()

const currentRepoPath = computed(() => {
  return activeWorkstation.value?.folderPath || activeTerminal.value?.cwd || ''
})

const copiedHash = ref<string | null>(null)
const searchQuery = ref('')
const isRollingBack = ref(false)
const showRollbackModal = ref(false)
const rollbackTarget = ref<string | null>(null)
const rowHeight = 36
const laneWidth = 18

watch(
  () => props.open,
  (open) => {
    if (open) {
      fetchGraph()
    }
  }
)

const filteredNodes = computed(() => {
  if (!searchQuery.value.trim()) return visualNodes.value
  const q = searchQuery.value.toLowerCase()
  return visualNodes.value.filter(
    (n) =>
      n.subject.toLowerCase().includes(q) ||
      n.author.toLowerCase().includes(q) ||
      n.short_hash.toLowerCase().includes(q) ||
      n.refs.some((r) => r.toLowerCase().includes(q))
  )
})

const graphSvgWidth = computed(() => {
  return Math.max(120, (maxLanes.value + 1) * laneWidth + 24)
})

const totalSvgHeight = computed(() => {
  return Math.max(100, visualNodes.value.length * rowHeight)
})

const copyHash = async (hash: string) => {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('copy_to_clipboard', { text: hash })
    copiedHash.value = hash
    setTimeout(() => {
      copiedHash.value = null
    }, 2000)
  } catch {
    navigator.clipboard.writeText(hash)
    copiedHash.value = hash
    setTimeout(() => {
      copiedHash.value = null
    }, 2000)
  }
}

const handleCheckout = async (target: string) => {
  const ok = await showAppConfirm(
    `Apakah Anda yakin ingin checkout ke ${target}? Pastikan tidak ada perubahan yang belum di-commit.`,
    'Checkout Commit/Branch',
    'warning',
    'Checkout'
  )
  if (!ok) return

  const res = await checkoutCommit(target)
  if (res) {
    await refreshGitStatus()
  } else {
    await showAppAlert('Gagal melakukan checkout commit/branch.', 'Git Error')
  }
}

const openRollbackDialog = (hash: string) => {
  rollbackTarget.value = hash
  showRollbackModal.value = true
}

const executeRevertSafe = async () => {
  if (!rollbackTarget.value || isRollingBack.value) return
  isRollingBack.value = true
  try {
    const res = await revertCommit(rollbackTarget.value)
    if (res.success) {
      showRollbackModal.value = false
      await refreshGitStatus()
      await showAppAlert('Rollback aman (Git Revert) berhasil! Commit pembalik baru telah dibuat.', 'Rollback Sukses')
    } else {
      await showAppAlert(`Gagal revert commit: ${res.error}`, 'Rollback Error')
    }
  } finally {
    isRollingBack.value = false
  }
}

const executeResetHard = async () => {
  if (!rollbackTarget.value || isRollingBack.value) return
  const confirmed = await showAppConfirm(
    'PERINGATAN: Hard Reset akan menghapus seluruh commit dan perubahan file setelah commit ini secara permanen. Yakin lanjutkan?',
    'Konfirmasi Hard Reset',
    'destructive',
    'Ya, Reset Permanen'
  )
  if (!confirmed) return

  isRollingBack.value = true
  try {
    const res = await resetToCommit(rollbackTarget.value, 'hard')
    if (res.success) {
      showRollbackModal.value = false
      await refreshGitStatus()
      await showAppAlert('Hard reset berhasil! Repositori telah kembali persis ke commit yang dipilih.', 'Reset Sukses')
    } else {
      await showAppAlert(`Gagal reset ke commit: ${res.error}`, 'Reset Error')
    }
  } finally {
    isRollingBack.value = false
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
        <div class="flex items-center justify-between px-4 py-3 border-b border-border/80 bg-[#161722] flex-shrink-0">
          <div class="flex items-center gap-3">
            <div class="p-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30">
              <GitBranch class="w-4 h-4" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold text-foreground">Git Commit Graph</h2>
                <span v-if="gitBranch" class="px-2 py-0.5 text-[10px] font-mono rounded-full bg-primary/15 text-primary border border-primary/30">
                  HEAD -> {{ gitBranch }}
                </span>
              </div>
              <p class="text-[11px] text-muted-foreground truncate max-w-md">
                {{ currentRepoPath || 'Pilih project untuk melihat visual commit tree' }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Search input -->
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Cari commit, author, hash..."
              class="bg-[#0d0e14] border border-border focus:border-primary rounded-lg px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono w-48 sm:w-64 transition-colors"
            />

            <!-- Refresh Button -->
            <button
              class="p-1.5 rounded-lg border border-border/80 hover:bg-[#1f202e] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Refresh Graph"
              @click="fetchGraph"
            >
              <RotateCcw :class="['w-4 h-4', isLoading ? 'animate-spin text-primary' : '']" />
            </button>

            <!-- Close Button -->
            <button
              class="p-1.5 rounded-lg border border-border/80 hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors cursor-pointer ml-1"
              @click="emit('update:open', false)"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Main Workspace: Left Graph + Right Commit Details -->
        <div class="flex-1 flex overflow-hidden min-h-0 bg-[#0c0d12]">
          <!-- Left: Visual Commit Graph Table -->
          <div class="flex-1 flex flex-col overflow-hidden border-r border-border/60">
            <!-- Table Header -->
            <div class="flex items-center border-b border-border/60 bg-[#14151f] px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-shrink-0">
              <div :style="{ width: `${graphSvgWidth}px` }" class="flex-shrink-0">Graph</div>
              <div class="flex-1 min-w-[200px] px-2">Deskripsi Commit & Ref</div>
              <div class="w-32 px-2 hidden md:block">Author</div>
              <div class="w-24 px-2 text-right hidden sm:block">Waktu</div>
              <div class="w-20 px-2 text-right font-mono">Hash</div>
            </div>

            <!-- Commit List Container -->
            <div class="flex-1 overflow-y-auto overflow-x-auto relative min-h-0">
              <div v-if="isLoading && visualNodes.length === 0" class="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <RotateCcw class="w-6 h-6 animate-spin text-primary" />
                <span class="text-xs">Memuat visual graph commit...</span>
              </div>

              <div v-else-if="visualNodes.length === 0" class="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <GitCommit class="w-8 h-8 opacity-40" />
                <span class="text-xs">{{ errorMsg || 'Tidak ada riwayat commit ditemukan pada repositori ini.' }}</span>
              </div>

              <div v-else class="relative" :style="{ minHeight: `${totalSvgHeight}px` }">
                <!-- SVG Canvas for Branch Lines -->
                <svg
                  class="absolute top-0 left-0 pointer-events-none z-0"
                  :style="{ width: `${graphSvgWidth}px`, height: `${totalSvgHeight}px` }"
                >
                  <g>
                    <!-- Route Lines -->
                    <template v-for="node in visualNodes" :key="`routes-${node.hash}`">
                      <path
                        v-for="(route, rIdx) in node.routes"
                        :key="`r-${node.hash}-${rIdx}`"
                        :d="`M ${node.x} ${node.y} C ${node.x} ${(node.y + route.toY) / 2}, ${16 + route.toLane * laneWidth} ${(node.y + route.toY) / 2}, ${16 + route.toLane * laneWidth} ${route.toY}`"
                        fill="none"
                        :stroke="route.color"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        opacity="0.8"
                      />
                    </template>

                    <!-- Commit Nodes (Circles) -->
                    <g v-for="node in visualNodes" :key="`node-${node.hash}`">
                      <!-- Outer Glow for Selected -->
                      <circle
                        v-if="selectedCommit?.hash === node.hash"
                        :cx="node.x"
                        :cy="node.y"
                        r="6"
                        fill="none"
                        :stroke="node.color"
                        stroke-width="3"
                        class="animate-pulse"
                      />
                      <!-- Main Circle Node -->
                      <circle
                        :cx="node.x"
                        :cy="node.y"
                        :r="node.parents.length > 1 ? 4.5 : 3.5"
                        :fill="node.parents.length > 1 ? '#ffffff' : node.color"
                        :stroke="node.color"
                        stroke-width="1.5"
                      />
                    </g>
                  </g>
                </svg>

                <!-- Row Items Overlay -->
                <div
                  v-for="(node, idx) in filteredNodes"
                  :key="node.hash"
                  :class="[
                    'flex items-center px-3 text-xs cursor-pointer border-b border-border/20 transition-colors select-none group',
                    selectedCommit?.hash === node.hash
                      ? 'bg-primary/15 hover:bg-primary/20 text-foreground'
                      : 'hover:bg-[#181924]/60 text-muted-foreground hover:text-foreground'
                  ]"
                  :style="{ height: `${rowHeight}px` }"
                  @click="selectCommit(node.hash)"
                >
                  <!-- Graph SVG Spacer -->
                  <div :style="{ width: `${graphSvgWidth}px` }" class="flex-shrink-0" />

                  <!-- Subject & Branch Refs -->
                  <div class="flex-1 min-w-[200px] px-2 flex items-center gap-1.5 truncate">
                    <!-- Branch / Tag Badges -->
                    <template v-for="refItem in node.refs" :key="refItem">
                      <span
                        v-if="refItem.startsWith('HEAD ->')"
                        class="px-1.5 py-0.2 text-[10px] font-mono rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex-shrink-0 font-medium"
                      >
                        {{ refItem }}
                      </span>
                      <span
                        v-else-if="refItem.startsWith('tag:')"
                        class="px-1.5 py-0.2 text-[10px] font-mono rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex-shrink-0"
                      >
                        {{ refItem.replace('tag:', '').trim() }}
                      </span>
                      <span
                        v-else
                        class="px-1.5 py-0.2 text-[10px] font-mono rounded bg-primary/20 text-primary border border-primary/30 flex-shrink-0"
                      >
                        {{ refItem }}
                      </span>
                    </template>

                    <span class="truncate font-medium text-foreground/90 group-hover:text-foreground">
                      {{ node.subject }}
                    </span>
                  </div>

                  <!-- Author -->
                  <div class="w-32 px-2 truncate text-muted-foreground/80 hidden md:block">
                    {{ node.author }}
                  </div>

                  <!-- Time -->
                  <div class="w-24 px-2 text-right text-muted-foreground/60 truncate hidden sm:block">
                    {{ node.relative_time }}
                  </div>

                  <!-- Short Hash -->
                  <div class="w-20 px-2 text-right font-mono text-[11px] text-muted-foreground group-hover:text-primary transition-colors">
                    {{ node.short_hash }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Commit Details & Changed Files Pane -->
          <div class="w-80 sm:w-96 flex flex-col bg-[#101118] overflow-hidden flex-shrink-0">
            <div class="px-4 py-2.5 border-b border-border/80 bg-[#14151f] flex items-center justify-between flex-shrink-0">
              <span class="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText class="w-3.5 h-3.5 text-primary" />
                Commit Detail
              </span>

              <div class="flex items-center gap-1.5">
                <button
                  v-if="selectedCommit"
                  class="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-medium border border-amber-500/40 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Rollback atau Revert Perubahan Commit Ini"
                  @click="openRollbackDialog(selectedCommit.hash)"
                >
                  <Undo2 class="w-3 h-3" />
                  <span>Rollback</span>
                </button>

                <button
                  v-if="selectedCommit"
                  class="px-2 py-0.5 rounded bg-primary/20 hover:bg-primary/30 text-primary text-[10px] font-medium border border-primary/40 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Checkout Commit Ini"
                  @click="handleCheckout(selectedCommit.hash)"
                >
                  <span>Checkout</span>
                  <ArrowRight class="w-3 h-3" />
                </button>
              </div>
            </div>

            <!-- Detail Content -->
            <div class="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 text-xs font-sans">
              <div v-if="isDetailsLoading" class="flex flex-col items-center justify-center h-36 text-muted-foreground gap-2">
                <RotateCcw class="w-5 h-5 animate-spin text-primary" />
                <span class="text-xs">Memuat detail commit...</span>
              </div>

              <template v-else-if="selectedCommit">
                <!-- Subject & Body -->
                <div class="space-y-1.5">
                  <h3 class="font-semibold text-sm text-foreground leading-snug break-words">
                    {{ selectedCommit.subject }}
                  </h3>
                  <p v-if="selectedCommit.body" class="text-xs text-muted-foreground whitespace-pre-wrap bg-[#0c0d12] p-2.5 rounded-lg border border-border/60 font-mono">
                    {{ selectedCommit.body }}
                  </p>
                </div>

                <!-- Meta Info Card -->
                <div class="bg-[#14151f] border border-border/70 rounded-lg p-3 space-y-2 text-xs">
                  <!-- Author -->
                  <div class="flex items-center justify-between text-muted-foreground">
                    <span class="flex items-center gap-1.5 text-foreground/80">
                      <User class="w-3.5 h-3.5 text-muted-foreground" />
                      Author:
                    </span>
                    <span class="font-medium text-foreground truncate max-w-[180px]" :title="selectedCommit.author_email">
                      {{ selectedCommit.author }}
                    </span>
                  </div>

                  <!-- Date -->
                  <div class="flex items-center justify-between text-muted-foreground">
                    <span class="flex items-center gap-1.5 text-foreground/80">
                      <Calendar class="w-3.5 h-3.5 text-muted-foreground" />
                      Tanggal:
                    </span>
                    <span class="text-muted-foreground truncate max-w-[180px]" :title="selectedCommit.date">
                      {{ selectedCommit.relative_time }}
                    </span>
                  </div>

                  <!-- Hash & Copy -->
                  <div class="flex items-center justify-between pt-1 border-t border-border/40 font-mono">
                    <span class="text-[11px] text-muted-foreground">SHA:</span>
                    <button
                      class="flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
                      @click="copyHash(selectedCommit.hash)"
                    >
                      <span>{{ selectedCommit.short_hash }}</span>
                      <Check v-if="copiedHash === selectedCommit.hash" class="w-3 h-3 text-emerald-400" />
                      <Copy v-else class="w-3 h-3 opacity-60" />
                    </button>
                  </div>
                </div>

                <!-- Changed Files Header -->
                <div class="space-y-2">
                  <div class="flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>File Berubah ({{ selectedCommit.files.length }})</span>
                  </div>

                  <!-- Changed Files List -->
                  <div class="space-y-1">
                    <div
                      v-for="file in selectedCommit.files"
                      :key="file.path"
                      class="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#14151f] hover:bg-[#181924] border border-border/40 text-xs transition-colors group"
                      :title="file.path"
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
                        <span class="truncate font-mono text-[11px] text-foreground/90 group-hover:text-foreground">
                          {{ file.path }}
                        </span>
                      </div>

                      <div class="flex items-center gap-1.5 font-mono text-[10px] flex-shrink-0">
                        <span v-if="file.insertions > 0" class="text-emerald-400 font-medium">
                          +{{ file.insertions }}
                        </span>
                        <span v-if="file.deletions > 0" class="text-rose-400 font-medium">
                          -{{ file.deletions }}
                        </span>
                      </div>
                    </div>

                    <div v-if="selectedCommit.files.length === 0" class="p-3 text-center text-xs text-muted-foreground">
                      Tidak ada perubahan file pada commit ini.
                    </div>
                  </div>
                </div>
              </template>

              <div v-else class="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                <FileText class="w-8 h-8 opacity-30" />
                <span class="text-xs">Pilih commit di sebelah kiri untuk melihat detail</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Rollback Confirmation Dialog -->
    <Teleport to="body">
      <div
        v-if="showRollbackModal && selectedCommit"
        class="fixed inset-0 z-[130] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none"
        @click="showRollbackModal = false"
      >
        <div
          class="bg-[#181924] border border-border rounded-xl p-5 w-full max-w-lg shadow-2xl space-y-4 animate-in zoom-in-95 duration-100"
          @click.stop
        >
          <div class="flex items-center justify-between border-b border-border/50 pb-3">
            <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Undo2 class="w-4 h-4 text-amber-400" />
              <span>Opsi Rollback Commit</span>
            </div>
            <button
              class="p-1 hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              @click="showRollbackModal = false"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- Commit Info Preview -->
          <div class="bg-[#0f1017] p-3 rounded-lg border border-border/60 text-xs font-mono space-y-1">
            <div class="flex items-center justify-between text-muted-foreground">
              <span>Target Commit:</span>
              <span class="text-primary font-bold">{{ selectedCommit.short_hash }}</span>
            </div>
            <p class="text-foreground truncate font-sans font-medium pt-1">
              "{{ selectedCommit.subject }}"
            </p>
          </div>

          <!-- Strategy Options -->
          <div class="space-y-2.5 text-xs">
            <!-- Option 1: Revert Safe (Recommended) -->
            <button
              :disabled="isRollingBack"
              class="w-full text-left p-3 rounded-lg bg-[#14151f] hover:bg-[#1e202f] border border-border/80 hover:border-primary/50 transition-all cursor-pointer group"
              @click="executeRevertSafe"
            >
              <div class="flex items-center justify-between font-semibold text-foreground group-hover:text-primary">
                <span class="flex items-center gap-1.5">
                  <Check class="w-4 h-4 text-emerald-400" />
                  1. Revert Commit (Aman & Direkomendasikan)
                </span>
                <span class="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.2 rounded">Safe</span>
              </div>
              <p class="text-muted-foreground text-[11px] mt-1">
                Membuat commit baru yang membalikkan (undo) seluruh perubahan commit ini tanpa menghapus riwayat log Git.
              </p>
            </button>

            <!-- Option 2: Hard Reset -->
            <button
              :disabled="isRollingBack"
              class="w-full text-left p-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/60 transition-all cursor-pointer group"
              @click="executeResetHard"
            >
              <div class="flex items-center justify-between font-semibold text-rose-400">
                <span class="flex items-center gap-1.5">
                  <AlertTriangle class="w-4 h-4 text-rose-400" />
                  2. Hard Reset ke Titik Ini
                </span>
                <span class="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded font-mono">Destructive</span>
              </div>
              <p class="text-rose-300/70 text-[11px] mt-1">
                Membuang seluruh commit dan kode setelah commit ini secara permanen. Gunakan jika commit terbaru benar-benar ingin dihapus total.
              </p>
            </button>
          </div>

          <!-- Footer Actions -->
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <button
              class="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-accent transition-colors cursor-pointer"
              @click="showRollbackModal = false"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </Teleport>
</template>

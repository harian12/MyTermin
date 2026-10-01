<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  GitBranch,
  X,
  Plus,
  Terminal,
  Trash2,
  FolderGit2,
  FolderPlus,
  ArrowRight,
  Split,
  FolderOpen,
  RefreshCw
} from 'lucide-vue-next'
import { useProjectExplorer } from '~/composables/useProjectExplorer'
import { useGitExtras } from '~/composables/useGitExtras'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'
import { useAppDialog } from '~/composables/useAppDialog'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const activeTab = ref<'branches' | 'worktrees'>('branches')

const { gitBranch, gitBranchesList, fetchBranches, switchBranch, createBranch } = useProjectExplorer()
const { worktreeList, refreshWorktrees, addWorktree, removeWorktree, fetchAll, isBusy } = useGitExtras()
const { activeWorkstation, addTerminal } = useWorkspaceStore()
const { showAppAlert, showAppConfirm } = useAppDialog()

const newBranchName = ref('')
const isCreatingBranch = ref(false)
const isFetchingModal = ref(false)

const handleFetchRemote = async () => {
  if (isFetchingModal.value) return
  isFetchingModal.value = true
  try {
    await fetchAll()
    await Promise.all([fetchBranches(), refreshWorktrees()])
  } finally {
    isFetchingModal.value = false
  }
}

// Worktree Form State
const selectedWorktreeBranch = ref('')
const customWorktreeName = ref('')
const createNewBranchForWorktree = ref(false)
const newWorktreeBranchName = ref('')
const isAddingWorktree = ref(false)

const repoRoot = computed(() => activeWorkstation.value?.folderPath || '')
const repoBaseName = computed(() => {
  const p = repoRoot.value.replace(/[\\/]+$/, '')
  return p.split(/[\\/]/).pop() || 'project'
})

// Otomatis buat saran nama folder worktree
watch(
  [selectedWorktreeBranch, newWorktreeBranchName, createNewBranchForWorktree],
  () => {
    const branch = createNewBranchForWorktree.value
      ? newWorktreeBranchName.value.trim()
      : selectedWorktreeBranch.value.trim()
    if (branch) {
      const sanitized = branch.replace(/[^a-zA-Z0-9._-]/g, '-')
      customWorktreeName.value = `${repoBaseName.value}-${sanitized}`
    } else {
      customWorktreeName.value = ''
    }
  }
)

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      await Promise.all([fetchBranches(), refreshWorktrees()])
      if (gitBranchesList.value.length > 0 && !selectedWorktreeBranch.value) {
        selectedWorktreeBranch.value = gitBranchesList.value.find(b => b !== gitBranch.value) || gitBranchesList.value[0] || ''
      }
    }
  },
  { immediate: true }
)

const handleSwitchBranch = async (branchName: string) => {
  emit('update:open', false)
  await switchBranch(branchName)
}

const handleCreateBranch = async () => {
  if (!newBranchName.value.trim() || isCreatingBranch.value) return
  isCreatingBranch.value = true
  try {
    const ok = await createBranch(newBranchName.value.trim())
    if (ok) {
      newBranchName.value = ''
      emit('update:open', false)
    }
  } finally {
    isCreatingBranch.value = false
  }
}

// Buka terminal baru langsung di folder worktree yang sudah ada
const handleOpenWorktreeTerminal = (wtPath: string, branchName: string) => {
  addTerminal({
    title: `[${branchName || 'worktree'}]`,
    cwd: wtPath
  })
  emit('update:open', false)
}

// Shortcut cepat: Dari daftar branch, langsung buka di worktree & terminal baru
const handleQuickOpenBranchInWorktree = async (branchName: string) => {
  if (!repoRoot.value) return

  // Cek apakah worktree untuk branch ini sudah ada
  const existing = worktreeList.value.find(
    w => w.branch === branchName || w.branch === `refs/heads/${branchName}`
  )
  if (existing) {
    handleOpenWorktreeTerminal(existing.path, branchName)
    return
  }

  // Buat folder worktree di sibling directory
  const sanitized = branchName.replace(/[^a-zA-Z0-9._-]/g, '-')
  const parentDir = repoRoot.value.replace(/[\\/][^\\/]+$/, '')
  const targetPath = `${parentDir}\\${repoBaseName.value}-${sanitized}`

  isAddingWorktree.value = true
  try {
    const res = await addWorktree(targetPath, branchName, false)
    if (res !== null) {
      handleOpenWorktreeTerminal(targetPath, branchName)
    }
  } finally {
    isAddingWorktree.value = false
  }
}

// Submit form pembuatan worktree baru
const handleCreateWorktreeSubmit = async () => {
  if (!repoRoot.value || isAddingWorktree.value) return

  const branch = createNewBranchForWorktree.value
    ? newWorktreeBranchName.value.trim()
    : selectedWorktreeBranch.value.trim()
  const folderName = customWorktreeName.value.trim()

  if (!branch) {
    await showAppAlert('Nama branch tidak boleh kosong', 'Validasi Worktree')
    return
  }
  if (!folderName) {
    await showAppAlert('Nama folder worktree tidak boleh kosong', 'Validasi Worktree')
    return
  }

  const parentDir = repoRoot.value.replace(/[\\/][^\\/]+$/, '')
  const targetPath = folderName.includes(':') || folderName.startsWith('/')
    ? folderName
    : `${parentDir}\\${folderName}`

  isAddingWorktree.value = true
  try {
    const res = await addWorktree(targetPath, branch, createNewBranchForWorktree.value)
    if (res !== null) {
      handleOpenWorktreeTerminal(targetPath, branch)
    }
  } finally {
    isAddingWorktree.value = false
  }
}

// Hapus worktree
const handleRemoveWorktree = async (wtPath: string, branchName: string) => {
  const confirmed = await showAppConfirm(
    `Apakah Anda yakin ingin menghapus worktree "${branchName}" di folder "${wtPath}"? Berkas kerja di folder tersebut akan dibersihkan.`,
    'Hapus Worktree',
    'destructive',
    'Hapus'
  )
  if (!confirmed) return

  await removeWorktree(wtPath, true)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[120] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none"
      @click="emit('update:open', false)"
    >
      <div
        class="bg-[#181924] border border-border rounded-xl p-4 w-full max-w-lg shadow-2xl space-y-3.5 animate-in zoom-in-95 duration-100"
        @click.stop
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between border-b border-border/50 pb-2.5">
          <div class="flex items-center gap-2">
            <GitBranch class="w-4 h-4 text-primary" />
            <span class="text-xs font-semibold text-foreground">Git Branch & Worktree</span>
          </div>
          <div class="flex items-center gap-1.5">
            <UiTooltip text="Fetch branch & commit terbaru dari remote GitHub" side="bottom">
              <button
                class="px-2 py-1 hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                :disabled="isFetchingModal"
                @click="handleFetchRemote"
              >
                <RefreshCw :class="['w-3.5 h-3.5', isFetchingModal ? 'animate-spin text-primary' : '']" />
                <span class="hidden sm:inline">Fetch Remote</span>
              </button>
            </UiTooltip>
            <button
              class="p-1 hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              @click="emit('update:open', false)"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex gap-1 p-1 bg-[#0d0e14] border border-border/60 rounded-lg text-xs font-medium">
          <button
            :class="[
              'flex-1 py-1 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer',
              activeTab === 'branches'
                ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            ]"
            @click="activeTab = 'branches'"
          >
            <GitBranch class="w-3.5 h-3.5" />
            <span>Branches ({{ gitBranchesList.length }})</span>
          </button>
          <button
            :class="[
              'flex-1 py-1 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer',
              activeTab === 'worktrees'
                ? 'bg-primary/20 text-primary font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            ]"
            @click="activeTab = 'worktrees'"
          >
            <FolderGit2 class="w-3.5 h-3.5" />
            <span>Worktrees Paralel ({{ worktreeList.length }})</span>
          </button>
        </div>

        <!-- TAB 1: BRANCHES -->
        <div v-if="activeTab === 'branches'" class="space-y-3">
          <!-- Create New Branch Form -->
          <div class="flex items-center gap-2">
            <input
              v-model="newBranchName"
              type="text"
              placeholder="Nama branch baru..."
              class="flex-1 min-w-0 bg-[#0d0e14] border border-border/80 focus:border-primary rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono transition-colors"
              @keydown.enter="handleCreateBranch"
            />
            <button
              :disabled="!newBranchName.trim() || isCreatingBranch"
              class="px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-lg font-medium transition-colors disabled:opacity-40 flex-shrink-0 whitespace-nowrap shadow-sm cursor-pointer"
              @click="handleCreateBranch"
            >
              {{ isCreatingBranch ? 'Membuat...' : 'Buat Branch' }}
            </button>
          </div>

          <!-- Branch List -->
          <div class="space-y-1 max-h-60 overflow-y-auto font-mono text-xs pr-0.5">
            <div
              v-for="b in gitBranchesList"
              :key="b"
              :class="[
                'group flex items-center justify-between px-3 py-2 rounded-lg transition-colors select-none',
                b === gitBranch
                  ? 'bg-primary/20 text-foreground border border-primary/40 font-medium'
                  : 'hover:bg-[#14151f] text-muted-foreground hover:text-foreground border border-transparent'
              ]"
            >
              <div
                class="flex items-center gap-2 min-w-0 flex-1 pr-2 cursor-pointer"
                :title="b === gitBranch ? 'Branch aktif saat ini' : `Klik untuk switch ke branch ${b}`"
                @click="handleSwitchBranch(b)"
              >
                <GitBranch :class="['w-3.5 h-3.5 flex-shrink-0', b === gitBranch ? 'text-primary' : 'text-muted-foreground']" />
                <span class="truncate font-mono text-[11px]">{{ b }}</span>
                <span
                  v-if="b === gitBranch"
                  class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-primary/20 text-primary flex-shrink-0 whitespace-nowrap font-mono"
                >
                  Active
                </span>
              </div>

              <!-- Quick Action: Buka di Worktree & Terminal Baru -->
              <UiTooltip text="Buka branch ini di Terminal Worktree baru (tanpa ganti branch aktif)" side="left">
                <button
                  class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-primary/20 text-primary hover:text-primary/90 transition-all flex items-center gap-1 text-[10px] font-sans font-medium cursor-pointer"
                  @click.stop="handleQuickOpenBranchInWorktree(b)"
                >
                  <Split class="w-3 h-3" />
                  <span class="hidden sm:inline">Worktree</span>
                </button>
              </UiTooltip>
            </div>

            <div v-if="gitBranchesList.length === 0" class="p-4 text-center text-xs text-muted-foreground">
              Tidak ada branch ditemukan
            </div>
          </div>
        </div>

        <!-- TAB 2: WORKTREES (PARALEL) -->
        <div v-else-if="activeTab === 'worktrees'" class="space-y-3.5">
          <!-- Active Worktrees List -->
          <div>
            <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center justify-between">
              <span>Worktrees Aktif</span>
              <span class="text-muted-foreground/70 font-mono text-[9px]">1 Repo • Banyak Terminal</span>
            </div>

            <div class="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
              <div
                v-for="wt in worktreeList"
                :key="wt.path"
                class="flex items-center justify-between p-2 rounded-lg bg-[#0d0e14] border border-border/60 text-xs font-mono group"
              >
                <div class="min-w-0 flex-1 pr-2">
                  <div class="flex items-center gap-1.5 text-foreground font-medium">
                    <GitBranch class="w-3 h-3 text-primary flex-shrink-0" />
                    <span class="truncate text-primary">{{ wt.branch || 'Detached' }}</span>
                    <span
                      v-if="wt.is_main"
                      class="text-[9px] px-1 py-0.2 rounded bg-muted/60 text-muted-foreground uppercase font-sans font-semibold"
                    >
                      Utama
                    </span>
                  </div>
                  <div class="text-[10px] text-muted-foreground truncate font-mono mt-0.5" :title="wt.path">
                    {{ wt.path }}
                  </div>
                </div>

                <div class="flex items-center gap-1 flex-shrink-0">
                  <UiTooltip text="Buka tab terminal baru di folder worktree ini" side="top">
                    <button
                      class="px-2 py-1 rounded bg-primary/20 hover:bg-primary/30 text-primary text-[10px] font-sans font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      @click="handleOpenWorktreeTerminal(wt.path, wt.branch)"
                    >
                      <Terminal class="w-3 h-3" />
                      <span>Terminal</span>
                    </button>
                  </UiTooltip>

                  <UiTooltip v-if="!wt.is_main" text="Hapus worktree ini dari disk" side="top">
                    <button
                      class="p-1 rounded hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                      @click="handleRemoveWorktree(wt.path, wt.branch)"
                    >
                      <Trash2 class="w-3.5 h-3.5" />
                    </button>
                  </UiTooltip>
                </div>
              </div>

              <div v-if="worktreeList.length === 0" class="p-3 text-center text-xs text-muted-foreground bg-[#0d0e14] rounded-lg">
                Belum ada worktree tambahan. Buat di bawah ini.
              </div>
            </div>
          </div>

          <!-- Create New Worktree Section -->
          <div class="p-2.5 rounded-lg bg-[#14151f] border border-border/70 space-y-2.5">
            <div class="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FolderPlus class="w-3.5 h-3.5 text-primary" />
              <span>Buat & Buka Worktree Baru</span>
            </div>

            <!-- Branch Selection or New Branch -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Pilih Branch:</span>
                <label class="flex items-center gap-1.5 cursor-pointer text-foreground text-[10px]">
                  <input
                    v-model="createNewBranchForWorktree"
                    type="checkbox"
                    class="rounded border-border bg-[#0d0e14] text-primary focus:ring-0 cursor-pointer"
                  />
                  <span>Buat branch baru</span>
                </label>
              </div>

              <input
                v-if="createNewBranchForWorktree"
                v-model="newWorktreeBranchName"
                type="text"
                placeholder="Nama branch baru (misal: feature-payment)..."
                class="w-full bg-[#0d0e14] border border-border/80 focus:border-primary rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono transition-colors"
              />
              <select
                v-else
                v-model="selectedWorktreeBranch"
                class="w-full bg-[#0d0e14] border border-border/80 focus:border-primary rounded-lg px-2.5 py-1.5 text-xs text-foreground outline-none font-mono transition-colors cursor-pointer"
              >
                <option v-for="b in gitBranchesList" :key="b" :value="b">
                  {{ b }} {{ b === gitBranch ? '(aktif)' : '' }}
                </option>
              </select>
            </div>

            <!-- Folder Name Input -->
            <div class="space-y-1">
              <span class="text-[11px] text-muted-foreground">Nama Folder Tujuan:</span>
              <input
                v-model="customWorktreeName"
                type="text"
                placeholder="Nama folder (misal: MyProject-feature)..."
                class="w-full bg-[#0d0e14] border border-border/80 focus:border-primary rounded-lg px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono transition-colors"
              />
            </div>

            <button
              :disabled="(!selectedWorktreeBranch && !newWorktreeBranchName.trim()) || !customWorktreeName.trim() || isAddingWorktree"
              class="w-full py-1.5 px-3 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-lg font-medium transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              @click="handleCreateWorktreeSubmit"
            >
              <Terminal class="w-3.5 h-3.5" />
              <span>{{ isAddingWorktree ? 'Menyiapkan Worktree...' : 'Buat Worktree & Buka di Terminal' }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

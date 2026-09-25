<script setup lang="ts">
import {
  FolderKanban,
  FolderOpen,
  Folder,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Terminal,
  Square,
  Columns2,
  Rows2,
  LayoutGrid as GridIcon,
  Sparkles,
  Command,
  Copy,
  Pencil,
  Trash2,
  Check,
  Search,
  ExternalLink,
  FilePlus,
  FolderPlus,
  Clock,
  X,
  GitBranch,
  GitCommit,
  GitCompare,
  RotateCcw,
  UploadCloud,
  DownloadCloud,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Image,
  Layers,
  History,
  Minus,
  List,
  Network
} from 'lucide-vue-next'
import type { FileEntry } from '~/types/terminal'
import type { GitTreeNode } from '~/components/GitFileTreeItem.vue'

const {
  activeWorkstation,
  terminals,
  activeTerminalId,
  currentLayout,
  isSidebarOpen,
  backgroundAlerts,
  toggleSidebar,
  addTerminal,
  duplicateTerminal,
  removeTerminal,
  moveTerminalTab,
  renameTerminal,
  setLayout
} = useWorkspaceStore()

const {
  gitStatusMap,
  gitBranch,
  gitOverview,
  gitBranchesList,
  gitCommitLogs,
  changedFilesList,
  pickFolder,
  readDirectory,
  refreshGitStatus,
  fetchBranches,
  switchBranch,
  createBranch,
  fetchCommitLogs,
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  discardFile,
  pushGit,
  pullGit,
  getFileHead,
  scanProjectFiles,
  recentProjects,
  loadRecentProjects,
  removeRecentProject,
  createFile,
  createFolder,
  renamePath,
  deletePath,
  gitCommit,
  setWorkstationFolder,
  revealInExplorer
} = useProjectExplorer()

const { openFile, openGitDiffTab } = useEditorStore()
const { showAppAlert, showAppConfirm, showAppPrompt } = useAppDialog()

const emit = defineEmits<{
  (e: 'open-presets'): void
  (e: 'open-palette'): void
}>()

const activeTab = ref<'explorer' | 'git' | 'terminals'>('explorer')
const rootEntries = ref<FileEntry[]>([])
const isLoadingRoot = ref(false)
const searchQuery = ref('')
const editingTermId = ref<string | null>(null)
const editingTitle = ref('')

// Git State
const commitMessage = ref('')
const isCommitting = ref(false)
const isPushing = ref(false)
const isPulling = ref(false)
const commitResultMsg = ref<string | null>(null)
const showBranchPicker = ref(false)
const showGitGraphModal = ref(false)
const showBranchCompareModal = ref(false)
const showCommitHistory = ref(false)
const gitViewMode = ref<'tree' | 'list'>('tree')

// Helper untuk membangun struktur folder tree dari daftar Git File Entry
const buildGitTree = (files: { path: string; name: string; status: string; is_staged?: boolean; is_untracked?: boolean }[]): GitTreeNode[] => {
  const rootNodes: GitTreeNode[] = []

  for (const file of files) {
    const normPath = file.path.replace(/\\/g, '/')
    const parts = normPath.split('/')
    let currentChildren = rootNodes
    let accumulatedPath = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (part === undefined) continue
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part
      const isFile = i === parts.length - 1

      if (isFile) {
        currentChildren.push({
          name: part,
          path: normPath,
          isDir: false,
          status: file.status,
          isStaged: file.is_staged,
          isUntracked: file.is_untracked
        })
      } else {
        let folderNode = currentChildren.find(n => n.isDir && n.name === part)
        if (!folderNode) {
          const newFolderNode: GitTreeNode = {
            name: part,
            path: accumulatedPath,
            isDir: true,
            children: []
          }
          currentChildren.push(newFolderNode)
          folderNode = newFolderNode
        }
        currentChildren = folderNode.children!
      }
    }
  }

  // Sort folders first then files
  const sortNodes = (nodes: GitTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1
      if (!a.isDir && b.isDir) return 1
      return a.name.localeCompare(b.name)
    })
    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children)
      }
    }
  }

  sortNodes(rootNodes)
  return rootNodes
}

const stagedTree = computed(() => buildGitTree(gitOverview.value.staged || []))
const unstagedTree = computed(() => buildGitTree([
  ...(gitOverview.value.unstaged || []).map(u => ({ ...u, is_untracked: false })),
  ...(gitOverview.value.untracked || []).map(u => ({ ...u, is_untracked: true }))
]))

// Tree Item Context Menu
const treeContextMenu = ref<{
  visible: boolean
  x: number
  y: number
  entry: FileEntry | null
}>({
  visible: false,
  x: 0,
  y: 0,
  entry: null
})

const treeContextMenuStyle = computed(() => {
  const menuWidth = 190
  const menuHeight = 240
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800

  let posX = treeContextMenu.value.x
  let posY = treeContextMenu.value.y

  if (posX + menuWidth > winWidth) {
    posX = Math.max(8, winWidth - menuWidth - 8)
  }
  if (posY + menuHeight > winHeight) {
    posY = Math.max(8, winHeight - menuHeight - 8)
  }

  return {
    left: `${Math.max(8, posX)}px`,
    top: `${Math.max(8, posY)}px`
  }
})

const closeTreeContextMenu = () => {
  treeContextMenu.value.visible = false
}

const onFileSaved = () => {
  refreshGitStatus()
}

const onWindowFocus = () => {
  refreshGitStatus()
}

onMounted(() => {
  loadRecentProjects()
  window.addEventListener('click', closeTreeContextMenu)
  window.addEventListener('mytermin-file-saved', onFileSaved)
  window.addEventListener('focus', onWindowFocus)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeTreeContextMenu)
  window.removeEventListener('mytermin-file-saved', onFileSaved)
  window.removeEventListener('focus', onWindowFocus)
})

const loadProjectFiles = async () => {
  if (!activeWorkstation.value?.folderPath) {
    rootEntries.value = []
    return
  }
  isLoadingRoot.value = true
  try {
    await refreshGitStatus()
    rootEntries.value = await readDirectory(activeWorkstation.value.folderPath)
    await scanProjectFiles()
  } finally {
    isLoadingRoot.value = false
  }
}

watch(
  () => activeWorkstation.value?.folderPath,
  () => {
    loadProjectFiles()
  },
  { immediate: true }
)

const handleOpenFolder = async () => {
  const folder = await pickFolder()
  if (folder) {
    await setWorkstationFolder(folder)
    await loadProjectFiles()
  }
}

const handleSelectFile = (entry: FileEntry) => {
  openFile(entry.path)
}

const handleOpenTerminalAtFolder = (dirPath: string) => {
  const folderName = dirPath.split(/[\\/]/).pop() || 'Terminal'
  addTerminal({
    title: folderName,
    cwd: dirPath
  })
}

// Git Actions
const handleCommit = async () => {
  if (!commitMessage.value.trim() || isCommitting.value) return
  isCommitting.value = true
  commitResultMsg.value = null

  try {
    const res = await gitCommit(commitMessage.value.trim())
    if (res.success) {
      commitMessage.value = ''
      commitResultMsg.value = 'Commit berhasil!'
      setTimeout(() => {
        commitResultMsg.value = null
      }, 2500)
    } else {
      await showAppAlert(`Gagal commit: ${res.error}`, 'Git Commit Error')
    }
  } finally {
    isCommitting.value = false
  }
}

const handleOpenDiff = async (relPath: string) => {
  const root = activeWorkstation.value?.folderPath
  if (!root) return
  const fullPath = `${root.replace(/[\\/]+$/, '')}/${relPath.replace(/^[\\/]+/, '')}`.replace(/\//g, '\\')
  const headContent = await getFileHead(relPath)
  await openGitDiffTab(fullPath, relPath, headContent)
}

const handlePush = async () => {
  if (isPushing.value) return
  isPushing.value = true
  try {
    const res = await pushGit()
    if (res.success) {
      commitResultMsg.value = 'Push berhasil!'
      setTimeout(() => { commitResultMsg.value = null }, 2500)
    } else {
      await showAppAlert(`Push gagal: ${res.error}`, 'Git Push Error')
    }
  } finally {
    isPushing.value = false
  }
}

const handlePull = async () => {
  if (isPulling.value) return
  isPulling.value = true
  try {
    const res = await pullGit()
    if (res.success) {
      commitResultMsg.value = 'Pull berhasil!'
      setTimeout(() => { commitResultMsg.value = null }, 2500)
    } else {
      await showAppAlert(`Pull gagal: ${res.error}`, 'Git Pull Error')
    }
  } finally {
    isPulling.value = false
  }
}

const openBranchModal = async () => {
  await fetchBranches()
  showBranchPicker.value = true
}

const handleStageFolder = async (files: string[]) => {
  for (const filePath of files) {
    await stageFile(filePath)
  }
}

const handleUnstageFolder = async (files: string[]) => {
  for (const filePath of files) {
    await unstageFile(filePath)
  }
}

const handleDiscardFolder = async (payload: { folderName: string; files: { path: string; isUntracked: boolean }[] }) => {
  const confirmed = await showAppConfirm(
    `Apakah Anda yakin ingin membuang semua perubahan (${payload.files.length} file) di folder "${payload.folderName}"? Tindakan ini tidak dapat dibatalkan.`,
    'Discard Folder',
    'destructive',
    'Discard Semua'
  )
  if (!confirmed) return

  for (const file of payload.files) {
    await discardFile(file.path, file.isUntracked)
  }
}

const toggleHistory = async () => {
  showCommitHistory.value = !showCommitHistory.value
  if (showCommitHistory.value) {
    await fetchCommitLogs()
  }
}

// File Operations
const handleNewFile = async (parentPath?: string) => {
  const root = parentPath || activeWorkstation.value?.folderPath
  if (!root) return
  const name = await showAppPrompt(
    'Masukkan nama file baru beserta ekstensi:',
    'Buat File Baru',
    '',
    'contoh: index.ts, style.css'
  )
  if (!name || !name.trim()) return

  const fullPath = `${root.replace(/[\\/]+$/, '')}/${name.trim()}`.replace(/\//g, '\\')
  const ok = await createFile(fullPath)
  if (ok) {
    await loadProjectFiles()
    await openFile(fullPath)
  }
}

const handleNewFolder = async (parentPath?: string) => {
  const root = parentPath || activeWorkstation.value?.folderPath
  if (!root) return
  const name = await showAppPrompt(
    'Masukkan nama folder baru:',
    'Buat Folder Baru',
    '',
    'contoh: components, utils'
  )
  if (!name || !name.trim()) return

  const fullPath = `${root.replace(/[\\/]+$/, '')}/${name.trim()}`.replace(/\//g, '\\')
  const ok = await createFolder(fullPath)
  if (ok) {
    await loadProjectFiles()
  }
}

const handleRenameEntry = async (entry: FileEntry) => {
  const newName = await showAppPrompt(
    `Ubah nama "${entry.name}" menjadi:`,
    'Ubah Nama',
    entry.name
  )
  if (!newName || !newName.trim() || newName.trim() === entry.name) return

  const parentDir = entry.path.substring(0, Math.max(entry.path.lastIndexOf('\\'), entry.path.lastIndexOf('/')))
  const newPath = `${parentDir}/${newName.trim()}`.replace(/\//g, '\\')
  const ok = await renamePath(entry.path, newPath)
  if (ok) {
    await loadProjectFiles()
  }
}

const handleDeleteEntry = async (entry: FileEntry) => {
  const typeStr = entry.is_dir ? 'folder' : 'file'
  const ok = await showAppConfirm(
    `Yakin ingin menghapus ${typeStr} "${entry.name}" secara permanen? Tindakan ini tidak dapat dibatalkan.`,
    `Hapus ${typeStr.charAt(0).toUpperCase() + typeStr.slice(1)}`,
    'destructive',
    'Hapus'
  )
  if (!ok) return

  const success = await deletePath(entry.path)
  if (success) {
    await loadProjectFiles()
  }
}

const handleCopyPath = async (path: string) => {
  await navigator.clipboard.writeText(path)
}

const handleTreeContextAction = (payload: { action: string; entry: FileEntry; x: number; y: number }) => {
  treeContextMenu.value = {
    visible: true,
    x: payload.x,
    y: payload.y,
    entry: payload.entry
  }
}

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return { icon: FileCode, color: 'text-amber-400' }
  if (['vue', 'svelte'].includes(ext)) return { icon: FileCode, color: 'text-emerald-400' }
  if (['rs'].includes(ext)) return { icon: FileCode, color: 'text-orange-400' }
  if (['py'].includes(ext)) return { icon: FileCode, color: 'text-yellow-300' }
  if (['go'].includes(ext)) return { icon: FileCode, color: 'text-cyan-400' }
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return { icon: FileJson, color: 'text-yellow-400' }
  if (['md', 'txt', 'log'].includes(ext)) return { icon: FileText, color: 'text-sky-400' }
  if (['png', 'jpg', 'jpeg', 'svg', 'ico', 'webp'].includes(ext)) return { icon: Image, color: 'text-pink-400' }
  if (['css', 'scss', 'less'].includes(ext)) return { icon: FileSpreadsheet, color: 'text-blue-400' }
  return { icon: File, color: 'text-muted-foreground' }
}

const filteredEntries = computed(() => {
  if (!searchQuery.value.trim()) return rootEntries.value
  const query = searchQuery.value.toLowerCase()
  return rootEntries.value.filter((e) => e.name.toLowerCase().includes(query))
})

// Terminal Renaming
const startRename = (termId: string, currentTitle: string) => {
  editingTermId.value = termId
  editingTitle.value = currentTitle
  nextTick(() => {
    const input = document.getElementById(`sidebar-rename-input-${termId}`)
    input?.focus()
  })
}

const finishRename = (termId: string) => {
  if (editingTitle.value.trim()) {
    renameTerminal(termId, editingTitle.value.trim())
  }
  editingTermId.value = null
}
</script>

<template>
  <aside
    :class="[
      'h-full bg-[#12131a] border-r border-border flex flex-col transition-all duration-200 select-none z-20 flex-shrink-0 relative',
      isSidebarOpen ? 'w-64' : 'w-12'
    ]"
  >
    <!-- Sidebar Top Header -->
    <div class="flex items-center justify-between h-10 px-2.5 border-b border-border bg-[#0f1016]">
      <div v-if="isSidebarOpen" class="flex items-center gap-1.5 overflow-hidden">
        <FolderKanban class="w-4 h-4 text-primary flex-shrink-0" />
        <span class="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">
          {{ activeTab === 'explorer' ? 'Explorer' : activeTab === 'git' ? 'Source Control' : 'Terminals' }}
        </span>
      </div>

      <div v-else class="w-full flex justify-center">
        <FolderKanban class="w-4 h-4 text-primary" :title="activeWorkstation.name" />
      </div>

      <!-- Header Actions -->
      <div v-if="isSidebarOpen" class="flex items-center gap-0.5">
        <template v-if="activeTab === 'explorer' && activeWorkstation.folderPath">
          <button
            class="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title="File Baru"
            @click="handleNewFile()"
          >
            <FilePlus class="w-3.5 h-3.5" />
          </button>
          <button
            class="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Folder Baru"
            @click="handleNewFolder()"
          >
            <FolderPlus class="w-3.5 h-3.5" />
          </button>
          <button
            class="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh Explorer & Git Status"
            @click="loadProjectFiles"
          >
            <RefreshCw :class="['w-3.5 h-3.5', isLoadingRoot && 'animate-spin']" />
          </button>
        </template>

        <template v-else-if="activeTab === 'git' && activeWorkstation.folderPath">
          <button
            class="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh Git Status"
            @click="refreshGitStatus"
          >
            <RefreshCw class="w-3.5 h-3.5" />
          </button>
        </template>

        <button
          class="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Toggle Sidebar"
          @click="toggleSidebar"
        >
          <ChevronLeft class="w-3.5 h-3.5" />
        </button>
      </div>
      <div v-else>
        <button
          class="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Buka Sidebar"
          @click="toggleSidebar"
        >
          <ChevronRight class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Mode Selector Tab (Expanded Sidebar) -->
    <div v-if="isSidebarOpen" class="flex border-b border-border bg-[#0d0e14]">
      <button
        :class="[
          'flex-1 py-1.5 text-[11px] font-medium transition-colors border-b-2 text-center',
          activeTab === 'explorer'
            ? 'border-primary text-foreground bg-[#14151f]'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        ]"
        @click="activeTab = 'explorer'"
      >
        Files
      </button>

      <!-- Git Tab -->
      <button
        :class="[
          'flex-1 py-1.5 text-[11px] font-medium transition-colors border-b-2 text-center relative',
          activeTab === 'git'
            ? 'border-primary text-foreground bg-[#14151f]'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        ]"
        @click="activeTab = 'git'"
      >
        Git
        <span
          v-if="changedFilesList.length > 0"
          class="ml-1 px-1 py-0.2 bg-primary/20 text-primary rounded-full text-[9px] font-mono font-bold"
        >
          {{ changedFilesList.length }}
        </span>
      </button>

      <!-- Terminals Tab -->
      <button
        :class="[
          'flex-1 py-1.5 text-[11px] font-medium transition-colors border-b-2 text-center relative',
          activeTab === 'terminals'
            ? 'border-primary text-foreground bg-[#14151f]'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        ]"
        @click="activeTab = 'terminals'"
      >
        Term ({{ terminals.length }})
        <span
          v-if="Object.keys(backgroundAlerts).length > 0"
          class="absolute right-1 top-1.5 w-1.5 h-1.5 rounded-full bg-amber-400"
        />
      </button>
    </div>

    <!-- Mini Mode Icon Bar (Collapsed Sidebar) -->
    <div v-else class="flex flex-col items-center gap-2 py-3">
      <button
        :class="[
          'p-2 rounded-md transition-colors',
          activeTab === 'explorer' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
        ]"
        title="File Explorer"
        @click="activeTab = 'explorer'; toggleSidebar()"
      >
        <FolderOpen class="w-4 h-4" />
      </button>

      <button
        :class="[
          'p-2 rounded-md transition-colors relative',
          activeTab === 'git' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
        ]"
        title="Source Control (Git)"
        @click="activeTab = 'git'; toggleSidebar()"
      >
        <GitBranch class="w-4 h-4" />
        <span
          v-if="changedFilesList.length > 0"
          class="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary"
        />
      </button>

      <button
        :class="[
          'p-2 rounded-md transition-colors relative',
          activeTab === 'terminals' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
        ]"
        title="Terminals"
        @click="activeTab = 'terminals'; toggleSidebar()"
      >
        <Terminal class="w-4 h-4" />
        <span
          v-if="Object.keys(backgroundAlerts).length > 0"
          class="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400"
        />
      </button>
    </div>

    <!-- Tab 1: Project Explorer -->
    <div v-if="isSidebarOpen && activeTab === 'explorer'" class="flex-1 overflow-y-auto flex flex-col">
      <!-- Folder Header / Open Folder Prompt -->
      <div class="p-2 border-b border-border/50 bg-[#101118]">
        <div v-if="activeWorkstation.folderPath" class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            <FolderOpen class="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span class="text-xs font-semibold text-foreground truncate" :title="activeWorkstation.folderPath">
              {{ activeWorkstation.name }}
            </span>
          </div>
          <button
            class="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5 ml-1 flex-shrink-0 font-medium"
            title="Ganti Folder Project"
            @click="handleOpenFolder"
          >
            Change
          </button>
        </div>

        <div v-else class="py-2 text-center">
          <button
            class="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-primary/20 hover:bg-primary/30 text-primary rounded text-xs font-medium transition-colors"
            @click="handleOpenFolder"
          >
            <FolderOpen class="w-3.5 h-3.5" />
            <span>Buka Folder Project</span>
          </button>
        </div>
      </div>

      <!-- Search Input Filter -->
      <div v-if="activeWorkstation.folderPath" class="px-2 py-1 border-b border-border/40 bg-[#0d0e14]">
        <div class="flex items-center gap-1 bg-[#181924] px-2 py-1 rounded text-xs border border-border/50">
          <Search class="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter file..."
            class="bg-transparent border-none outline-none text-[11px] text-foreground placeholder:text-muted-foreground w-full"
          />
        </div>
      </div>

      <!-- File Tree Container -->
      <div class="flex-1 overflow-y-auto p-1 font-mono">
        <div v-if="isLoadingRoot" class="p-4 text-center text-xs text-muted-foreground">
          Memuat file project...
        </div>
        <div v-else-if="!activeWorkstation.folderPath" class="p-3 space-y-3 font-sans">
          <div class="text-xs text-muted-foreground">
            Belum ada folder project terbuka
          </div>

          <!-- Recent Projects Section -->
          <div v-if="recentProjects.length > 0" class="space-y-2 pt-2 border-t border-border/40">
            <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <div class="flex items-center gap-1.5">
                <Clock class="w-3.5 h-3.5 text-primary" />
                <span>Project yang Pernah Dibuka</span>
              </div>
              <span class="px-1.5 py-0.2 rounded bg-muted/60 text-[9px] font-mono">{{ recentProjects.length }}</span>
            </div>

            <div class="space-y-1 max-h-80 overflow-y-auto no-scrollbar">
              <div
                v-for="rec in recentProjects"
                :key="rec.path"
                class="group flex items-center justify-between p-2 rounded bg-[#161722] hover:bg-[#1f2030] cursor-pointer transition-colors border border-border/40"
                @click="setWorkstationFolder(rec.path)"
              >
                <div class="min-w-0 flex-1 pr-1">
                  <div class="text-xs font-medium text-foreground truncate">{{ rec.name }}</div>
                  <div class="text-[10px] text-muted-foreground/60 truncate font-mono" :title="rec.path">
                    {{ rec.path }}
                  </div>
                </div>
                <button
                  class="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Hapus dari Riwayat"
                  @click.stop="removeRecentProject(rec.path)"
                >
                  <X class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="filteredEntries.length === 0" class="p-4 text-center text-xs text-muted-foreground">
          Tidak ada file ditemukan
        </div>
        <FileTreeNode
          v-for="entry in filteredEntries"
          v-else
          :key="entry.path"
          :entry="entry"
          :root-path="activeWorkstation.folderPath"
          @select-file="handleSelectFile"
          @open-terminal-here="handleOpenTerminalAtFolder"
          @refresh-tree="loadProjectFiles"
          @action-context="handleTreeContextAction"
        />
      </div>
    </div>

    <!-- Tab 2: Source Control (Git) View -->
    <div v-if="isSidebarOpen && activeTab === 'git'" class="flex-1 overflow-hidden flex flex-col p-2 space-y-3 font-sans min-h-0">
      <div v-if="!activeWorkstation.folderPath" class="p-4 text-center text-xs text-muted-foreground">
        Buka folder project untuk menggunakan Git.
      </div>

      <template v-else>
        <!-- Branch & Sync Header Toolbar -->
        <div class="flex items-center justify-between p-2 rounded bg-[#161722] border border-border/50 text-xs font-mono flex-shrink-0">
          <!-- Branch Switcher Trigger -->
          <button
            class="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors min-w-0 font-medium truncate"
            title="Klik untuk beralih atau membuat branch"
            @click="openBranchModal"
          >
            <GitBranch class="w-3.5 h-3.5 flex-shrink-0" />
            <span class="truncate font-semibold">{{ gitBranch || 'Branch' }}</span>
            <ChevronDown class="w-3 h-3 flex-shrink-0 opacity-60" />
          </button>

          <!-- Push, Pull, Refresh Actions -->
          <div class="flex items-center gap-1 flex-shrink-0">
            <!-- Git Graph Button -->
            <button
              class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              title="Buka Visual Git Commit Graph"
              @click="showGitGraphModal = true"
            >
              <GitCommit class="w-3.5 h-3.5 text-primary" />
            </button>
            <!-- Branch Compare Button -->
            <button
              class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              title="Buka Branch Compare & Diff"
              @click="showBranchCompareModal = true"
            >
              <GitCompare class="w-3.5 h-3.5 text-indigo-400" />
            </button>
            <!-- Toggle Tree vs List View -->
            <button
              class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              :title="gitViewMode === 'tree' ? 'Ganti ke Tampilan Daftar (List View)' : 'Ganti ke Tampilan Pohon Folder (Tree View)'"
              @click="gitViewMode = gitViewMode === 'tree' ? 'list' : 'tree'"
            >
              <Network v-if="gitViewMode === 'tree'" class="w-3.5 h-3.5 text-primary" />
              <List v-else class="w-3.5 h-3.5" />
            </button>
            <button
              class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              :disabled="isPulling"
              title="Pull Perubahan Remote (git pull)"
              @click="handlePull"
            >
              <DownloadCloud :class="['w-3.5 h-3.5', isPulling && 'animate-bounce text-primary']" />
            </button>
            <button
              class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              :disabled="isPushing"
              title="Push Commit ke Remote (git push)"
              @click="handlePush"
            >
              <UploadCloud :class="['w-3.5 h-3.5', isPushing && 'animate-bounce text-primary']" />
            </button>
            <button
              class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh Git Status"
              @click="refreshGitStatus"
            >
              <RefreshCw class="w-3 h-3" />
            </button>
          </div>
        </div>

        <!-- Quick Commit Box -->
        <div class="space-y-1.5 flex-shrink-0">
          <textarea
            v-model="commitMessage"
            rows="2"
            placeholder="Pesan commit (Ctrl+Enter)..."
            class="w-full bg-[#0d0e14] border border-border/70 rounded p-2 text-xs text-foreground placeholder:text-muted-foreground outline-none resize-none focus:border-primary font-mono"
            @keydown.ctrl.enter="handleCommit"
          />

          <button
            :disabled="!commitMessage.trim() || isCommitting"
            class="w-full py-1.5 px-3 rounded bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-xs font-medium flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            @click="handleCommit"
          >
            <GitCommit class="w-3.5 h-3.5" />
            <span>{{ isCommitting ? 'Menyimpan...' : 'Commit Perubahan' }}</span>
          </button>

          <div v-if="commitResultMsg" class="text-[11px] text-emerald-400 text-center font-mono py-0.5">
            {{ commitResultMsg }}
          </div>
        </div>

        <!-- Staged Changes Section (if any) -->
        <div v-if="gitOverview.staged.length > 0" class="space-y-1">
          <div class="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
            <span>Staged Changes ({{ gitOverview.staged.length }})</span>
            <button
              class="hover:text-foreground text-[10px] flex items-center gap-0.5 p-0.5"
              title="Unstage Semua"
              @click="unstageAll"
            >
              <Minus class="w-3 h-3" />
              <span>Unstage All</span>
            </button>
          </div>

          <!-- Tree View -->
          <div v-if="gitViewMode === 'tree'" class="space-y-0.5">
            <GitFileTreeItem
              v-for="node in stagedTree"
              :key="`staged-tree-${node.path}`"
              :node="node"
              mode="staged"
              @open-diff="handleOpenDiff"
              @unstage="unstageFile"
              @unstage-folder="handleUnstageFolder"
            />
          </div>

          <!-- List View -->
          <div v-else class="space-y-0.5 font-mono">
            <div
              v-for="item in gitOverview.staged"
              :key="`staged-${item.path}`"
              class="group flex items-center justify-between p-1 rounded hover:bg-[#181924] cursor-pointer text-xs transition-colors"
              :title="`Klik untuk melihat Diff: ${item.path}`"
              @click="handleOpenDiff(item.path)"
            >
              <div class="flex items-center gap-1.5 min-w-0 flex-1">
                <component :is="getFileIcon(item.name).icon" :class="['w-3.5 h-3.5 flex-shrink-0', getFileIcon(item.name).color]" />
                <span class="truncate text-foreground text-[11px]">{{ item.name }}</span>
                <span class="truncate text-muted-foreground/60 text-[9px] font-mono">{{ item.path.includes('/') ? item.path.substring(0, item.path.lastIndexOf('/')) : '' }}</span>
              </div>

              <div class="relative flex items-center justify-end min-w-[24px] flex-shrink-0">
                <span class="text-[9px] font-bold px-1 rounded bg-green-500/20 text-green-400 group-hover:hidden">
                  {{ item.status }}
                </span>
                <div class="hidden group-hover:flex items-center gap-1">
                  <button
                    class="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    title="Unstage File"
                    @click.stop="unstageFile(item.path)"
                  >
                    <Minus class="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Changes Section (Unstaged & Untracked) -->
        <div class="flex-1 flex flex-col space-y-1 pt-1 min-h-0">
          <div class="flex items-center justify-between text-[10px] font-bold uppercase text-muted-foreground tracking-wider flex-shrink-0">
            <span>Changes ({{ gitOverview.unstaged.length + gitOverview.untracked.length }})</span>
            <button
              v-if="gitOverview.unstaged.length + gitOverview.untracked.length > 0"
              class="hover:text-foreground text-[10px] flex items-center gap-0.5 p-0.5"
              title="Stage Semua"
              @click="stageAll"
            >
              <Plus class="w-3 h-3" />
              <span>Stage All</span>
            </button>
          </div>

          <div v-if="gitOverview.unstaged.length === 0 && gitOverview.untracked.length === 0 && gitOverview.staged.length === 0" class="p-4 text-center text-xs text-muted-foreground font-mono">
            Tidak ada perubahan (Clean Working Tree)
          </div>

          <div v-else class="space-y-0.5 overflow-y-auto flex-1 min-h-0 font-mono pr-0.5">
            <!-- Tree View for Unstaged & Untracked -->
            <div v-if="gitViewMode === 'tree'" class="space-y-0.5">
              <GitFileTreeItem
                v-for="node in unstagedTree"
                :key="`unstaged-tree-${node.path}`"
                :node="node"
                mode="unstaged"
                @open-diff="handleOpenDiff"
                @stage="stageFile"
                @discard="discardFile($event.path, $event.isUntracked)"
                @stage-folder="handleStageFolder"
                @discard-folder="handleDiscardFolder"
              />
            </div>

            <!-- List View -->
            <template v-else>
              <!-- Unstaged Tracked Changes -->
              <div
                v-for="item in gitOverview.unstaged"
                :key="`unstaged-${item.path}`"
                class="group flex items-center justify-between p-1 rounded hover:bg-[#181924] cursor-pointer text-xs transition-colors"
                :title="`Klik untuk melihat Diff: ${item.path}`"
                @click="handleOpenDiff(item.path)"
              >
                <div class="flex items-center gap-1.5 min-w-0 flex-1">
                  <component :is="getFileIcon(item.name).icon" :class="['w-3.5 h-3.5 flex-shrink-0', getFileIcon(item.name).color]" />
                  <span class="truncate text-foreground text-[11px]">{{ item.name }}</span>
                  <span class="truncate text-muted-foreground/60 text-[9px] font-mono">{{ item.path.includes('/') ? item.path.substring(0, item.path.lastIndexOf('/')) : '' }}</span>
                </div>

                <div class="relative flex items-center justify-end min-w-[24px] flex-shrink-0">
                  <span class="text-[9px] font-bold px-1 rounded bg-amber-400/20 text-amber-400 group-hover:hidden">
                    {{ item.status }}
                  </span>
                  <div class="hidden group-hover:flex items-center gap-1">
                    <button
                      class="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                      title="Stage File (+)"
                      @click.stop="stageFile(item.path)"
                    >
                      <Plus class="w-3 h-3" />
                    </button>
                    <button
                      class="p-0.5 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      title="Discard Perubahan"
                      @click.stop="discardFile(item.path, false)"
                    >
                      <RotateCcw class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- Untracked Files -->
              <div
                v-for="item in gitOverview.untracked"
                :key="`untracked-${item.path}`"
                class="group flex items-center justify-between p-1 rounded hover:bg-[#181924] cursor-pointer text-xs transition-colors"
                :title="`Untracked: ${item.path}`"
                @click="handleOpenDiff(item.path)"
              >
                <div class="flex items-center gap-1.5 min-w-0 flex-1">
                  <component :is="getFileIcon(item.name).icon" :class="['w-3.5 h-3.5 flex-shrink-0', getFileIcon(item.name).color]" />
                  <span class="truncate text-emerald-400 text-[11px]">{{ item.name }}</span>
                  <span class="truncate text-muted-foreground/60 text-[9px] font-mono">{{ item.path.includes('/') ? item.path.substring(0, item.path.lastIndexOf('/')) : '' }}</span>
                </div>

                <div class="relative flex items-center justify-end min-w-[24px] flex-shrink-0">
                  <span class="text-[9px] font-bold px-1 rounded bg-emerald-400/20 text-emerald-400 group-hover:hidden">
                    U
                  </span>
                  <div class="hidden group-hover:flex items-center gap-1">
                    <button
                      class="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                      title="Stage File (+)"
                      @click.stop="stageFile(item.path)"
                    >
                      <Plus class="w-3 h-3" />
                    </button>
                    <button
                      class="p-0.5 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      title="Hapus File Untracked"
                      @click.stop="discardFile(item.path, true)"
                    >
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- Commit History Toggle & Section -->
        <div class="pt-2 border-t border-border/40 flex-shrink-0">
          <button
            class="w-full flex items-center justify-between py-1 px-1.5 rounded hover:bg-[#181924] text-[10px] font-bold uppercase text-muted-foreground tracking-wider transition-colors"
            @click="toggleHistory"
          >
            <div class="flex items-center gap-1.5">
              <History class="w-3.5 h-3.5 text-primary" />
              <span>Commit History</span>
            </div>
            <ChevronDown :class="['w-3 h-3 transition-transform', showCommitHistory && 'rotate-180']" />
          </button>

          <div v-if="showCommitHistory" class="mt-1 space-y-1 max-h-48 overflow-y-auto font-mono text-[10px]">
            <div v-if="gitCommitLogs.length === 0" class="p-2 text-center text-muted-foreground">
              Tidak ada log commit
            </div>
            <div
              v-for="log in gitCommitLogs"
              :key="log.hash"
              class="p-1.5 rounded bg-[#0d0e14] border border-border/40 space-y-0.5"
            >
              <div class="flex items-center justify-between">
                <span class="text-primary font-bold">{{ log.short_hash }}</span>
                <span class="text-muted-foreground/60">{{ log.relative_time }}</span>
              </div>
              <div class="text-foreground truncate font-sans text-[11px]">{{ log.message }}</div>
              <div class="text-muted-foreground/50 text-[9px]">{{ log.author }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Tab 3: Terminals List (Original Sidebar Content) -->
    <div v-if="isSidebarOpen && activeTab === 'terminals'" class="flex-1 overflow-y-auto flex flex-col p-2 space-y-3">
      <!-- Layout Quick Switch -->
      <div>
        <span class="text-[10px] font-bold uppercase text-muted-foreground mb-1.5 block">Layout Grid</span>
        <div class="grid grid-cols-4 gap-1">
          <button
            :class="[
              'p-1.5 rounded flex items-center justify-center transition-colors',
              currentLayout === 'single' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground'
            ]"
            title="Single Terminal"
            @click="setLayout('single')"
          >
            <Square class="w-3.5 h-3.5" />
          </button>
          <button
            :class="[
              'p-1.5 rounded flex items-center justify-center transition-colors',
              currentLayout === 'split-h' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground'
            ]"
            title="Split Horizontal (2 Kolom)"
            @click="setLayout('split-h')"
          >
            <Columns2 class="w-3.5 h-3.5" />
          </button>
          <button
            :class="[
              'p-1.5 rounded flex items-center justify-center transition-colors',
              currentLayout === 'split-v' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground'
            ]"
            title="Split Vertikal (2 Baris)"
            @click="setLayout('split-v')"
          >
            <Rows2 class="w-3.5 h-3.5" />
          </button>
          <button
            :class="[
              'p-1.5 rounded flex items-center justify-center transition-colors',
              currentLayout === 'grid-2x2' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 hover:bg-muted text-muted-foreground'
            ]"
            title="Grid 2x2"
            @click="setLayout('grid-2x2')"
          >
            <GridIcon class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Active Terminals List -->
      <div class="flex-1 flex flex-col">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-bold uppercase text-muted-foreground">Panes Aktif</span>
          <button
            class="text-[10px] text-primary hover:underline flex items-center gap-0.5"
            @click="addTerminal()"
          >
            <Plus class="w-3 h-3" />
            <span>Tambah</span>
          </button>
        </div>

        <div class="space-y-1">
          <div
            v-for="term in terminals"
            :key="term.id"
            :class="[
              'group flex items-center justify-between p-1.5 rounded text-xs cursor-pointer transition-colors border',
              activeTerminalId === term.id
                ? 'bg-[#1e1f2b] text-foreground border-primary/50'
                : 'text-muted-foreground hover:bg-[#14151f] hover:text-foreground border-transparent'
            ]"
            @click="activeTerminalId = term.id"
          >
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <Terminal class="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <input
                v-if="editingTermId === term.id"
                :id="`sidebar-rename-input-${term.id}`"
                v-model="editingTitle"
                type="text"
                class="bg-background border border-primary px-1 py-0.5 text-xs text-foreground outline-none rounded w-full"
                @blur="finishRename(term.id)"
                @keydown.enter="finishRename(term.id)"
                @click.stop
              />
              <span v-else class="truncate font-mono">{{ term.title }}</span>
            </div>

            <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                class="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                title="Ganti Nama"
                @click.stop="startRename(term.id, term.title)"
              >
                <Pencil class="w-3 h-3" />
              </button>
              <button
                v-if="terminals.length > 1"
                class="p-0.5 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive"
                title="Tutup Pane"
                @click.stop="removeTerminal(term.id)"
              >
                <Trash2 class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Git Branch Selection / Creation Modal -->
    <GitBranchModal v-model:open="showBranchPicker" />

    <!-- Visual Git Commit Graph Modal -->
    <GitGraphModal v-model:open="showGitGraphModal" />

    <!-- Visual Branch Compare & Diff Modal -->
    <BranchCompareModal v-model:open="showBranchCompareModal" />

    <!-- Tree Node Right-Click Context Menu -->
    <Teleport to="body">
      <div
        v-if="treeContextMenu.visible && treeContextMenu.entry"
        class="fixed z-[100] min-w-[175px] bg-[#14151f] border border-border/80 rounded-lg shadow-2xl p-1 text-xs font-sans text-foreground animate-in fade-in zoom-in-95 duration-100"
        :style="treeContextMenuStyle"
        @click.stop
      >
        <template v-if="treeContextMenu.entry.is_dir">
          <button
            class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
            @click="handleNewFile(treeContextMenu.entry?.path); closeTreeContextMenu()"
          >
            <FilePlus class="w-3.5 h-3.5 text-primary" />
            <span>File Baru di Sini</span>
          </button>
          <button
            class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
            @click="handleNewFolder(treeContextMenu.entry?.path); closeTreeContextMenu()"
          >
            <FolderPlus class="w-3.5 h-3.5 text-primary" />
            <span>Folder Baru di Sini</span>
          </button>
          <button
            class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
            @click="handleOpenTerminalAtFolder(treeContextMenu.entry?.path); closeTreeContextMenu()"
          >
            <Terminal class="w-3.5 h-3.5 text-primary" />
            <span>Buka Terminal di Sini</span>
          </button>
          <div class="my-1 border-t border-border/50" />
        </template>

        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
          @click="handleRenameEntry(treeContextMenu.entry); closeTreeContextMenu()"
        >
          <Pencil class="w-3.5 h-3.5 text-amber-400" />
          <span>Ubah Nama (Rename)</span>
        </button>
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
          @click="revealInExplorer(treeContextMenu.entry?.path || ''); closeTreeContextMenu()"
        >
          <FolderOpen class="w-3.5 h-3.5 text-muted-foreground" />
          <span>Buka di File Explorer</span>
        </button>
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
          @click="handleCopyPath(treeContextMenu.entry?.path || ''); closeTreeContextMenu()"
        >
          <Copy class="w-3.5 h-3.5 text-muted-foreground" />
          <span>Salin Path Lengkap</span>
        </button>
        <div class="my-1 border-t border-border/50" />
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-destructive/20 text-destructive text-left transition-colors"
          @click="handleDeleteEntry(treeContextMenu.entry); closeTreeContextMenu()"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Hapus Permanen</span>
        </button>
      </div>
    </Teleport>
  </aside>
</template>

<script setup lang="ts">
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Image,
  ChevronRight,
  ChevronDown,
  FilePlus,
  FolderPlus,
  Pencil,
  Trash2,
  Copy,
  Terminal
} from 'lucide-vue-next'
import type { FileEntry } from '~/types/terminal'

interface Props {
  entry: FileEntry
  depth?: number
  rootPath?: string
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
  rootPath: ''
})

const emit = defineEmits<{
  (e: 'select-file', entry: FileEntry): void
  (e: 'open-terminal-here', dirPath: string): void
  (e: 'refresh-tree'): void
  (e: 'action-context', payload: { action: string; entry: FileEntry; x: number; y: number }): void
}>()

const {
  gitStatusMap,
  readDirectory,
  renamePath,
  isFolderExpanded,
  setFolderExpanded,
  explorerRefreshVersion,
  filterOnlyGitChanges,
  isEntryOrChildrenChanged
} = useProjectExplorer()
const { showAppConfirm } = useAppDialog()
const { activeWorkstation } = useWorkspaceStore()
const collapseVersion = useState<number>('explorer-collapse-all-version', () => 0)

const currentRoot = computed(() => props.rootPath || activeWorkstation.value?.folderPath || '')

const isExpanded = ref(false)
const isLoading = ref(false)
const children = ref<FileEntry[]>([])
const hasLoaded = ref(false)
const isDragOver = ref(false)

const loadFolderChildren = async () => {
  if (!props.entry.is_dir) return
  isLoading.value = true
  try {
    children.value = await readDirectory(props.entry.path)
    hasLoaded.value = true
  } finally {
    isLoading.value = false
  }
}

// Sinkronkan status buka dari state konfigurasi (persisten lintas sesi)
watch(
  () => (props.entry.is_dir && currentRoot.value ? isFolderExpanded(props.entry.path, currentRoot.value) : false),
  async (expanded) => {
    if (props.entry.is_dir) {
      if (expanded && !isExpanded.value) {
        isExpanded.value = true
        if (!hasLoaded.value) {
          await loadFolderChildren()
        }
      } else if (!expanded && isExpanded.value) {
        isExpanded.value = false
      }
    }
  },
  { immediate: true }
)

// Perbarui isi folder saat refresh dipicu tanpa menutup folder
watch(explorerRefreshVersion, async () => {
  if (props.entry.is_dir && isExpanded.value) {
    await loadFolderChildren()
  }
})

watch(collapseVersion, () => {
  isExpanded.value = false
})

const handleDragStart = (e: DragEvent) => {
  if (e.dataTransfer) {
    e.dataTransfer.setData('text/plain', props.entry.path)
    e.dataTransfer.effectAllowed = 'move'
  }
}

const handleDragOver = (e: DragEvent) => {
  if (props.entry.is_dir) {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
    isDragOver.value = true
  }
}

const handleDragLeave = () => {
  isDragOver.value = false
}

const handleDrop = async (e: DragEvent) => {
  if (!props.entry.is_dir) return
  e.preventDefault()
  e.stopPropagation()
  isDragOver.value = false

  const sourcePath = e.dataTransfer?.getData('text/plain')
  if (!sourcePath || sourcePath === props.entry.path) return

  // Mencegah memindahkan folder ke dalam dirinya sendiri
  if (props.entry.path.startsWith(sourcePath)) return

  const fileName = sourcePath.split(/[\\/]/).pop() || ''
  if (!fileName) return

  const sep = props.entry.path.includes('/') ? '/' : '\\'
  const targetPath = `${props.entry.path.replace(/[\\/]+$/, '')}${sep}${fileName}`

  if (targetPath === sourcePath) return

  const confirmed = await showAppConfirm(
    `Pindahkan "${fileName}" ke folder "${props.entry.name}"?`,
    'Pindahkan Berkas',
    'Pindahkan'
  )
  if (!confirmed) return

  const ok = await renamePath(sourcePath, targetPath)
  if (ok) {
    emit('refresh-tree')
    if (isExpanded.value) {
      await refreshFolder()
    }
  }
}

const currentGitStatus = computed(() => {
  const root = (props.rootPath || activeWorkstation.value?.folderPath || '').replace(/\\/g, '/').replace(/\/+$/, '')
  const entryNorm = props.entry.path.replace(/\\/g, '/')
  
  if (!root) return props.entry.gitStatus
  
  const rel = entryNorm.startsWith(root)
    ? entryNorm.substring(root.length).replace(/^\/+/, '')
    : props.entry.name
    
  return gitStatusMap.value[rel] || props.entry.gitStatus
})

const folderHasGitChanges = computed(() => {
  if (!props.entry.is_dir) return false
  const root = (props.rootPath || activeWorkstation.value?.folderPath || '').replace(/\\/g, '/').replace(/\/+$/, '')
  const entryNorm = props.entry.path.replace(/\\/g, '/')
  if (!root) return false
  const rel = entryNorm.startsWith(root)
    ? entryNorm.substring(root.length).replace(/^\/+/, '')
    : props.entry.name
  
  const prefix = rel + '/'
  return Object.keys(gitStatusMap.value).some((k) => k.startsWith(prefix))
})

const displayedChildren = computed(() => {
  if (!filterOnlyGitChanges.value || !currentRoot.value) {
    return children.value
  }
  return children.value.filter((child) => isEntryOrChildrenChanged(child, currentRoot.value))
})

watch(
  () => filterOnlyGitChanges.value,
  async (onlyGit) => {
    if (onlyGit && props.entry.is_dir && folderHasGitChanges.value && !isExpanded.value) {
      isExpanded.value = true
      if (!hasLoaded.value) {
        await loadFolderChildren()
      }
    }
  },
  { immediate: true }
)

const toggleExpand = async () => {
  if (!props.entry.is_dir) {
    emit('select-file', props.entry)
    return
  }

  const nextState = !isExpanded.value
  isExpanded.value = nextState
  setFolderExpanded(props.entry.path, nextState, currentRoot.value)

  if (nextState && !hasLoaded.value) {
    await loadFolderChildren()
  }
}

const refreshFolder = async () => {
  if (props.entry.is_dir && isExpanded.value) {
    await loadFolderChildren()
  }
}

defineExpose({ refreshFolder })

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

const getGitStatusColor = (status?: string) => {
  if (!status) return ''
  const s = status.trim().toUpperCase()
  if (s.includes('M')) return 'text-amber-400 font-medium'
  if (s.includes('?') || s.includes('U')) return 'text-emerald-400 font-medium'
  if (s.includes('A')) return 'text-green-400 font-medium'
  if (s.includes('D')) return 'text-rose-400 font-medium'
  return 'text-sky-400 font-medium'
}

const getGitBadgeLabel = (status?: string) => {
  if (!status) return null
  const s = status.trim().toUpperCase()
  if (s.includes('M')) return 'M'
  if (s.includes('?') || s.includes('U')) return 'U'
  if (s.includes('A')) return 'A'
  if (s.includes('D')) return 'D'
  return s.charAt(0) || '•'
}

const handleContextMenu = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  emit('action-context', {
    action: 'context',
    entry: props.entry,
    x: e.clientX,
    y: e.clientY
  })
}
</script>

<template>
  <div class="select-none text-xs">
    <!-- Row Item -->
    <UiTooltip :text="entry.path" side="right" class="contents">
      <div
        :class="[
          'flex items-center gap-1.5 py-1 px-1.5 rounded-sm hover:bg-[#1e1f2b] cursor-pointer group transition-colors relative',
          entry.is_dir ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
          isDragOver ? 'ring-1 ring-primary bg-primary/20' : '',
          getGitStatusColor(currentGitStatus)
        ]"
        :style="{ paddingLeft: `${depth * 14 + 6}px` }"
        :draggable="true"
        @dragstart="handleDragStart"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="toggleExpand"
        @contextmenu="handleContextMenu"
      >
      <!-- Folder Arrow -->
      <span v-if="entry.is_dir" class="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0 text-muted-foreground">
        <ChevronDown v-if="isExpanded" class="w-3 h-3" />
        <ChevronRight v-else class="w-3 h-3" />
      </span>
      <span v-else class="w-3.5 h-3.5 flex-shrink-0" />

      <!-- Node Icon -->
      <template v-if="entry.is_dir">
        <FolderOpen v-if="isExpanded" class="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <Folder v-else :class="['w-3.5 h-3.5 flex-shrink-0', folderHasGitChanges ? 'text-amber-400' : 'text-primary/80']" />
      </template>
      <template v-else>
        <component
          :is="getFileIcon(entry.name).icon"
          :class="['w-3.5 h-3.5 flex-shrink-0', getFileIcon(entry.name).color]"
        />
      </template>

      <!-- Node Name -->
      <span :class="['truncate min-w-0 flex-1 font-mono text-[11px]', getGitStatusColor(currentGitStatus)]">
        {{ entry.name }}
      </span>

      <!-- Folder Modified Dot Indicator -->
      <UiTooltip
        v-if="entry.is_dir && folderHasGitChanges && !isExpanded"
        text="Folder memiliki file yang diubah"
        side="right"
        class="contents"
      >
        <span
          class="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
        />
      </UiTooltip>

      <!-- Git Status Badge -->
      <span
        v-if="currentGitStatus && getGitBadgeLabel(currentGitStatus)"
        :class="[
          'text-[9px] font-bold px-1 rounded font-mono flex-shrink-0 ml-1',
          currentGitStatus.includes('M') ? 'bg-amber-400/20 text-amber-400' :
          currentGitStatus.includes('?') ? 'bg-emerald-400/20 text-emerald-400' :
          currentGitStatus.includes('D') ? 'bg-rose-400/20 text-rose-400' : 'bg-primary/20 text-primary'
        ]"
      >
        {{ getGitBadgeLabel(currentGitStatus) }}
      </span>

      <!-- Quick Action: Buka Terminal di Folder ini (Hover) -->
      <UiTooltip
        v-if="entry.is_dir"
        text="Buka Terminal di Direktori Ini"
        side="right"
        class="contents"
      >
        <button
          class="hidden group-hover:flex items-center justify-center p-0.5 hover:bg-primary/20 text-muted-foreground hover:text-primary rounded ml-1 transition-colors"
          @click.stop="emit('open-terminal-here', entry.path)"
        >
          <Terminal class="w-3 h-3" />
        </button>
      </UiTooltip>
    </div>
    </UiTooltip>

    <!-- Children Nodes -->
    <div v-if="entry.is_dir && isExpanded">
      <div v-if="isLoading" class="py-1 text-[11px] text-muted-foreground/60" :style="{ paddingLeft: `${(depth + 1) * 14 + 6}px` }">
        Memuat...
      </div>
      <div v-else-if="displayedChildren.length === 0" class="py-1 text-[11px] text-muted-foreground/50 italic" :style="{ paddingLeft: `${(depth + 1) * 14 + 6}px` }">
        Folder kosong
      </div>
      <FileTreeNode
        v-for="child in displayedChildren"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        :root-path="rootPath"
        @select-file="(f) => emit('select-file', f)"
        @open-terminal-here="(p) => emit('open-terminal-here', p)"
        @refresh-tree="emit('refresh-tree')"
        @action-context="(payload) => emit('action-context', payload)"
      />
    </div>
  </div>
</template>

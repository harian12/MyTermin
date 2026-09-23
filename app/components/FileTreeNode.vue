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

const { gitStatusMap, readDirectory } = useProjectExplorer()
const { activeWorkstation } = useWorkspaceStore()
const isExpanded = ref(false)
const isLoading = ref(false)
const children = ref<FileEntry[]>([])
const hasLoaded = ref(false)

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

const toggleExpand = async () => {
  if (!props.entry.is_dir) {
    emit('select-file', props.entry)
    return
  }

  isExpanded.value = !isExpanded.value
  if (isExpanded.value && !hasLoaded.value) {
    isLoading.value = true
    try {
      children.value = await readDirectory(props.entry.path)
      hasLoaded.value = true
    } finally {
      isLoading.value = false
    }
  }
}

const refreshFolder = async () => {
  if (props.entry.is_dir && isExpanded.value) {
    isLoading.value = true
    try {
      children.value = await readDirectory(props.entry.path)
      hasLoaded.value = true
    } finally {
      isLoading.value = false
    }
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
    <div
      :class="[
        'flex items-center gap-1.5 py-1 px-1.5 rounded-sm hover:bg-[#1e1f2b] cursor-pointer group transition-colors relative',
        entry.is_dir ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground',
        getGitStatusColor(currentGitStatus)
      ]"
      :style="{ paddingLeft: `${depth * 14 + 6}px` }"
      :title="entry.path"
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
      <span
        v-if="entry.is_dir && folderHasGitChanges && !isExpanded"
        class="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
        title="Folder memiliki file yang diubah"
      />

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
      <button
        v-if="entry.is_dir"
        class="hidden group-hover:flex items-center justify-center p-0.5 hover:bg-primary/20 text-muted-foreground hover:text-primary rounded ml-1 transition-colors"
        title="Buka Terminal di Direktori Ini"
        @click.stop="emit('open-terminal-here', entry.path)"
      >
        <Terminal class="w-3 h-3" />
      </button>
    </div>

    <!-- Children Nodes -->
    <div v-if="entry.is_dir && isExpanded">
      <div v-if="isLoading" class="py-1 text-[11px] text-muted-foreground/60" :style="{ paddingLeft: `${(depth + 1) * 14 + 6}px` }">
        Memuat...
      </div>
      <div v-else-if="children.length === 0" class="py-1 text-[11px] text-muted-foreground/50 italic" :style="{ paddingLeft: `${(depth + 1) * 14 + 6}px` }">
        Folder kosong
      </div>
      <FileTreeNode
        v-for="child in children"
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

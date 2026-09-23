<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  Search,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Image,
  FolderOpen,
  Loader2
} from 'lucide-vue-next'
import { useProjectExplorer } from '~/composables/useProjectExplorer'
import { useEditorStore } from '~/composables/useEditorStore'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const { projectFileList, isScanningFiles, scanProjectFiles } = useProjectExplorer()
const { openFile, openFiles } = useEditorStore()
const { activeWorkstation } = useWorkspaceStore()

const searchQuery = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listContainerRef = ref<HTMLElement | null>(null)

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

const filteredFiles = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) {
    // Show first 50 files or recently open files
    return projectFileList.value.slice(0, 50)
  }
  return projectFileList.value
    .filter((f) => f.toLowerCase().includes(q))
    .slice(0, 50)
})

watch(
  () => props.open,
  (val) => {
    if (val) {
      searchQuery.value = ''
      selectedIndex.value = 0
      if (projectFileList.value.length === 0 && activeWorkstation.value.folderPath) {
        scanProjectFiles()
      }
      nextTick(() => {
        inputRef.value?.focus()
      })
    }
  }
)

watch(searchQuery, () => {
  selectedIndex.value = 0
})

const handleSelect = (relPath: string) => {
  const root = activeWorkstation.value.folderPath
  if (!root) return
  const fullPath = `${root.replace(/[\\/]+$/, '')}/${relPath.replace(/^[\\/]+/, '')}`.replace(/\//g, '\\')
  openFile(fullPath)
  emit('update:open', false)
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.open) return

  if (e.key === 'Escape') {
    e.preventDefault()
    emit('update:open', false)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (filteredFiles.value.length === 0) return
    selectedIndex.value = (selectedIndex.value + 1) % filteredFiles.value.length
    scrollToSelected()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (filteredFiles.value.length === 0) return
    selectedIndex.value = (selectedIndex.value - 1 + filteredFiles.value.length) % filteredFiles.value.length
    scrollToSelected()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (filteredFiles.value[selectedIndex.value]) {
      handleSelect(filteredFiles.value[selectedIndex.value])
    }
  }
}

const scrollToSelected = () => {
  nextTick(() => {
    if (!listContainerRef.value) return
    const el = listContainerRef.value.children[selectedIndex.value] as HTMLElement
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
    }
  })
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-16 px-4"
    @click="emit('update:open', false)"
  >
    <div
      class="bg-[#12131a] border border-border w-full max-w-xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[70vh] animate-in fade-in zoom-in-95 duration-100"
      @click.stop
    >
      <!-- Search Input Header -->
      <div class="flex items-center px-3.5 py-2.5 border-b border-border bg-[#181924]">
        <Search class="w-4 h-4 text-muted-foreground mr-2.5 flex-shrink-0" />
        <input
          ref="inputRef"
          v-model="searchQuery"
          type="text"
          placeholder="Ketik nama file untuk membuka di Editor (Ctrl+P)..."
          class="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground font-sans"
          @keydown="handleKeyDown"
        />
        <div v-if="isScanningFiles" class="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
          <Loader2 class="w-3.5 h-3.5 animate-spin text-primary" />
          <span>Indexing...</span>
        </div>
        <kbd class="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-muted border border-border rounded ml-2">ESC</kbd>
      </div>

      <!-- File Results List -->
      <div
        ref="listContainerRef"
        class="overflow-y-auto flex-1 p-1 max-h-[380px] divide-y divide-border/20 font-sans"
      >
        <div
          v-for="(fileRel, idx) in filteredFiles"
          :key="fileRel"
          :class="[
            'flex items-center justify-between px-3 py-2 rounded-md cursor-pointer text-xs select-none transition-colors',
            selectedIndex === idx ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-[#181924] hover:text-foreground'
          ]"
          @click="handleSelect(fileRel)"
          @mouseenter="selectedIndex = idx"
        >
          <div class="flex items-center gap-2.5 min-w-0">
            <component
              :is="getFileIcon(fileRel).icon"
              :class="['w-4 h-4 flex-shrink-0', getFileIcon(fileRel).color]"
            />
            <span class="font-medium text-foreground truncate font-mono">
              {{ fileRel.split('/').pop() }}
            </span>
            <span class="text-[11px] text-muted-foreground/60 truncate font-mono">
              {{ fileRel.substring(0, fileRel.lastIndexOf('/')) }}
            </span>
          </div>
          <span class="text-[10px] text-muted-foreground/50 font-mono flex-shrink-0 ml-2">Enter</span>
        </div>

        <!-- Empty State -->
        <div
          v-if="filteredFiles.length === 0 && !isScanningFiles"
          class="p-8 text-center text-muted-foreground text-xs"
        >
          <FolderOpen class="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>Tidak ada file yang cocok dengan "{{ searchQuery }}"</p>
        </div>
      </div>

      <!-- Footer Info -->
      <div class="flex items-center justify-between px-3 py-1.5 bg-[#0e0f14] border-t border-border/50 text-[10px] text-muted-foreground font-mono">
        <span>{{ projectFileList.length }} file terindeks</span>
        <div class="flex items-center gap-2">
          <span><kbd class="bg-muted px-1 py-0.5 rounded">↑↓</kbd> Navigasi</span>
          <span><kbd class="bg-muted px-1 py-0.5 rounded">↵</kbd> Buka</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  Search,
  Replace,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  MoreHorizontal,
  X,
  Loader2,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Image,
  Check
} from 'lucide-vue-next'
import { useProjectExplorer, type SearchResultItem } from '~/composables/useProjectExplorer'
import { useEditorStore } from '~/composables/useEditorStore'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'
import { useAppDialog } from '~/composables/useAppDialog'
import { updateMonacoModelContent } from '~/utils/monacoModelManager'

const { searchInFiles, replaceInFiles, pickFolder } = useProjectExplorer()
const { openFiles, openFileAtPosition } = useEditorStore()
const { activeWorkstation } = useWorkspaceStore()
const { showAppConfirm, showAppAlert } = useAppDialog()

const searchQuery = ref('')
const replaceQuery = ref('')
const isReplaceOpen = ref(true)
const matchCase = ref(false)
const matchWholeWord = ref(false)
const useRegex = ref(false)
const preserveCase = ref(false)
const showDetails = ref(false)
const filesToInclude = ref('')
const filesToExclude = ref('')

const isSearching = ref(false)
const isReplacing = ref(false)
const rawResults = ref<SearchResultItem[]>([])
const searchInputRef = ref<HTMLInputElement | null>(null)
const collapsedFiles = ref<Record<string, boolean>>({})
let debounceTimer: ReturnType<typeof setTimeout> | null = null

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

const performSearch = async () => {
  const q = searchQuery.value
  if (!q.trim()) {
    rawResults.value = []
    isSearching.value = false
    return
  }

  isSearching.value = true
  try {
    const root = activeWorkstation.value?.folderPath
    if (!root) {
      // Cari di file yang sedang dibuka jika folder belum dipilih
      const matches: SearchResultItem[] = []
      for (const f of openFiles.value) {
        if (f.isDiff || !f.content) continue
        const lines = f.content.split('\n')
        for (let idx = 0; idx < lines.length; idx++) {
          const line = lines[idx]!
          const lineToCheck = matchCase.value ? line : line.toLowerCase()
          const qToCheck = matchCase.value ? q : q.toLowerCase()
          const col = lineToCheck.indexOf(qToCheck)
          if (col >= 0) {
            matches.push({
              file_path: f.path || f.name,
              rel_path: f.name,
              line_number: idx + 1,
              line_content: line.trim(),
              col_start: col,
              col_end: col + q.length
            })
          }
        }
      }
      rawResults.value = matches
      return
    }

    const res = await searchInFiles(q, matchCase.value, 500)
    rawResults.value = res || []
  } finally {
    isSearching.value = false
  }
}

const triggerDebouncedSearch = () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    performSearch()
  }, 250)
}

watch([searchQuery, matchCase, matchWholeWord, useRegex], () => {
  triggerDebouncedSearch()
})

// Filter hasil sesuai Whole Word, Regex, dan Include/Exclude
const filteredResults = computed(() => {
  let list = rawResults.value
  const q = searchQuery.value
  if (!q) return []

  if (matchWholeWord.value) {
    const boundaryRegex = new RegExp(`\\b${escapeRegex(q)}\\b`, matchCase.value ? '' : 'i')
    list = list.filter(item => boundaryRegex.test(item.line_content))
  }

  if (useRegex.value) {
    try {
      const reg = new RegExp(q, matchCase.value ? '' : 'i')
      list = list.filter(item => reg.test(item.line_content))
    } catch {
      // Jika regex invalid, kembalikan kosong
      return []
    }
  }

  if (filesToInclude.value.trim()) {
    const incs = filesToInclude.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (incs.length > 0) {
      list = list.filter(item => {
        const p = item.rel_path.toLowerCase().replace(/\\/g, '/')
        return incs.some(inc => {
          const cleanInc = inc.replace(/^\.\//, '').replace(/^\*+/, '').replace(/\/+$/, '')
          if (!cleanInc) return true
          return p.startsWith(cleanInc) || p.includes(`/${cleanInc}`) || p.includes(cleanInc)
        })
      })
    }
  }

  if (filesToExclude.value.trim()) {
    const excs = filesToExclude.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (excs.length > 0) {
      list = list.filter(item => {
        const p = item.rel_path.toLowerCase().replace(/\\/g, '/')
        return !excs.some(exc => {
          const cleanExc = exc.replace(/^\.\//, '').replace(/^\*+/, '').replace(/\/+$/, '')
          if (!cleanExc) return false
          return p.startsWith(cleanExc) || p.includes(`/${cleanExc}`) || p.includes(cleanExc)
        })
      })
    }
  }

  return list
})

// Kelompokkan per file (seperti VS Code)
interface FileGroup {
  filePath: string
  relPath: string
  fileName: string
  dirPath: string
  items: SearchResultItem[]
}

const fileGroups = computed<FileGroup[]>(() => {
  const map = new Map<string, FileGroup>()
  for (const item of filteredResults.value) {
    let group = map.get(item.file_path)
    if (!group) {
      const norm = item.rel_path.replace(/\\/g, '/')
      const slashIdx = norm.lastIndexOf('/')
      const fileName = slashIdx >= 0 ? norm.substring(slashIdx + 1) : norm
      const dirPath = slashIdx >= 0 ? norm.substring(0, slashIdx) : ''

      group = {
        filePath: item.file_path,
        relPath: item.rel_path,
        fileName,
        dirPath,
        items: []
      }
      map.set(item.file_path, group)
    }
    group.items.push(item)
  }
  return Array.from(map.values())
})

const totalMatches = computed(() => filteredResults.value.length)
const totalFiles = computed(() => fileGroups.value.length)

const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const getHighlightedSegments = (line: string) => {
  const q = searchQuery.value
  if (!q) return [{ text: line, isMatch: false }]
  try {
    const pattern = useRegex.value ? q : escapeRegex(q)
    const flags = matchCase.value ? 'g' : 'gi'
    const reg = new RegExp(`(${pattern})`, flags)
    const parts = line.split(reg)
    return parts.map(part => {
      let isMatch = false
      if (matchCase.value) {
        isMatch = part === q
      } else {
        isMatch = part.toLowerCase() === q.toLowerCase()
      }
      return { text: part, isMatch }
    })
  } catch {
    return [{ text: line, isMatch: false }]
  }
}

const toggleFileCollapse = (filePath: string) => {
  collapsedFiles.value[filePath] = !collapsedFiles.value[filePath]
}

const areAllCollapsed = computed(() => {
  if (fileGroups.value.length === 0) return false
  return fileGroups.value.every(g => collapsedFiles.value[g.filePath])
})

const toggleCollapseAll = () => {
  const target = !areAllCollapsed.value
  for (const g of fileGroups.value) {
    collapsedFiles.value[g.filePath] = target
  }
}

const clearSearch = () => {
  searchQuery.value = ''
  rawResults.value = []
  searchInputRef.value?.focus()
}

const handleOpenMatch = (item: SearchResultItem) => {
  openFileAtPosition(item.file_path, item.line_number, item.col_start + 1)
}

// Replace All (Global)
const handleReplaceAll = async () => {
  const q = searchQuery.value.trim()
  if (!q || isReplacing.value || filteredResults.value.length === 0) return

  const ok = await showAppConfirm(
    `Ganti semua ${totalMatches.value} kemunculan "${q}" dengan "${replaceQuery.value}" di ${totalFiles.value} file?`,
    'Ganti Semua (Replace All)',
    'warning',
    'Ganti Semua'
  )
  if (!ok) return

  isReplacing.value = true
  try {
    const targetPaths = fileGroups.value.map(g => g.filePath)
    const res = await replaceInFiles(q, replaceQuery.value, matchCase.value, targetPaths)
    if (res.success) {
      await performSearch()
    } else {
      await showAppAlert(`Gagal replace: ${res.error}`, 'Error Replace')
    }
  } finally {
    isReplacing.value = false
  }
}

// Replace all matches in single file
const handleReplaceInFile = async (group: FileGroup) => {
  const q = searchQuery.value.trim()
  if (!q || isReplacing.value) return

  isReplacing.value = true
  try {
    const res = await replaceInFiles(q, replaceQuery.value, matchCase.value, [group.filePath])
    if (res.success) {
      await performSearch()
    }
  } finally {
    isReplacing.value = false
  }
}

// Replace single occurrence
const handleReplaceSingle = async (item: SearchResultItem) => {
  const q = searchQuery.value
  if (!q || isReplacing.value) return

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const content = await invoke<string>('read_file_content', { path: item.file_path })
    const lines = content.split('\n')
    const lineIdx = item.line_number - 1
    if (lineIdx >= 0 && lineIdx < lines.length) {
      const line = lines[lineIdx]!
      const pattern = useRegex.value ? q : escapeRegex(q)
      const flags = matchCase.value ? '' : 'i'
      lines[lineIdx] = line.replace(new RegExp(pattern, flags), replaceQuery.value)
      const newContent = lines.join('\n')
      await invoke('save_file_content', { path: item.file_path, content: newContent })
      updateMonacoModelContent(item.file_path, newContent)
      await performSearch()
    }
  } catch (err: any) {
    console.error('Failed to replace single occurrence:', err)
  }
}

const handleFocusSearch = () => {
  nextTick(() => {
    searchInputRef.value?.focus()
    searchInputRef.value?.select()
  })
}

const handleSearchInFolder = (e: Event) => {
  const ce = e as CustomEvent<string>
  if (ce.detail) {
    filesToInclude.value = ce.detail
    showDetails.value = true
    nextTick(() => {
      searchInputRef.value?.focus()
      searchInputRef.value?.select()
    })
  }
}

onMounted(() => {
  window.addEventListener('focus-sidebar-search', handleFocusSearch)
  window.addEventListener('search-in-folder', handleSearchInFolder)
})

onBeforeUnmount(() => {
  window.removeEventListener('focus-sidebar-search', handleFocusSearch)
  window.removeEventListener('search-in-folder', handleSearchInFolder)
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden text-xs select-none">
    <!-- Top Action Icons & Header -->
    <div class="p-2 border-b border-border/40 space-y-1.5 bg-[#0f1016]">
      <div class="flex items-center justify-between text-muted-foreground">
        <span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Search</span>
        <div class="flex items-center gap-1">
          <UiTooltip text="Refresh Pencarian" side="bottom">
            <button
              class="p-1 rounded hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              :disabled="isSearching"
              @click="performSearch"
            >
              <RefreshCw :class="['w-3.5 h-3.5', isSearching && 'animate-spin']" />
            </button>
          </UiTooltip>
          <UiTooltip text="Hapus Pencarian" side="bottom">
            <button
              class="p-1 rounded hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              @click="clearSearch"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </UiTooltip>
          <UiTooltip :text="areAllCollapsed ? 'Buka Semua' : 'Tutup Semua'" side="bottom">
            <button
              class="p-1 rounded hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              :disabled="fileGroups.length === 0"
              @click="toggleCollapseAll"
            >
              <ChevronsDownUp v-if="!areAllCollapsed" class="w-3.5 h-3.5" />
              <ChevronsUpDown v-else class="w-3.5 h-3.5" />
            </button>
          </UiTooltip>
        </div>
      </div>

      <!-- Search Input Container with Expandable Replace Row -->
      <div class="space-y-1">
        <!-- Search Row -->
        <div class="flex items-center gap-1">
          <button
            class="p-0.5 text-muted-foreground hover:text-foreground transition-transform cursor-pointer"
            :title="isReplaceOpen ? 'Tutup Replace' : 'Buka Replace'"
            @click="isReplaceOpen = !isReplaceOpen"
          >
            <ChevronDown v-if="isReplaceOpen" class="w-3.5 h-3.5 text-muted-foreground" />
            <ChevronRight v-else class="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          <div class="relative flex-1 flex items-center">
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              placeholder="Search"
              class="w-full bg-[#181924] border border-border focus:border-primary text-foreground pl-2 pr-18 py-1 rounded text-xs outline-none transition-colors"
              @keydown.enter="performSearch"
            />
            <!-- Toggles (Aa, ab, .*) -->
            <div class="absolute right-1 flex items-center gap-0.5">
              <UiTooltip text="Match Case (Alt+C)" side="bottom">
                <button
                  :class="[
                    'px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer',
                    matchCase ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  ]"
                  @click="matchCase = !matchCase"
                >
                  Aa
                </button>
              </UiTooltip>
              <UiTooltip text="Match Whole Word (Alt+W)" side="bottom">
                <button
                  :class="[
                    'px-1 py-0.5 rounded text-[10px] font-mono font-bold underline transition-colors cursor-pointer',
                    matchWholeWord ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  ]"
                  @click="matchWholeWord = !matchWholeWord"
                >
                  ab
                </button>
              </UiTooltip>
              <UiTooltip text="Use Regular Expression (Alt+R)" side="bottom">
                <button
                  :class="[
                    'px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer',
                    useRegex ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  ]"
                  @click="useRegex = !useRegex"
                >
                  .*
                </button>
              </UiTooltip>
            </div>
          </div>
        </div>

        <!-- Replace Row (Collapsible) -->
        <div v-if="isReplaceOpen" class="flex items-center gap-1 pl-4.5">
          <div class="relative flex-1 flex items-center">
            <input
              v-model="replaceQuery"
              type="text"
              placeholder="Replace"
              class="w-full bg-[#181924] border border-border focus:border-primary text-foreground pl-2 pr-14 py-1 rounded text-xs outline-none transition-colors"
              @keydown.enter.ctrl.alt="handleReplaceAll"
            />
            <!-- Replace Controls (AB, Replace All) -->
            <div class="absolute right-1 flex items-center gap-0.5">
              <UiTooltip text="Preserve Case" side="bottom">
                <button
                  :class="[
                    'px-1 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer',
                    preserveCase ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  ]"
                  @click="preserveCase = !preserveCase"
                >
                  AB
                </button>
              </UiTooltip>
              <UiTooltip text="Ganti Semua (Ctrl+Alt+Enter)" side="bottom">
                <button
                  class="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  :disabled="isReplacing || filteredResults.length === 0"
                  @click="handleReplaceAll"
                >
                  <Replace class="w-3 h-3 text-muted-foreground hover:text-foreground" />
                </button>
              </UiTooltip>
            </div>
          </div>
        </div>

        <!-- Toggle Details (...) -->
        <div class="flex justify-end pr-0.5">
          <button
            class="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
            :title="showDetails ? 'Sembunyikan filter include/exclude' : 'Tampilkan filter include/exclude'"
            @click="showDetails = !showDetails"
          >
            <MoreHorizontal class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Details: files to include / exclude -->
        <div v-if="showDetails" class="space-y-1.5 pt-1 border-t border-border/30">
          <div>
            <div class="text-[10px] text-muted-foreground mb-0.5">files to include</div>
            <input
              v-model="filesToInclude"
              type="text"
              placeholder="e.g. *.ts, src/**"
              class="w-full bg-[#181924] border border-border focus:border-primary text-foreground px-2 py-0.5 rounded text-[11px] outline-none"
            />
          </div>
          <div>
            <div class="text-[10px] text-muted-foreground mb-0.5">files to exclude</div>
            <input
              v-model="filesToExclude"
              type="text"
              placeholder="e.g. *.min.js, dist/**"
              class="w-full bg-[#181924] border border-border focus:border-primary text-foreground px-2 py-0.5 rounded text-[11px] outline-none"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Results Area -->
    <div class="flex-1 overflow-y-auto p-1.5 space-y-1 font-sans">
      <!-- Empty State: No Folder Open -->
      <div
        v-if="!activeWorkstation?.folderPath"
        class="p-4 text-center text-muted-foreground space-y-2.5 my-auto"
      >
        <p class="text-[11px] leading-relaxed">
          You have not opened or specified a folder. Only open files are currently searched.
        </p>
        <button
          class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground font-medium rounded hover:bg-primary/90 transition-colors cursor-pointer"
          @click="pickFolder"
        >
          <FolderOpen class="w-3.5 h-3.5" />
          <span>Open Folder</span>
        </button>
      </div>

      <!-- Searching State -->
      <div v-else-if="isSearching" class="p-6 text-center text-muted-foreground space-y-2">
        <Loader2 class="w-5 h-5 animate-spin mx-auto text-primary" />
        <span class="text-[11px]">Mencari di seluruh berkas proyek...</span>
      </div>

      <!-- Empty Query State -->
      <div v-else-if="!searchQuery.trim()" class="p-6 text-center text-muted-foreground/60 space-y-2">
        <Search class="w-6 h-6 mx-auto opacity-30" />
        <p class="text-[11px]">Ketik teks untuk mencari di seluruh berkas proyek</p>
      </div>

      <!-- 0 Results Found -->
      <div v-else-if="filteredResults.length === 0" class="p-4 text-center text-muted-foreground space-y-1">
        <p class="text-[11px] font-semibold text-foreground/80">Tidak ada hasil ditemukan</p>
        <p class="text-[10px] text-muted-foreground/70">Periksa ejaan atau ubah opsi pencarian.</p>
      </div>

      <!-- Results Tree -->
      <div v-else class="space-y-1.5">
        <!-- Results Counter Bar -->
        <div class="px-1 text-[11px] text-muted-foreground font-medium flex items-center justify-between">
          <span>{{ totalMatches }} hasil di {{ totalFiles }} file</span>
        </div>

        <!-- File Groups -->
        <div
          v-for="group in fileGroups"
          :key="group.filePath"
          class="rounded overflow-hidden bg-[#14151f]/60 border border-border/30"
        >
          <!-- File Header -->
          <div
            class="group flex items-center justify-between px-1.5 py-1 hover:bg-[#1e1f2e] cursor-pointer transition-colors"
            @click="toggleFileCollapse(group.filePath)"
          >
            <div class="flex items-center gap-1.5 min-w-0 flex-1">
              <ChevronDown v-if="!collapsedFiles[group.filePath]" class="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <ChevronRight v-else class="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <component :is="getFileIcon(group.fileName).icon" :class="['w-3.5 h-3.5 flex-shrink-0', getFileIcon(group.fileName).color]" />
              <span class="font-medium text-foreground truncate text-[11px]">{{ group.fileName }}</span>
              <span class="text-[10px] text-muted-foreground/50 truncate font-mono">{{ group.dirPath }}</span>
            </div>

            <div class="flex items-center gap-1 flex-shrink-0">
              <!-- Replace all in this file button (on hover) -->
              <UiTooltip text="Ganti semua di berkas ini" side="left">
                <button
                  class="hidden group-hover:flex p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer"
                  @click.stop="handleReplaceInFile(group)"
                >
                  <Replace class="w-3 h-3" />
                </button>
              </UiTooltip>
              <!-- Match Count Badge -->
              <span class="px-1.5 py-0.2 rounded-full bg-primary/20 text-primary text-[10px] font-bold">
                {{ group.items.length }}
              </span>
            </div>
          </div>

          <!-- Matched Lines Under File -->
          <div v-if="!collapsedFiles[group.filePath]" class="divide-y divide-border/20 pl-2">
            <div
              v-for="(item, idx) in group.items"
              :key="`${item.file_path}-${item.line_number}-${idx}`"
              class="group/item flex items-center justify-between px-2 py-0.5 hover:bg-[#181924] cursor-pointer transition-colors text-[11px] font-mono"
              @click="handleOpenMatch(item)"
            >
              <div class="flex items-baseline gap-2 min-w-0 flex-1 overflow-hidden">
                <span class="text-muted-foreground/60 text-[10px] flex-shrink-0 select-none">{{ item.line_number }}:</span>
                <span class="truncate text-foreground/90 leading-tight">
                  <template v-for="(seg, sIdx) in getHighlightedSegments(item.line_content)" :key="sIdx">
                    <mark
                      v-if="seg.isMatch"
                      class="bg-amber-500/30 text-amber-200 font-bold px-0.5 rounded-xs"
                    >{{ seg.text }}</mark>
                    <span v-else>{{ seg.text }}</span>
                  </template>
                </span>
              </div>

              <!-- Quick Single Replace Button on Hover -->
              <div class="hidden group-hover/item:flex items-center gap-1 flex-shrink-0 pl-1">
                <UiTooltip text="Ganti yang ini" side="left">
                  <button
                    class="p-0.5 rounded hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                    @click.stop="handleReplaceSingle(item)"
                  >
                    <Check class="w-3 h-3" />
                  </button>
                </UiTooltip>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

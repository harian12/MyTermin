<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import {
  Search,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Image,
  FolderOpen,
  Loader2,
  CaseSensitive,
  Replace,
  ChevronDown,
  ChevronRight,
  Check,
  AlertCircle,
  X
} from 'lucide-vue-next'
import { useProjectExplorer, type SearchResultItem } from '~/composables/useProjectExplorer'
import { useEditorStore } from '~/composables/useEditorStore'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'
import { useAppDialog } from '~/composables/useAppDialog'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const { searchInFiles, replaceInFiles } = useProjectExplorer()
const { openFileAtPosition } = useEditorStore()
const { activeWorkstation } = useWorkspaceStore()
const { showAppAlert, showAppConfirm } = useAppDialog()

const searchQuery = ref('')
const replaceQuery = ref('')
const isReplaceOpen = ref(false)
const matchCase = ref(false)
const isSearching = ref(false)
const isReplacing = ref(false)
const replaceNotification = ref<string | null>(null)
const results = ref<SearchResultItem[]>([])
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listContainerRef = ref<HTMLElement | null>(null)
let searchTimeout: any = null

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
  const q = searchQuery.value.trim()
  if (!q) {
    results.value = []
    isSearching.value = false
    return
  }

  isSearching.value = true
  try {
    results.value = await searchInFiles(q, matchCase.value)
    selectedIndex.value = 0
  } finally {
    isSearching.value = false
  }
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      nextTick(() => {
        inputRef.value?.focus()
      })
    }
  }
)

watch([searchQuery, matchCase], () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    performSearch()
  }, 200)
})

const handleSelect = (item: SearchResultItem) => {
  openFileAtPosition(item.file_path, item.line_number, item.col_start + 1)
  emit('update:open', false)
}

const handleReplaceAll = async () => {
  const q = searchQuery.value.trim()
  if (!q || isReplacing.value || results.value.length === 0) return

  const confirmed = await showAppConfirm(
    `Ganti semua ${results.value.length} kemunculan "${q}" dengan "${replaceQuery.value}"?`,
    'Konfirmasi Ganti Semua',
    'warning',
    'Ganti Semua'
  )
  if (!confirmed) return

  isReplacing.value = true
  try {
    const res = await replaceInFiles(q, replaceQuery.value, matchCase.value)
    if (res.success) {
      replaceNotification.value = `Berhasil mengganti ${res.count || 0} teks!`
      await performSearch()
      setTimeout(() => {
        replaceNotification.value = null
      }, 3000)
    } else {
      await showAppAlert(`Gagal replace: ${res.error}`, 'Kesalahan')
    }
  } finally {
    isReplacing.value = false
  }
}

const handleReplaceCurrentFile = async () => {
  const q = searchQuery.value.trim()
  const currentItem = results.value[selectedIndex.value]
  if (!q || !currentItem || isReplacing.value) return

  isReplacing.value = true
  try {
    const res = await replaceInFiles(q, replaceQuery.value, matchCase.value, [currentItem.file_path])
    if (res.success) {
      replaceNotification.value = `Berhasil mengganti ${res.count || 0} teks di ${currentItem.rel_path}!`
      await performSearch()
      setTimeout(() => {
        replaceNotification.value = null
      }, 3000)
    } else {
      await showAppAlert(`Gagal replace: ${res.error}`, 'Kesalahan')
    }
  } finally {
    isReplacing.value = false
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.open) return

  if (e.key === 'Escape') {
    e.preventDefault()
    emit('update:open', false)
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (results.value.length === 0) return
    selectedIndex.value = (selectedIndex.value + 1) % results.value.length
    scrollToSelected()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (results.value.length === 0) return
    selectedIndex.value = (selectedIndex.value - 1 + results.value.length) % results.value.length
    scrollToSelected()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (results.value[selectedIndex.value]) {
      handleSelect(results.value[selectedIndex.value])
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
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xs flex items-start justify-center pt-14 px-4"
      @click="emit('update:open', false)"
    >
      <div
        class="bg-[#12131a] border border-border w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-100"
        @click.stop
      >
        <!-- Search & Replace Header -->
        <div class="flex flex-col border-b border-border bg-[#181924] p-3 space-y-2">
          <!-- Search Input Line -->
          <div class="flex items-center gap-2">
            <!-- Toggle Replace Input Button -->
            <button
              class="p-1 rounded hover:bg-[#252636] text-muted-foreground hover:text-foreground transition-colors"
              :title="isReplaceOpen ? 'Tutup Replace' : 'Buka Replace'"
              @click="isReplaceOpen = !isReplaceOpen"
            >
              <ChevronDown v-if="isReplaceOpen" class="w-3.5 h-3.5 text-primary" />
              <ChevronRight v-else class="w-3.5 h-3.5" />
            </button>

            <div class="flex items-center flex-1 bg-[#0d0e14] border border-border/80 focus-within:border-primary px-2.5 py-1.5 rounded-lg">
              <Search class="w-3.5 h-3.5 text-muted-foreground mr-2 flex-shrink-0" />
              <input
                ref="inputRef"
                v-model="searchQuery"
                type="text"
                placeholder="Cari teks di seluruh file project..."
                class="flex-1 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground font-mono"
                @keydown="handleKeyDown"
              />
            </div>

            <!-- Match Case Toggle -->
            <button
              :class="[
                'px-2 py-1 rounded-md text-xs flex items-center gap-1 transition-colors flex-shrink-0',
                matchCase ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground bg-[#0d0e14] border border-border/60 hover:text-foreground'
              ]"
              title="Match Case (Sensitif Huruf Besar/Kecil)"
              @click="matchCase = !matchCase"
            >
              <CaseSensitive class="w-3.5 h-3.5" />
              <span class="text-[10px]">Aa</span>
            </button>

            <div v-if="isSearching" class="flex items-center pl-1">
              <Loader2 class="w-4 h-4 animate-spin text-primary" />
            </div>

            <button
              class="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground ml-1"
              @click="emit('update:open', false)"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <!-- Replace Input Line (Expandable) -->
          <div v-if="isReplaceOpen" class="flex items-center gap-2 pl-6 animate-in fade-in">
            <div class="flex items-center flex-1 bg-[#0d0e14] border border-border/80 focus-within:border-primary px-2.5 py-1.5 rounded-lg">
              <Replace class="w-3.5 h-3.5 text-muted-foreground mr-2 flex-shrink-0" />
              <input
                v-model="replaceQuery"
                type="text"
                placeholder="Ganti dengan..."
                class="flex-1 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground font-mono"
                @keydown.enter="handleReplaceAll"
              />
            </div>

            <button
              :disabled="!searchQuery.trim() || results.length === 0 || isReplacing"
              class="px-2.5 py-1.5 bg-secondary hover:bg-secondary/80 disabled:opacity-40 text-foreground text-xs rounded-lg font-medium transition-colors flex-shrink-0"
              title="Ganti pada file yang sedang dipilih"
              @click="handleReplaceCurrentFile"
            >
              Ganti File Ini
            </button>

            <button
              :disabled="!searchQuery.trim() || results.length === 0 || isReplacing"
              class="px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-xs rounded-lg font-medium transition-colors flex-shrink-0 shadow-sm"
              title="Ganti di semua file project yang cocok"
              @click="handleReplaceAll"
            >
              {{ isReplacing ? 'Mengganti...' : 'Ganti Semua' }}
            </button>
          </div>

          <!-- Replace Toast Notification -->
          <div v-if="replaceNotification" class="text-xs text-emerald-400 font-mono text-center pt-1">
            {{ replaceNotification }}
          </div>
        </div>

        <!-- Results List -->
        <div
          ref="listContainerRef"
          class="overflow-y-auto flex-1 p-1 max-h-[420px] divide-y divide-border/20 font-mono"
        >
          <div
            v-for="(item, idx) in results"
            :key="`${item.file_path}-${item.line_number}-${item.col_start}`"
            :class="[
              'flex flex-col gap-1 px-3 py-2 rounded-lg cursor-pointer text-xs select-none transition-colors m-0.5',
              selectedIndex === idx ? 'bg-primary/20 text-foreground border border-primary/40' : 'text-muted-foreground hover:bg-[#181924] hover:text-foreground border border-transparent'
            ]"
            @click="handleSelect(item)"
            @mouseenter="selectedIndex = idx"
          >
            <div class="flex items-center justify-between text-[11px]">
              <div class="flex items-center gap-1.5 min-w-0">
                <component
                  :is="getFileIcon(item.rel_path).icon"
                  :class="['w-3.5 h-3.5 flex-shrink-0', getFileIcon(item.rel_path).color]"
                />
                <span class="font-medium text-foreground truncate">{{ item.rel_path }}</span>
              </div>
              <span class="text-[10px] text-primary/80 font-mono flex-shrink-0">Baris {{ item.line_number }}</span>
            </div>

            <div class="text-[11px] text-muted-foreground/80 bg-[#0d0e14] px-2.5 py-1 rounded-md truncate border border-border/40 font-mono">
              {{ item.line_content }}
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-if="results.length === 0 && !isSearching && searchQuery"
            class="p-8 text-center text-muted-foreground text-xs"
          >
            <Search class="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Tidak ada hasil untuk "{{ searchQuery }}"</p>
          </div>

          <div
            v-if="!searchQuery && !isSearching"
            class="p-8 text-center text-muted-foreground text-xs"
          >
            <FolderOpen class="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Ketik kata kunci untuk mencari atau mengganti teks di seluruh project</p>
          </div>
        </div>

        <!-- Footer Info -->
        <div class="flex items-center justify-between px-3.5 py-2 bg-[#0e0f14] border-t border-border/50 text-[10px] text-muted-foreground font-mono">
          <span>{{ results.length }} hasil ditemukan</span>
          <div class="flex items-center gap-2">
            <span><kbd class="bg-muted px-1.5 py-0.5 rounded">↑↓</kbd> Navigasi</span>
            <span><kbd class="bg-muted px-1.5 py-0.5 rounded">↵</kbd> Buka di Baris</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

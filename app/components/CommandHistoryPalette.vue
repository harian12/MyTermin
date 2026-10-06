<script setup lang="ts">
import {
  Search,
  History,
  Terminal as TerminalIcon,
  Copy,
  Play,
  ClipboardType,
  Trash2
} from 'lucide-vue-next'
import { useCommandHistory } from '~/composables/useCommandHistory'
import { filterByScope } from '~/utils/commandHistory'
import type { CommandHistoryEntry } from '~/types/terminal'

const {
  entries,
  isPaletteOpen,
  closePalette,
  recordCommand,
  removeEntry,
  clearHistory
} = useCommandHistory()

const { activeWorkstation, activeTerminalId } = useWorkspaceStore()
const { writePty } = useTauriPty()

const searchQuery = ref('')
const selectedIndex = ref(0)
const scope = ref<'project' | 'all'>('project')
const inputRef = ref<HTMLInputElement | null>(null)
const listContainerRef = ref<HTMLElement | null>(null)

const projectFolder = computed(() => activeWorkstation.value.folderPath || '')

const filteredEntries = computed(() => {
  let list = filterByScope(entries.value, scope.value, projectFolder.value)

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(e => 
      e.cmd.toLowerCase().includes(q) || 
      (e.cwd && e.cwd.toLowerCase().includes(q))
    )
  }
  return list
})

watch(
  () => isPaletteOpen.value,
  (val) => {
    if (val) {
      searchQuery.value = ''
      selectedIndex.value = 0
      nextTick(() => {
        setTimeout(() => {
          inputRef.value?.focus()
        }, 50)
      })
    }
  }
)

watch(searchQuery, () => {
  selectedIndex.value = 0
})

watch(scope, () => {
  selectedIndex.value = 0
})

const handleKeyDown = async (e: KeyboardEvent) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (selectedIndex.value < filteredEntries.value.length - 1) {
      selectedIndex.value++
      scrollToSelected()
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (selectedIndex.value > 0) {
      selectedIndex.value--
      scrollToSelected()
    }
  } else if (e.key === 'Tab') {
    e.preventDefault()
    scope.value = scope.value === 'project' ? 'all' : 'project'
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = filteredEntries.value[selectedIndex.value]
    if (!item) return
    if (e.ctrlKey) {
      pasteSelected(item)
    } else {
      executeSelected(item)
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closePalette()
  } else if (e.key === 'Delete') {
    e.preventDefault()
    const item = filteredEntries.value[selectedIndex.value]
    if (item) {
      removeEntry(item.id)
      // Adjust selectedIndex if it goes out of bounds
      if (selectedIndex.value >= filteredEntries.value.length && selectedIndex.value > 0) {
        selectedIndex.value--
      }
    }
  } else if (e.key === 'c' && e.ctrlKey) {
    e.preventDefault()
    const item = filteredEntries.value[selectedIndex.value]
    if (item) {
      copyItem(item)
    }
  }
}

const scrollToSelected = () => {
  nextTick(() => {
    if (!listContainerRef.value) return
    const selectedEl = listContainerRef.value.children[selectedIndex.value] as HTMLElement
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  })
}

const executeSelected = (item: CommandHistoryEntry) => {
  if (item && activeTerminalId.value) {
    const termId = activeTerminalId.value
    // Write command and enter
    writePty(termId, item.cmd + '\r')
    recordCommand(item.cmd, item.cwd, item.shell)
  }
  closePalette()
}

const selectItem = (idx: number) => {
  selectedIndex.value = idx
  const item = filteredEntries.value[idx]
  if (item) executeSelected(item)
}

const pasteSelected = (item: CommandHistoryEntry) => {
  if (item && activeTerminalId.value) {
    writePty(activeTerminalId.value, item.cmd)
  }
  closePalette()
}

const copyItem = async (item: CommandHistoryEntry) => {
  const { copyToClipboard } = useTauriPty()
  await copyToClipboard(item.cmd)
  // Optionally show a toast, but keeping it simple for now
}
</script>

<template>
  <div
    v-if="isPaletteOpen"
    class="fixed inset-0 z-[100] flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
    @click="closePalette"
  >
    <div
      class="w-full max-w-2xl bg-[#14151f] border border-border/80 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
      @click.stop
      @keydown="handleKeyDown"
    >
      <!-- Search Input Header -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-[#181926]">
        <Search class="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          ref="inputRef"
          v-model="searchQuery"
          type="text"
          placeholder="Cari histori command..."
          class="flex-1 bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground outline-none font-medium"
        />
        <div class="flex items-center gap-1.5 ml-auto">
          <button
            @click="clearHistory"
            class="mr-2 px-2 py-1 text-[10px] flex items-center gap-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
            title="Bersihkan Histori"
          >
            <Trash2 class="w-3 h-3" /> Bersihkan Histori
          </button>
          <kbd class="px-2 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-muted-foreground border border-border/40">Tab</kbd>
          <span class="text-xs text-muted-foreground mr-2">{{ scope === 'project' ? 'Project Ini' : 'Semua' }}</span>
          <kbd class="px-2 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-muted-foreground border border-border/40">ESC</kbd>
        </div>
      </div>

      <!-- Scope Tabs -->
      <div class="flex px-2 pt-2 gap-1 bg-[#181926]">
        <button
          @click="scope = 'project'"
          class="px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors"
          :class="scope === 'project' ? 'border-primary text-primary bg-primary/10' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5'"
        >
          Project Ini
        </button>
        <button
          @click="scope = 'all'"
          class="px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors"
          :class="scope === 'all' ? 'border-primary text-primary bg-primary/10' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5'"
        >
          Semua Direktori
        </button>
      </div>

      <!-- Command List View -->
      <div ref="listContainerRef" class="max-h-80 overflow-y-auto p-1.5 space-y-1 bg-[#14151f]">
        <div v-if="filteredEntries.length === 0" class="p-6 text-center text-xs text-muted-foreground">
          Tidak ada histori yang cocok.
        </div>

        <div
          v-for="(item, idx) in filteredEntries"
          :key="item.id"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group"
          :class="idx === selectedIndex ? 'bg-primary/15 text-primary' : 'hover:bg-white/5 text-foreground'"
          @click="selectItem(idx)"
          @mouseenter="selectedIndex = idx"
        >
          <div class="flex items-center justify-center w-6 h-6 rounded bg-black/20 text-muted-foreground shrink-0 group-hover:text-primary transition-colors">
            <History class="w-3.5 h-3.5" />
          </div>

          <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div class="text-sm font-mono truncate" :class="idx === selectedIndex ? 'text-primary' : 'text-foreground'">
              {{ item.cmd }}
            </div>
            <div class="text-[10px] text-muted-foreground truncate opacity-70 flex items-center gap-2 mt-0.5">
              <span>{{ new Date(item.at).toLocaleString() }}</span>
              <span v-if="item.cwd">&bull; {{ item.cwd }}</span>
              <span v-if="item.runCount > 1">&bull; {{ item.runCount }}x</span>
            </div>
          </div>

          <button
            @click.stop="removeEntry(item.id)"
            class="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-400/10 rounded transition-all shrink-0"
            title="Hapus Entry (Delete)"
          >
            <Trash2 class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <!-- Footer / Hints -->
      <div class="px-4 py-2 border-t border-border/60 bg-[#181926] flex items-center justify-between text-[10px] text-muted-foreground font-medium">
        <div class="flex gap-4">
          <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 rounded bg-muted text-[9px]">Enter</kbd> Jalankan</span>
          <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 rounded bg-muted text-[9px]">Ctrl</kbd>+<kbd class="px-1.5 py-0.5 rounded bg-muted text-[9px]">Enter</kbd> Paste</span>
          <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 rounded bg-muted text-[9px]">Ctrl</kbd>+<kbd class="px-1.5 py-0.5 rounded bg-muted text-[9px]">C</kbd> Copy</span>
        </div>
        <div class="flex gap-2">
          <span class="flex items-center gap-1"><kbd class="px-1.5 py-0.5 rounded bg-muted text-[9px]">&uarr;</kbd><kbd class="px-1.5 py-0.5 rounded bg-muted text-[9px]">&darr;</kbd> Navigasi</span>
        </div>
      </div>
    </div>
  </div>
</template>

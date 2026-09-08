<script setup lang="ts">
import {
  Plus,
  X,
  Square,
  Columns2,
  Rows2,
  LayoutGrid as GridIcon,
  Sparkles,
  Settings,
  Minus,
  Maximize2,
  Pencil,
  Check,
  Copy,
  Search
} from 'lucide-vue-next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { LayoutType } from '~/types/terminal'

const {
  terminals,
  activeTerminalId,
  currentLayout,
  saveNotification,
  backgroundAlerts,
  addTerminal,
  duplicateTerminal,
  removeTerminal,
  moveTerminalTab,
  renameTerminal,
  setLayout
} = useWorkspaceStore()
const { isTauri } = useTauriPty()

const emit = defineEmits<{
  (e: 'open-presets'): void
  (e: 'open-settings'): void
  (e: 'open-palette'): void
}>()

const editingTermId = ref<string | null>(null)
const editingTitle = ref('')

// Drag Tab Reorder Logic (Pointer Based - Safe from Tauri Drag Region)
const isDraggingTab = ref(false)
const dragStartIndex = ref<number | null>(null)
const currentDragIndex = ref<number | null>(null)
const startX = ref(0)
const hasMoved = ref(false)

const handleTabPointerDown = (e: PointerEvent, index: number, termId: string) => {
  // Hanya klik kiri dan bukan saat sedang edit title atau klik tombol aksi
  if (e.button !== 0 || editingTermId.value === termId) return
  const target = e.target as HTMLElement
  if (target.closest('button') || target.closest('input') || target.closest('.opacity-0')) {
    return
  }

  dragStartIndex.value = index
  currentDragIndex.value = index
  startX.value = e.clientX
  hasMoved.value = false

  const handlePointerMove = (moveEvt: PointerEvent) => {
    const deltaX = Math.abs(moveEvt.clientX - startX.value)
    if (deltaX > 4) {
      hasMoved.value = true
      isDraggingTab.value = true
    }

    if (!isDraggingTab.value) return

    // Temukan tab elemen yang sedang di-hover mouse
    const tabElements = document.querySelectorAll<HTMLElement>('[data-tab-index]')
    tabElements.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const idx = Number(el.getAttribute('data-tab-index'))
      if (moveEvt.clientX >= rect.left && moveEvt.clientX <= rect.right) {
        if (currentDragIndex.value !== null && currentDragIndex.value !== idx) {
          moveTerminalTab(currentDragIndex.value, idx)
          currentDragIndex.value = idx
        }
      }
    })
  }

  const handlePointerUp = () => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerUp)

    setTimeout(() => {
      isDraggingTab.value = false
      dragStartIndex.value = null
      currentDragIndex.value = null
      hasMoved.value = false
    }, 50)
  }

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
}

const handleTabClick = (termId: string) => {
  if (!hasMoved.value) {
    activeTerminalId.value = termId
  }
}

const startRename = (termId: string, currentTitle: string) => {
  editingTermId.value = termId
  editingTitle.value = currentTitle
  nextTick(() => {
    const input = document.getElementById(`tab-rename-input-${termId}`)
    input?.focus()
  })
}

const finishRename = (termId: string) => {
  if (editingTitle.value.trim()) {
    renameTerminal(termId, editingTitle.value.trim())
  }
  editingTermId.value = null
}

const minimizeWindow = async () => {
  if (isTauri.value) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('window_minimize')
    } catch (e) {
      console.warn('Fallback window minimize:', e)
      await getCurrentWindow().minimize()
    }
  }
}

const toggleMaximizeWindow = async () => {
  if (isTauri.value) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('window_toggle_maximize')
    } catch (e) {
      console.warn('Fallback window toggle maximize:', e)
      await getCurrentWindow().toggleMaximize()
    }
  }
}

const closeWindow = async () => {
  if (isTauri.value) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('window_close')
    } catch (e) {
      console.warn('Fallback window close:', e)
      await getCurrentWindow().close()
    }
  }
}
</script>

<template>
  <header
    class="flex items-center justify-between h-10 bg-[#12131a] border-b border-border select-none px-2 z-40 relative"
    data-tauri-drag-region
  >
    <!-- Left: App Brand & Terminal Tabs List -->
    <div class="flex items-center gap-1.5 max-w-[65%] overflow-x-auto no-scrollbar">
      <div
        class="flex items-center gap-2 px-2 text-white font-bold text-sm tracking-wide flex-shrink-0 cursor-default"
        data-tauri-drag-region
      >
        <AppLogo :size="16" />
        <span class="text-white font-bold tracking-wide">MyTermin</span>
      </div>

      <!-- Terminal Tabs (Draggable & Reorderable) -->
      <div class="flex items-center gap-1">
        <div
          v-for="(term, index) in terminals"
          :key="term.id"
          :data-tab-index="index"
          :class="[
            'group flex items-center gap-1.5 px-3 py-1 text-xs rounded-t-md transition-all border-b-2 font-medium cursor-pointer relative select-none touch-none',
            activeTerminalId === term.id
              ? 'bg-[#1e1f2b] text-foreground border-primary'
              : 'text-muted-foreground hover:bg-[#181924] hover:text-foreground border-transparent',
            isDraggingTab && currentDragIndex === index
              ? 'ring-2 ring-primary bg-primary/20 scale-[1.03] z-20 shadow-md shadow-black/50'
              : ''
          ]"
          @pointerdown="handleTabPointerDown($event, index, term.id)"
          @click="handleTabClick(term.id)"
          @dblclick="startRename(term.id, term.title)"
        >
          <AppLogo :size="13" class="opacity-80 flex-shrink-0" />

          <!-- Background Process Alert Indicator -->
          <span
            v-if="backgroundAlerts[term.id] && activeTerminalId !== term.id"
            :class="[
              'w-2 h-2 rounded-full flex-shrink-0 transition-all',
              backgroundAlerts[term.id] === 'running'
                ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50'
                : 'bg-sky-400 shadow-sm shadow-sky-400/60'
            ]"
            :title="backgroundAlerts[term.id] === 'running' ? 'Perintah sedang berjalan di background' : 'Perintah selesai dijalankan!'"
          />

          <!-- Inline Edit Tab Name -->
          <div v-if="editingTermId === term.id" class="flex items-center gap-1" @click.stop>
            <input
              :id="`tab-rename-input-${term.id}`"
              v-model="editingTitle"
              type="text"
              class="w-24 px-1 py-0.5 text-xs bg-background border border-primary rounded text-foreground outline-none"
              @keydown.enter="finishRename(term.id)"
              @blur="finishRename(term.id)"
            />
            <button
              class="p-0.5 text-emerald-400 hover:text-emerald-300"
              @click.stop="finishRename(term.id)"
            >
              <Check class="w-3 h-3" />
            </button>
          </div>

          <span v-else class="max-w-[130px] truncate pointer-events-none" :title="`${term.title} (Double-click to rename, Drag to reorder)`">
            {{ term.title }}
          </span>

          <!-- Tab Actions: Duplicate, Rename, Close -->
          <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span
              class="hover:bg-accent rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Duplikat Tab Terminal"
              @click.stop="duplicateTerminal(term.id)"
            >
              <Copy class="w-2.5 h-2.5" />
            </span>
            <span
              v-if="editingTermId !== term.id"
              class="hover:bg-accent rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Rename Terminal"
              @click.stop="startRename(term.id, term.title)"
            >
              <Pencil class="w-2.5 h-2.5" />
            </span>
            <span
              class="hover:bg-accent rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Close Terminal (Ctrl+W)"
              @click.stop="removeTerminal(term.id)"
            >
              <X class="w-3 h-3" />
            </span>
          </div>
        </div>

        <!-- Add Terminal Tab Button -->
        <button
          class="p-1 rounded hover:bg-[#1e1f2b] text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex-shrink-0"
          title="New Terminal Tab (Ctrl+T)"
          @click="addTerminal()"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Notification Toast -->
    <div
      v-if="saveNotification"
      class="absolute left-1/2 -translate-x-1/2 top-1.5 px-3 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium animate-in fade-in zoom-in-95 pointer-events-none z-50"
    >
      {{ saveNotification }}
    </div>

    <!-- Right Controls -->
    <div class="flex items-center gap-1.5" data-tauri-drag-region>
      <!-- Quick Layout Selector (Single, 2 Col, 2 Row, 4-Grid) -->
      <div class="flex items-center bg-[#171822] rounded-md p-0.5 border border-border/40">
        <button
          :class="[
            'p-1 rounded text-xs transition-colors cursor-pointer',
            currentLayout === 'single' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
          ]"
          title="Single Terminal View"
          @click="setLayout('single')"
        >
          <Square class="w-3.5 h-3.5" />
        </button>
        <button
          :class="[
            'p-1 rounded text-xs transition-colors cursor-pointer',
            currentLayout === 'split-h' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
          ]"
          title="2 Terminal Split (Side-by-Side)"
          @click="setLayout('split-h')"
        >
          <Columns2 class="w-3.5 h-3.5" />
        </button>
        <button
          :class="[
            'p-1 rounded text-xs transition-colors cursor-pointer',
            currentLayout === 'split-v' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
          ]"
          title="2 Terminal Split (Stacked)"
          @click="setLayout('split-v')"
        >
          <Rows2 class="w-3.5 h-3.5" />
        </button>
        <button
          :class="[
            'p-1 rounded text-xs transition-colors cursor-pointer font-semibold flex items-center gap-1',
            currentLayout === 'grid-2x2' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-primary hover:bg-primary/10'
          ]"
          title="4-Terminal Grid (2x2 Quad)"
          @click="setLayout('grid-2x2')"
        >
          <GridIcon class="w-3.5 h-3.5" />
          <span class="text-[10px] px-0.5">4-Grid</span>
        </button>
      </div>

      <!-- Command Palette Launcher -->
      <UiButton
        variant="ghost"
        size="sm"
        class="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground border border-border/40 hover:bg-[#1c1d2b] px-2"
        title="Open Command Palette (Ctrl+K)"
        @click="emit('open-palette')"
      >
        <Search class="w-3.5 h-3.5 text-white/80" />
        <span class="text-[11px] font-medium hidden sm:inline">Search</span>
        <kbd class="px-1 py-0.2 rounded bg-muted/60 text-[9px] font-mono text-muted-foreground ml-0.5">Ctrl+K</kbd>
      </UiButton>

      <!-- Presets Launcher Button -->
      <UiButton
        variant="secondary"
        size="sm"
        class="h-7 text-xs gap-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30"
        @click="emit('open-presets')"
      >
        <Sparkles class="w-3.5 h-3.5 text-indigo-400" />
        <span class="text-[11px]">Presets</span>
      </UiButton>

      <!-- Settings Button -->
      <UiButton
        variant="ghost"
        size="icon"
        class="h-7 w-7 text-muted-foreground hover:text-foreground"
        title="Settings"
        @click="emit('open-settings')"
      >
        <Settings class="w-3.5 h-3.5" />
      </UiButton>

      <!-- Windows Controls (Minimize, Maximize, Close) -->
      <div class="flex items-center ml-2 border-l border-border/40 pl-2">
        <button
          class="h-7 w-7 inline-flex items-center justify-center hover:bg-white/10 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
          @click="minimizeWindow"
        >
          <Minus class="w-3.5 h-3.5" />
        </button>
        <button
          class="h-7 w-7 inline-flex items-center justify-center hover:bg-white/10 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
          @click="toggleMaximizeWindow"
        >
          <Maximize2 class="w-3 h-3" />
        </button>
        <button
          class="h-7 w-7 inline-flex items-center justify-center hover:bg-red-500 text-muted-foreground hover:text-white rounded transition-colors cursor-pointer"
          @click="closeWindow"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>

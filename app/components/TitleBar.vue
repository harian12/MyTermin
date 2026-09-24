<script setup lang="ts">
import {
  Plus,
  X,
  Sparkles,
  Settings,
  Minus,
  Maximize2,
  Pencil,
  Check,
  Search,
  FolderKanban,
  PanelLeft,
  GitBranch,
  Radio,
  Keyboard
} from 'lucide-vue-next'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useProjectExplorer } from '~/composables/useProjectExplorer'

const {
  workstations,
  activeWorkstationId,
  isSidebarOpen,
  toggleSidebar,
  addWorkstation,
  switchWorkstation,
  renameWorkstation,
  removeWorkstation,
  moveWorkstationTab,
  saveNotification
} = useWorkspaceStore()
const { isTauri } = useTauriPty()
const { gitBranch } = useProjectExplorer()

const wsTabsRef = ref<HTMLElement | null>(null)
const handleWsTabsWheel = (e: WheelEvent) => {
  if (wsTabsRef.value && e.deltaY !== 0) {
    wsTabsRef.value.scrollLeft += e.deltaY
  }
}

watch(activeWorkstationId, () => {
  nextTick(() => {
    const activeEl = wsTabsRef.value?.querySelector(`[data-ws-tab-id="${activeWorkstationId.value}"]`) as HTMLElement
    activeEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  })
})

const emit = defineEmits<{
  (e: 'open-presets'): void
  (e: 'open-settings'): void
  (e: 'open-palette'): void
  (e: 'open-shortcuts'): void
  (e: 'open-ports'): void
}>()

const editingWsId = ref<string | null>(null)
const editingName = ref('')

// Drag Workstation Tab Reorder Logic
const isDraggingTab = ref(false)
const dragStartIndex = ref<number | null>(null)
const currentDragIndex = ref<number | null>(null)
const startX = ref(0)
const hasMoved = ref(false)

const handleTabPointerDown = (e: PointerEvent, index: number, wsId: string) => {
  if (e.button !== 0 || editingWsId.value === wsId) return
  const target = e.target as HTMLElement
  if (target.closest('button') || target.closest('input')) {
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

    const tabElements = document.querySelectorAll<HTMLElement>('[data-ws-tab-index]')
    tabElements.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const idx = Number(el.getAttribute('data-ws-tab-index'))
      if (moveEvt.clientX >= rect.left && moveEvt.clientX <= rect.right) {
        if (currentDragIndex.value !== null && currentDragIndex.value !== idx) {
          moveWorkstationTab(currentDragIndex.value, idx)
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

const handleTabClick = (wsId: string) => {
  if (!hasMoved.value) {
    switchWorkstation(wsId)
  }
}

const startRename = (wsId: string, currentName: string) => {
  editingWsId.value = wsId
  editingName.value = currentName
  nextTick(() => {
    const input = document.getElementById(`ws-rename-input-${wsId}`)
    input?.focus()
  })
}

const finishRename = (wsId: string) => {
  if (editingName.value.trim()) {
    renameWorkstation(wsId, editingName.value.trim())
  }
  editingWsId.value = null
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
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    } catch (e) {
      console.warn('Fallback window close:', e)
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('window_destroy')
      } catch {}
    }
  }
}
</script>

<template>
  <header
    class="flex items-center justify-between h-10 bg-[#12131a] border-b border-border select-none px-2 z-40 relative"
    data-tauri-drag-region
  >
    <!-- Left: App Brand & Workstation Tabs -->
    <div class="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
      <div
        class="flex items-center gap-2 px-2 text-white font-bold text-sm tracking-wide flex-shrink-0 cursor-default"
        data-tauri-drag-region
      >
        <AppLogo :size="16" />
        <span class="text-white font-bold tracking-wide">MyTermin</span>
      </div>

      <!-- Toggle Sidebar Button -->
      <button
        :class="[
          'p-1.5 rounded transition-colors mr-1 cursor-pointer flex-shrink-0',
          isSidebarOpen ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-[#181924] hover:text-foreground'
        ]"
        title="Toggle Sidebar Workstation (Ctrl+B)"
        @click="toggleSidebar"
      >
        <PanelLeft class="w-3.5 h-3.5" />
      </button>

      <!-- Workstation Tabs (Draggable & Reorderable & Scrollable) -->
      <div
        ref="wsTabsRef"
        class="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth flex-1 min-w-0 py-0.5"
        @wheel.passive="handleWsTabsWheel"
      >
        <div
          v-for="(ws, index) in workstations"
          :key="ws.id"
          :data-ws-tab-index="index"
          :data-ws-tab-id="ws.id"
          :class="[
            'group flex items-center gap-1.5 px-3 py-1 text-xs rounded-t-md transition-all border-b-2 font-medium cursor-pointer relative select-none touch-none flex-shrink-0',
            activeWorkstationId === ws.id
              ? 'bg-[#1e1f2b] text-foreground border-primary'
              : 'text-muted-foreground hover:bg-[#181924] hover:text-foreground border-transparent',
            isDraggingTab && currentDragIndex === index
              ? 'ring-2 ring-primary bg-primary/20 scale-[1.03] z-20 shadow-md shadow-black/50'
              : ''
          ]"
          @pointerdown="handleTabPointerDown($event, index, ws.id)"
          @click="handleTabClick(ws.id)"
          @dblclick="startRename(ws.id, ws.name)"
        >
          <FolderKanban class="w-3.5 h-3.5 text-primary/80 flex-shrink-0" />

          <!-- Inline Edit Workstation Name -->
          <div v-if="editingWsId === ws.id" class="flex items-center gap-1" @click.stop>
            <input
              :id="`ws-rename-input-${ws.id}`"
              v-model="editingName"
              type="text"
              class="w-24 px-1 py-0.5 text-xs bg-background border border-primary rounded text-foreground outline-none"
              @keydown.enter="finishRename(ws.id)"
              @blur="finishRename(ws.id)"
            />
            <button
              class="p-0.5 text-emerald-400 hover:text-emerald-300"
              @click.stop="finishRename(ws.id)"
            >
              <Check class="w-3 h-3" />
            </button>
          </div>

          <span v-else class="max-w-[130px] truncate pointer-events-none" :title="`${ws.name} (Double-click to rename, Drag to reorder)`">
            {{ ws.name }}
          </span>

          <!-- Workstation Terminal Count Tag -->
          <span class="text-[10px] px-1 py-0.1 bg-secondary text-muted-foreground rounded-full font-mono">
            {{ ws.terminals.length }}
          </span>

          <!-- Workstation Actions: Rename, Close -->
          <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span
              v-if="editingWsId !== ws.id"
              class="hover:bg-accent rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Rename Workstation"
              @click.stop="startRename(ws.id, ws.name)"
            >
              <Pencil class="w-2.5 h-2.5" />
            </span>
            <span
              v-if="workstations.length > 1"
              class="hover:bg-accent rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Tutup Workstation"
              @click.stop="removeWorkstation(ws.id)"
            >
              <X class="w-3 h-3" />
            </span>
          </div>
        </div>

        <!-- Add Workstation Tab Button -->
        <button
          class="p-1 rounded hover:bg-[#1e1f2b] text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex-shrink-0"
          title="Workstation Baru"
          @click="addWorkstation()"
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
      <!-- Command Palette Launcher -->
      <UiButton
        variant="ghost"
        size="sm"
        class="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground border border-border/40 hover:bg-[#1c1d2b] px-2"
        title="Buka Command Palette (Ctrl+K)"
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

      <!-- Port Manager Button -->
      <UiButton
        variant="ghost"
        size="icon"
        class="h-7 w-7 text-muted-foreground hover:text-emerald-400"
        title="Port & Process Manager"
        @click="emit('open-ports')"
      >
        <Radio class="w-3.5 h-3.5" />
      </UiButton>

      <!-- Keyboard Shortcuts Cheatsheet Button -->
      <UiButton
        variant="ghost"
        size="icon"
        class="h-7 w-7 text-muted-foreground hover:text-foreground"
        title="Keyboard Shortcuts (F1)"
        @click="emit('open-shortcuts')"
      >
        <Keyboard class="w-3.5 h-3.5" />
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

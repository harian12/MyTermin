<script setup lang="ts">
import {
  Plus,
  Sparkles,
  Command,
  Terminal,
  Square,
  Columns2,
  Rows2,
  LayoutGrid as GridIcon,
  X,
  Maximize2,
  Minimize2,
  FolderOpen,
  Clock
} from 'lucide-vue-next'
import type { LayoutType, TerminalTab } from '~/types/terminal'
import { useEditorStore } from '~/composables/useEditorStore'
import { useProjectExplorer } from '~/composables/useProjectExplorer'

const {
  workstations,
  activeWorkstationId,
  terminals,
  activeTerminalId,
  activeWorkstation,
  currentLayout,
  addTerminal,
  removeTerminal,
  renameTerminal,
  moveTerminalTab,
  setLayout
} = useWorkspaceStore()

const { viewportMode, openFiles } = useEditorStore()
const { pickFolder, setWorkstationFolder, recentProjects } = useProjectExplorer()

const editingTermId = ref<string | null>(null)
const editingTitle = ref('')

// Drag Terminal Tab Reorder Logic
const isDraggingTab = ref(false)
const dragStartIndex = ref<number | null>(null)
const currentDragIndex = ref<number | null>(null)
const startX = ref(0)
const hasMoved = ref(false)

const handleTabPointerDown = (e: PointerEvent, index: number, termId: string) => {
  if (e.button !== 0 || editingTermId.value === termId) return
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

    const tabElements = document.querySelectorAll<HTMLElement>('[data-term-tab-index]')
    tabElements.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const idx = Number(el.getAttribute('data-term-tab-index'))
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

const startRenameTab = (term: TerminalTab) => {
  editingTermId.value = term.id
  editingTitle.value = term.title
  nextTick(() => {
    const input = document.getElementById(`tab-rename-input-${term.id}`)
    input?.focus()
  })
}

const finishRenameTab = (termId: string) => {
  if (editingTitle.value.trim()) {
    renameTerminal(termId, editingTitle.value.trim())
  }
  editingTermId.value = null
}

const allWorkstationTerminals = computed(() => {
  const list: { wsId: string; term: TerminalTab }[] = []
  for (const ws of workstations.value) {
    for (const term of ws.terminals) {
      list.push({ wsId: ws.id, term })
    }
  }
  return list
})

const isTerminalVisibleInGrid = (wsId: string, termId: string): boolean => {
  if (wsId !== activeWorkstationId.value) return false
  return isTerminalVisible(termId)
}

// Resizable Split for 2-Terminal View (split-h & split-v)
const terminalSplitPercent = ref(50)
const isDraggingTerminalSplit = ref(false)

const startTerminalSplitDrag = (e: MouseEvent) => {
  e.preventDefault()
  isDraggingTerminalSplit.value = true

  const onMouseMove = (moveEvt: MouseEvent) => {
    if (!isDraggingTerminalSplit.value) return
    const container = document.getElementById('terminal-grid-container')
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (currentLayout.value === 'split-h') {
      const relX = moveEvt.clientX - rect.left
      const percent = Math.min(Math.max((relX / rect.width) * 100, 15), 85)
      terminalSplitPercent.value = Math.round(percent)
    } else if (currentLayout.value === 'split-v') {
      const relY = moveEvt.clientY - rect.top
      const percent = Math.min(Math.max((relY / rect.height) * 100, 15), 85)
      terminalSplitPercent.value = Math.round(percent)
    }
  }

  const onMouseUp = () => {
    isDraggingTerminalSplit.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

const handleOpenProjectFolder = async (folderPath?: string) => {
  const folder = folderPath || (await pickFolder())
  if (folder) {
    await setWorkstationFolder(folder)
    if (terminals.value.length === 0) {
      addTerminal({ cwd: folder })
    }
  }
}

const toggleFullscreenTerminal = () => {
  if (viewportMode.value === 'terminal-full') {
    viewportMode.value = 'split'
  } else {
    viewportMode.value = 'terminal-full'
  }
}

const emit = defineEmits<{
  (e: 'focus', termId: string): void
  (e: 'close', termId: string): void
  (e: 'open-presets'): void
  (e: 'contextmenu', payload: { x: number; y: number; hasSelection: boolean; paneId: string }): void
}>()

// Kapasitas layout dinamis: single=1, split=2, grid-2x2=4
const layoutCapacity = computed(() => {
  if (currentLayout.value === 'single') return 1
  if (currentLayout.value === 'split-h' || currentLayout.value === 'split-v') return 2
  if (currentLayout.value === 'grid-2x2') return 4
  return 1
})

// Index awal sliding window untuk tab yang tampil di grid
const windowStartIndex = ref(0)

const updateWindow = () => {
  const count = terminals.value.length
  const cap = layoutCapacity.value
  if (count <= cap) {
    windowStartIndex.value = 0
    return
  }
  const activeIdx = terminals.value.findIndex(t => t.id === activeTerminalId.value)
  if (activeIdx === -1) return

  if (activeIdx < windowStartIndex.value) {
    windowStartIndex.value = activeIdx
  } else if (activeIdx >= windowStartIndex.value + cap) {
    windowStartIndex.value = activeIdx - cap + 1
  }

  const maxStart = Math.max(0, count - cap)
  if (windowStartIndex.value > maxStart) {
    windowStartIndex.value = maxStart
  }
  if (windowStartIndex.value < 0) {
    windowStartIndex.value = 0
  }
}

watch(
  [activeTerminalId, currentLayout, () => terminals.value.map(t => t.id).join(',')],
  updateWindow,
  { immediate: true }
)

// Menentukan terminal mana saja yang aktif tampil di viewport grid
const isTerminalVisible = (termId: string): boolean => {
  if (terminals.value.length === 0) return false

  if (currentLayout.value === 'single') {
    return activeTerminalId.value === termId
  }

  const idx = terminals.value.findIndex(t => t.id === termId)
  if (idx === -1) return false

  return idx >= windowStartIndex.value && idx < windowStartIndex.value + layoutCapacity.value
}

// Menghitung terminal yang sedang tampil di grid
const visibleTerminals = computed(() => {
  return terminals.value.filter(t => isTerminalVisible(t.id))
})

const visibleCount = computed(() => visibleTerminals.value.length)

// CSS Grid class dinamis berdasarkan jumlah tab yang terlihat
const gridClass = computed(() => {
  const count = visibleCount.value

  if (currentLayout.value === 'single' || count <= 1) {
    return 'grid grid-cols-1 grid-rows-1'
  }

  if (currentLayout.value === 'split-h') {
    return 'grid grid-cols-2 grid-rows-1'
  }

  if (currentLayout.value === 'split-v') {
    return 'grid grid-cols-1 grid-rows-2'
  }

  if (currentLayout.value === 'grid-2x2') {
    if (count === 2) return 'grid grid-cols-2 grid-rows-1'
    if (count === 3) return 'grid grid-cols-2 grid-rows-2'
    return 'grid grid-cols-2 grid-rows-2'
  }

  return 'grid grid-cols-1 grid-rows-1'
})
</script>

<template>
  <div class="w-full h-full bg-[#12131a] relative flex flex-col min-h-0 min-w-0 select-none overflow-hidden">
    <!-- Top Terminal Tabs & Grid Toolbar (Mirip Tabs Code Editor) -->
    <div class="flex items-center justify-between h-9 bg-[#0d0e14] border-b border-border px-1 overflow-x-auto no-scrollbar flex-shrink-0">
      <!-- Left: Terminal Tabs List -->
      <div class="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
        <div
          v-for="(term, index) in terminals"
          :key="term.id"
          :data-term-tab-index="index"
          :class="[
            'group flex items-center gap-1.5 px-3 py-1 text-xs rounded-t font-mono cursor-pointer border-t-2 transition-all select-none relative touch-none',
            activeTerminalId === term.id
              ? 'bg-[#181924] text-foreground border-primary font-medium shadow-sm'
              : 'text-muted-foreground hover:bg-[#14151f] hover:text-foreground border-transparent',
            isDraggingTab && currentDragIndex === index
              ? 'ring-2 ring-primary bg-primary/20 scale-[1.02] z-20 shadow-md shadow-black/50'
              : ''
          ]"
          :title="`${term.title} (Double-click to rename, Drag to reorder)`"
          @pointerdown="handleTabPointerDown($event, index, term.id)"
          @click="handleTabClick(term.id)"
          @dblclick="startRenameTab(term)"
        >
          <Terminal class="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <input
            v-if="editingTermId === term.id"
            :id="`tab-rename-input-${term.id}`"
            v-model="editingTitle"
            type="text"
            class="px-1 py-0.2 text-xs bg-background border border-primary rounded text-foreground outline-none w-28 font-mono"
            @keydown.enter="finishRenameTab(term.id)"
            @blur="finishRenameTab(term.id)"
            @click.stop
          />
          <span v-else class="truncate max-w-[120px] pointer-events-none">{{ term.title }}</span>

          <!-- Close Terminal Tab Button -->
          <button
            v-if="terminals.length > 1 && editingTermId !== term.id"
            class="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors ml-0.5 opacity-0 group-hover:opacity-100"
            title="Tutup Terminal"
            @click.stop="removeTerminal(term.id)"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <!-- Add New Terminal Button -->
        <button
          class="p-1 rounded hover:bg-[#181924] text-muted-foreground hover:text-foreground transition-colors ml-1"
          title="Buka Terminal Baru (Ctrl+T)"
          @click="addTerminal()"
        >
          <Plus class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Right: Layout Grid Switchers & Presets -->
      <div class="flex items-center gap-1 pl-2 flex-shrink-0">
        <!-- Layout Grid Switcher -->
        <div class="flex items-center bg-[#181924] p-0.5 rounded border border-border/50">
          <button
            :class="[
              'p-1 rounded transition-colors',
              currentLayout === 'single' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            ]"
            title="Single Terminal"
            @click="setLayout('single')"
          >
            <Square class="w-3 h-3" />
          </button>
          <button
            :class="[
              'p-1 rounded transition-colors',
              currentLayout === 'split-h' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            ]"
            title="Split Horizontal (2 Kolom)"
            @click="setLayout('split-h')"
          >
            <Columns2 class="w-3 h-3" />
          </button>
          <button
            :class="[
              'p-1 rounded transition-colors',
              currentLayout === 'split-v' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            ]"
            title="Split Vertikal (2 Baris)"
            @click="setLayout('split-v')"
          >
            <Rows2 class="w-3 h-3" />
          </button>
          <button
            :class="[
              'p-1 rounded transition-colors',
              currentLayout === 'grid-2x2' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            ]"
            title="Grid 2x2"
            @click="setLayout('grid-2x2')"
          >
            <GridIcon class="w-3 h-3" />
          </button>
        </div>

        <!-- Presets Button -->
        <button
          class="p-1 rounded hover:bg-[#181924] text-muted-foreground hover:text-foreground transition-colors"
          title="Buka Preset Workspace"
          @click="emit('open-presets')"
        >
          <Sparkles class="w-3.5 h-3.5 text-indigo-400" />
        </button>

        <!-- Maximize / Restore Terminal Button -->
        <button
          v-if="openFiles.length > 0"
          class="p-1 rounded hover:bg-[#181924] text-muted-foreground hover:text-foreground transition-colors"
          :title="viewportMode === 'terminal-full' ? 'Kembalikan Tampilan Split' : 'Fullscreen Terminal'"
          @click="toggleFullscreenTerminal"
        >
          <Minimize2 v-if="viewportMode === 'terminal-full'" class="w-3.5 h-3.5" />
          <Maximize2 v-else class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Terminal Content Area -->
    <div class="flex-1 w-full h-full p-1.5 relative overflow-hidden min-h-0 min-w-0">
      <!-- Empty State saat tidak ada terminal yang terbuka -->
      <div
        v-if="terminals.length === 0"
        class="w-full h-full flex flex-col items-center justify-center border border-dashed border-border/60 rounded-xl bg-[#12131a]/60 p-6 text-center animate-in fade-in zoom-in-95"
      >
        <div class="p-3.5 rounded-2xl bg-[#181924] border border-border/80 shadow-xl mb-4 text-primary">
          <FolderOpen class="w-8 h-8" />
        </div>

        <h2 class="text-base font-bold text-foreground tracking-tight">
          {{ activeWorkstation.folderPath ? `Project: ${activeWorkstation.name}` : 'Pilih File Project / Mulai Terminal' }}
        </h2>
        <p class="text-xs text-muted-foreground max-w-sm mt-1 mb-5">
          {{
            activeWorkstation.folderPath
              ? `Direktori kerja aktif: ${activeWorkstation.folderPath}`
              : 'Buka folder project agar terminal dan editor otomatis terhubung dengan direktori kerja Anda.'
          }}
        </p>

        <div class="flex flex-wrap items-center justify-center gap-2">
          <!-- Buka Folder Project Button -->
          <UiButton
            variant="default"
            size="sm"
            class="gap-1.5 font-medium shadow-md bg-primary hover:bg-primary/90 text-primary-foreground"
            @click="handleOpenProjectFolder()"
          >
            <FolderOpen class="w-3.5 h-3.5" />
            <span>{{ activeWorkstation.folderPath ? 'Ganti Folder Project' : 'Pilih Folder Project' }}</span>
          </UiButton>

          <!-- Buka Terminal Baru Button -->
          <UiButton
            variant="secondary"
            size="sm"
            class="gap-1.5 font-medium border border-border/60"
            @click="addTerminal()"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Terminal Baru</span>
          </UiButton>
        </div>

        <!-- Quick Recent Projects List in Empty State -->
        <div
          v-if="!activeWorkstation.folderPath && recentProjects.length > 0"
          class="mt-6 pt-5 border-t border-border/40 w-full max-w-lg"
        >
          <div class="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-muted-foreground mb-2.5">
            <Clock class="w-3.5 h-3.5 text-primary" />
            <span>Project yang Pernah Dibuka</span>
          </div>

          <div class="flex flex-wrap justify-center gap-1.5 max-h-40 overflow-y-auto no-scrollbar p-1">
            <button
              v-for="rec in recentProjects"
              :key="rec.path"
              class="px-2.5 py-1 rounded-md bg-[#161722] hover:bg-primary/20 text-foreground text-xs border border-border/50 hover:border-primary/50 transition-colors truncate max-w-[200px] font-mono shadow-sm"
              :title="rec.path"
              @click="handleOpenProjectFolder(rec.path)"
            >
              {{ rec.name }}
            </button>
          </div>
        </div>
      </div>

      <!-- Persistent Dynamic Grid Container for All Workstations (PTY stays alive in background) -->
      <div
        v-else
        id="terminal-grid-container"
        :class="[
          'w-full h-full min-h-0 min-w-0 transition-none',
          currentLayout === 'split-h' && visibleCount === 2 ? 'flex flex-row' :
          currentLayout === 'split-v' && visibleCount === 2 ? 'flex flex-col' :
          'grid gap-1.5 ' + gridClass
        ]"
      >
        <template v-for="item in allWorkstationTerminals" :key="item.term.id">
          <!-- Terminal Pane Viewport -->
          <div
            v-show="isTerminalVisibleInGrid(item.wsId, item.term.id)"
            :style="{
              width: (currentLayout === 'split-h' && visibleCount === 2 && item.term.id === visibleTerminals[0]?.id)
                ? `${terminalSplitPercent}%`
                : (currentLayout === 'split-h' && visibleCount === 2)
                ? `${100 - terminalSplitPercent}%`
                : '100%',
              height: (currentLayout === 'split-v' && visibleCount === 2 && item.term.id === visibleTerminals[0]?.id)
                ? `${terminalSplitPercent}%`
                : (currentLayout === 'split-v' && visibleCount === 2)
                ? `${100 - terminalSplitPercent}%`
                : '100%'
            }"
            :class="[
              'min-h-0 min-w-0 overflow-hidden flex-shrink-0 relative transition-none',
              currentLayout === 'grid-2x2' && visibleCount === 3 && item.term.id === visibleTerminals[2]?.id ? 'col-span-2' : ''
            ]"
          >
            <TerminalPane
              :pane-id="item.term.id"
              :title="item.term.title"
              :shell="item.term.shell"
              :cwd="item.term.cwd"
              :initial-command="item.term.initialCommand"
              :last-command="item.term.lastCommand"
              :is-active="activeWorkstationId === item.wsId && activeTerminalId === item.term.id"
              :is-tab-active="isTerminalVisibleInGrid(item.wsId, item.term.id)"
              @focus="activeTerminalId = $event"
              @close="emit('close', $event)"
              @contextmenu="emit('contextmenu', $event)"
            />
          </div>

          <!-- Draggable Divider Between Terminal 1 and Terminal 2 -->
          <div
            v-if="
              item.wsId === activeWorkstationId &&
              item.term.id === visibleTerminals[0]?.id &&
              visibleCount === 2 &&
              (currentLayout === 'split-h' || currentLayout === 'split-v')
            "
            :class="[
              'bg-border hover:bg-primary flex-shrink-0 transition-colors z-10 select-none flex items-center justify-center group',
              currentLayout === 'split-h' ? 'w-1.5 h-full cursor-col-resize' : 'h-1.5 w-full cursor-row-resize'
            ]"
            @mousedown="startTerminalSplitDrag"
          >
            <div
              :class="[
                'bg-muted-foreground/30 group-hover:bg-primary-foreground rounded-full',
                currentLayout === 'split-h' ? 'w-0.5 h-6' : 'h-0.5 w-6'
              ]"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>

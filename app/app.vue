<script setup lang="ts">
import { GitBranch, FolderOpen, Rows2, Columns2, Sparkles } from 'lucide-vue-next'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'
import { useEditorStore } from '~/composables/useEditorStore'
import { useProjectExplorer } from '~/composables/useProjectExplorer'
import { useUpdater } from '~/composables/useUpdater'

const {
  workstations,
  activeWorkstationId,
  activeWorkstation,
  removeWorkstation,
  terminals,
  activeTerminalId,
  currentLayout,
  nextTab,
  prevTab,
  addTerminal,
  duplicateTerminal,
  removeTerminal,
  moveTerminalTab,
  toggleSidebar,
  nextWorkstation,
  prevWorkstation,
  setLayout,
  initFromStorage,
  saveSession,
  presets,
  applyPreset
} = useWorkspaceStore()
const {
  isEditorVisible,
  isTerminalVisible,
  viewportMode,
  splitOrientation,
  openFiles,
  lastFocusedPane,
  activeFile,
  activeFileId,
  closeActiveFile,
  reopenClosedTab,
  nextFileTab,
  prevFileTab,
  initEditorSession,
  saveEditorSession,
  saveAll
} = useEditorStore()
const { gitBranch, refreshGitStatus } = useProjectExplorer()
const { isTauri, writePty, pasteFromClipboard } = useTauriPty()
const { isShortcut, requestDesktopNotification } = useSettingsStore()
const { showAppConfirm } = useAppDialog()
const { backgroundAlerts } = useWorkspaceStore()
const {
  status: updateStatus,
  currentAppVersion,
  newVersion,
  hasUpdate,
  fetchCurrentVersion,
  checkForUpdates,
  downloadAndInstall,
} = useUpdater()

const isPresetModalOpen = ref(false)
const isSettingsModalOpen = ref(false)
const isQuickPickerOpen = ref(false)
const isGlobalSearchOpen = ref(false)
const isShortcutsOpen = ref(false)
const isUpdateModalOpen = ref(false)
const { isOpen: isCommandPaletteOpen, togglePalette, openPalette } = useCommandPalette()

// Window State Persistence (size / position / maximized)
const WINDOW_STATE_KEY = 'mytermin_window_state_v1'
let windowStateTimer: any = null
let unlistenResize: (() => void) | null = null
let unlistenMove: (() => void) | null = null
let allowWindowClose = false

const persistWindowState = async () => {
  if (!isTauri.value) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const w = getCurrentWindow()
    if (await w.isMinimized()) {
      return // Jangan simpan koordinat saat minimized (Windows mengembalikan -32000, -32000)
    }
    if (await w.isMaximized()) {
      const raw = localStorage.getItem(WINDOW_STATE_KEY)
      const prev = raw ? JSON.parse(raw) : {}
      localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify({ ...prev, maximized: true }))
      return
    }
    const size = await w.outerSize()
    const pos = await w.outerPosition()
    // Pastikan bukan koordinat minimized
    if (pos.x < -10000 || pos.y < -10000) return

    localStorage.setItem(WINDOW_STATE_KEY, JSON.stringify({
      maximized: false,
      width: size.width,
      height: size.height,
      x: pos.x,
      y: pos.y
    }))
  } catch {
    // Silent
  }
}

const restoreWindowState = async () => {
  if (!isTauri.value) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const { PhysicalSize, PhysicalPosition } = await import('@tauri-apps/api/dpi')
    const w = getCurrentWindow()

    const raw = localStorage.getItem(WINDOW_STATE_KEY)
    if (raw) {
      const state = JSON.parse(raw)
      if (state.maximized) {
        await w.maximize()
      } else {
        if (state.width >= 800 && state.height >= 600) {
          await w.setSize(new PhysicalSize(state.width, state.height))
        }
        // Validasi posisi: jangan restore jika posisi aneh atau di luar batas wajar
        if (typeof state.x === 'number' && typeof state.y === 'number' && state.x > -5000 && state.y > -5000) {
          await w.setPosition(new PhysicalPosition(state.x, state.y))
        }
      }
    }

    // Pastikan window selalu tampil dan fokus di layar
    await w.show()
    await w.setFocus()
  } catch {
    // Silent
  }
}

const setupWindowStatePersistence = async () => {
  if (!isTauri.value) return
  await restoreWindowState()
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const w = getCurrentWindow()
    const debounced = () => {
      clearTimeout(windowStateTimer)
      windowStateTimer = setTimeout(persistWindowState, 500)
    }
    unlistenResize = await w.onResized(debounced)
    unlistenMove = await w.onMoved(debounced)

    // Confirm before closing app while terminal processes are running
    await w.onCloseRequested(async (event) => {
      if (allowWindowClose) return

      if (hasRunningProcesses()) {
        const ok = await showAppConfirm(
          'Masih ada proses yang berjalan di terminal (server, build, atau CLI aktif). Yakin ingin keluar?',
          'Konfirmasi Keluar',
          'warning',
          'Keluar'
        )
        if (!ok) {
          event.preventDefault()
          return
        }
      }

      allowWindowClose = true
      saveSession(false)
      saveEditorSession()

      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('kill_all_ptys')
      } catch {
        // Silent
      }
    })
  } catch {
    // Silent
  }
}

// Ada proses aktif? Pakai backgroundAlerts dari TerminalPane (status 'running').
const hasRunningProcesses = () => {
  return Object.values(backgroundAlerts.value || {}).some((s) => s === 'running')
}

// Resizable Split
const editorSplitPercent = ref(50)
const isDraggingSplit = ref(false)

const startSplitDrag = (e: MouseEvent) => {
  e.preventDefault()
  isDraggingSplit.value = true

  const onMouseMove = (moveEvent: MouseEvent) => {
    if (!isDraggingSplit.value) return
    const container = document.getElementById('editor-terminal-container')
    if (!container) return
    const rect = container.getBoundingClientRect()
    if (splitOrientation.value === 'horizontal') {
      const relX = moveEvent.clientX - rect.left
      const newPercent = Math.min(Math.max((relX / rect.width) * 100, 15), 85)
      editorSplitPercent.value = Math.round(newPercent)
    } else {
      const relY = moveEvent.clientY - rect.top
      const newPercent = Math.min(Math.max((relY / rect.height) * 100, 15), 85)
      editorSplitPercent.value = Math.round(newPercent)
    }
  }

  const onMouseUp = () => {
    isDraggingSplit.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Context Menu State
const contextMenuVisible = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })
const contextMenuHasSelection = ref(false)
const contextMenuPaneId = ref('')

const handlePaneContextMenu = (payload: { x: number; y: number; hasSelection: boolean; paneId: string }) => {
  contextMenuPos.value = { x: payload.x, y: payload.y }
  contextMenuHasSelection.value = payload.hasSelection
  contextMenuPaneId.value = payload.paneId
  contextMenuVisible.value = true
}

const handleContextMenuAction = async (action: string) => {
  if (action === 'copy') {
    const sel = window.getSelection()?.toString()
    if (sel) {
      await navigator.clipboard.writeText(sel)
    }
  } else if (action === 'paste') {
    try {
      const targetPane = contextMenuPaneId.value || activeTerminalId.value
      if (!targetPane) return
      await pasteFromClipboard(targetPane)
    } catch (e) {
      console.warn('Paste failed:', e)
    }
  } else if (action === 'clear') {
    if (contextMenuPaneId.value) {
      writePty(contextMenuPaneId.value, 'clear\r')
    }
  } else if (action === 'search') {
    const target = contextMenuPaneId.value || activeTerminalId.value
    if (target && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`terminal-action-${target}`, { detail: 'search' }))
    }
  } else if (action === 'export') {
    const target = contextMenuPaneId.value || activeTerminalId.value
    if (target && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`terminal-action-${target}`, { detail: 'export' }))
    }
  } else if (action === 'command-palette') {
    openPalette()
  } else if (action === 'new-tab') {
    addTerminal()
  } else if (action === 'duplicate') {
    duplicateTerminal(contextMenuPaneId.value || activeTerminalId.value)
  } else if (action === 'close-tab') {
    if (contextMenuPaneId.value) {
      removeTerminal(contextMenuPaneId.value)
    }
  } else if (action === 'layout-single') {
    setLayout('single')
  } else if (action === 'layout-split-h') {
    setLayout('split-h')
  } else if (action === 'layout-split-v') {
    setLayout('split-v')
  } else if (action === 'layout-grid-2x2') {
    setLayout('grid-2x2')
  }
}

// Global Keybindings
const handleKeydown = (e: KeyboardEvent) => {
  // Keyboard Shortcuts Cheatsheet: F1 or Ctrl+/
  if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
    e.preventDefault()
    isShortcutsOpen.value = !isShortcutsOpen.value
    return
  }

  // Quick Open File: Ctrl+P / Cmd+P
  if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault()
    isQuickPickerOpen.value = !isQuickPickerOpen.value
    return
  }

  // Global Search in Files: Ctrl+Shift+F / Cmd+Shift+F
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault()
    isGlobalSearchOpen.value = !isGlobalSearchOpen.value
    return
  }

  // Reopen Closed Editor Tab: Ctrl+Shift+T / Cmd+Shift+T
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
    e.preventDefault()
    reopenClosedTab()
    return
  }

  // Close Workstation: Ctrl+Shift+W / Cmd+Shift+W
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'w' || e.key === 'W')) {
    e.preventDefault()
    if (activeWorkstationId.value) {
      removeWorkstation(activeWorkstationId.value)
    }
    return
  }

  // Save All: Ctrl+Shift+S / Cmd+Shift+S
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault()
    saveAll()
    return
  }

  // Toggle Sidebar: Ctrl+B
  if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
    e.preventDefault()
    toggleSidebar()
    return
  }

  // Cyclic navigation: Context-aware Ctrl+Tab & Ctrl+Shift+Tab
  if (e.ctrlKey && (e.key === 'Tab' || e.code === 'Tab')) {
    e.preventDefault()
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null
    const isDirectlyInTerminal = Boolean(activeEl?.closest('.xterm') || activeEl?.closest('#terminal-grid-container'))
    const isDirectlyInEditor = Boolean(activeEl?.closest('.monaco-editor') || activeEl?.closest('#code-editor-pane') || activeEl?.closest('.monaco-diff-editor'))

    const isEditorActive = isDirectlyInEditor || (!isDirectlyInTerminal && lastFocusedPane.value === 'editor')

    if (isEditorActive && isEditorVisible.value && openFiles.value.length > 0) {
      if (e.shiftKey) {
        prevFileTab()
      } else {
        nextFileTab()
      }
    } else {
      if (e.shiftKey) {
        nextWorkstation()
      } else {
        nextTab()
      }
    }
    return
  }

  // Custom Keybindings
  if (isShortcut(e, 'newTab')) {
    e.preventDefault()
    addTerminal()
    return
  }

  if (isShortcut(e, 'commandPalette')) {
    e.preventDefault()
    togglePalette()
    return
  }

  if (isShortcut(e, 'searchBuffer')) {
    e.preventDefault()
    if (activeTerminalId.value && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`terminal-action-${activeTerminalId.value}`, { detail: 'search' }))
    }
    return
  }

  if (isShortcut(e, 'closeTab')) {
    e.preventDefault()
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null
    const isInsideEditor = Boolean(
      activeEl?.closest('.monaco-editor') ||
      activeEl?.closest('#editor-terminal-container > div:first-child')
    )

    if (isInsideEditor && isEditorVisible.value && activeFileId.value) {
      closeActiveFile()
    } else if (activeTerminalId.value) {
      removeTerminal(activeTerminalId.value)
    }
    return
  }

  if (isShortcut(e, 'duplicateTab')) {
    e.preventDefault()
    duplicateTerminal()
    return
  }

  if (isShortcut(e, 'splitHorizontal')) {
    e.preventDefault()
    setLayout('split-h')
    return
  }

  if (isShortcut(e, 'splitVertical')) {
    e.preventDefault()
    setLayout('split-v')
    return
  }

  if (isShortcut(e, 'grid2x2')) {
    e.preventDefault()
    setLayout('grid-2x2')
    return
  }

  if (isShortcut(e, 'singleView')) {
    e.preventDefault()
    setLayout('single')
    return
  }

  // Tab Reorder Shortcuts
  if (e.ctrlKey && e.shiftKey) {
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault()
      const curIdx = terminals.value.findIndex(t => t.id === activeTerminalId.value)
      if (curIdx > 0) {
        moveTerminalTab(curIdx, curIdx - 1)
      }
      return
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault()
      const curIdx = terminals.value.findIndex(t => t.id === activeTerminalId.value)
      if (curIdx !== -1 && curIdx < terminals.value.length - 1) {
        moveTerminalTab(curIdx, curIdx + 1)
      }
      return
    } else if (e.key === 'P' || e.key === 'p') {
      e.preventDefault()
      isPresetModalOpen.value = true
    }
  }
}

onMounted(() => {
  initFromStorage()
  initEditorSession()
  // Apply startup presets after session init (if configured in Settings)
  const { settings } = useSettingsStore()
  const startupIds = settings.value.startupPresetIds || []
  if (startupIds.length > 0) {
    const preset = presets.value.filter(p => startupIds.includes(p.id))
    if (preset.length > 0) {
      applyPreset({
        ...preset[0],
        id: `startup-${Date.now()}`,
        terminals: preset.flatMap(p => p.terminals.map(t => ({
          title: t.title,
          command: t.command,
          shell: t.shell,
          cwd: t.cwd
        })))
      })
    }
  }
  window.addEventListener('keydown', handleKeydown, true)
  requestDesktopNotification()
  setupWindowStatePersistence()
  
  // Background check for update pada startup
  if (isTauri.value) {
    fetchCurrentVersion()
    setTimeout(async () => {
      const hasNew = await checkForUpdates(true)
      if (hasNew) {
        isUpdateModalOpen.value = true
      }
    }, 2500)
  }

  window.addEventListener('beforeunload', () => {
    saveSession(false)
    saveEditorSession()
    persistWindowState()
  })
})

onBeforeUnmount(() => {
  saveSession(false)
  saveEditorSession()
  if (windowStateTimer) clearTimeout(windowStateTimer)
  unlistenResize?.()
  unlistenMove?.()
  window.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <div
    class="flex flex-col h-screen w-screen bg-background overflow-hidden font-sans select-none"
    @contextmenu.prevent
  >
    <!-- Custom Draggable TitleBar with Workstation Tabs -->
    <TitleBar
      @open-presets="isPresetModalOpen = true"
      @open-settings="isSettingsModalOpen = true"
      @open-palette="isCommandPaletteOpen = true"
      @open-shortcuts="isShortcutsOpen = true"
    />

    <!-- Main Workspace Viewport: Sidebar Workstation Kiri + Editor / Terminal Viewport Kanan -->
    <main class="flex-1 w-full h-[calc(100vh-2.5rem-1.5rem)] overflow-hidden flex relative">
      <WorkstationSidebar
        @open-presets="isPresetModalOpen = true"
        @open-palette="isCommandPaletteOpen = true"
      />
      <!-- Right Content Area (Editor + Terminal Layout) -->
      <div
        id="editor-terminal-container"
        :class="[
          'flex-1 h-full overflow-hidden flex relative',
          splitOrientation === 'horizontal' ? 'flex-row' : 'flex-col'
        ]"
      >
        <!-- Code Editor Pane (v-show preserves editor state & avoids remount) -->
        <div
          v-show="isEditorVisible"
          :style="{
            width: viewportMode === 'split' && splitOrientation === 'horizontal' ? `${editorSplitPercent}%` : '100%',
            height: viewportMode === 'split' && splitOrientation === 'vertical' ? `${editorSplitPercent}%` : '100%'
          }"
          class="overflow-hidden flex-shrink-0 relative transition-none"
        >
          <CodeEditorPane />
        </div>

        <!-- Draggable Resizer Bar -->
        <div
          v-show="isEditorVisible && isTerminalVisible"
          :class="[
            'bg-border hover:bg-primary flex-shrink-0 transition-colors z-20 select-none flex items-center justify-center group',
            splitOrientation === 'horizontal' ? 'w-1.5 h-full cursor-col-resize' : 'h-1.5 w-full cursor-row-resize'
          ]"
          @mousedown="startSplitDrag"
        >
          <div
            :class="[
              'bg-muted-foreground/30 group-hover:bg-primary-foreground rounded-full',
              splitOrientation === 'horizontal' ? 'w-0.5 h-6' : 'h-0.5 w-6'
            ]"
          />
        </div>

        <!-- Terminal Layout Grid (v-show preserves PTY processes & avoids re-running) -->
        <div
          v-show="isTerminalVisible"
          class="flex-1 h-full overflow-hidden relative min-w-0 min-h-0"
        >
          <LayoutGrid
            @open-presets="isPresetModalOpen = true"
            @contextmenu="handlePaneContextMenu"
          />
        </div>
      </div>
    </main>

    <!-- Global Workspace Status Bar (Always Visible across Terminal & Editor) -->
    <footer class="h-6 w-full bg-[#0a0b0f] border-t border-border/60 px-3 flex items-center justify-between text-[11px] font-mono select-none z-30 flex-shrink-0 text-muted-foreground">
      <!-- Left: Git Branch, Folder Path, Workspace Name -->
      <div class="flex items-center gap-3 truncate max-w-[60%]">
        <!-- Git Branch Badge -->
        <div
          v-if="gitBranch"
          class="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors cursor-pointer font-medium flex-shrink-0"
          :title="`Git Branch: ${gitBranch} (Klik untuk refresh)`"
          @click="refreshGitStatus"
        >
          <GitBranch class="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span>{{ gitBranch }}</span>
        </div>

        <div v-if="activeWorkstation.folderPath" class="flex items-center gap-1.5 text-muted-foreground truncate" :title="activeWorkstation.folderPath">
          <FolderOpen class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span class="truncate">{{ activeWorkstation.name }}</span>
        </div>

        <!-- If active file exists in editor -->
        <span v-if="activeFile && isEditorVisible" class="truncate text-muted-foreground/70 hidden sm:inline" :title="activeFile.path">
          • {{ activeFile.name }}
        </span>
      </div>

      <!-- Right: Sessions & Layout info -->
      <div class="flex items-center gap-3.5 flex-shrink-0">
        <!-- Update Available Badge -->
        <button
          v-if="hasUpdate"
          class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors animate-pulse"
          :title="`Versi baru v${newVersion} tersedia. Buka Pengaturan untuk memperbarui.`"
          @click="isUpdateModalOpen = true"
        >
          <Sparkles class="w-3 h-3 text-blue-400" />
          <span class="text-[10px] font-semibold">Update v{{ newVersion }}</span>
        </button>

        <!-- Split Orientation Toggle Button -->
        <button
          v-if="isEditorVisible"
          class="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#1c1d2b] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          :title="splitOrientation === 'horizontal' ? 'Posisi: Kiri/Kanan (Klik untuk ubah ke Atas/Bawah)' : 'Posisi: Atas/Bawah (Klik untuk ubah ke Kiri/Kanan)'"
          @click="splitOrientation = splitOrientation === 'horizontal' ? 'vertical' : 'horizontal'"
        >
          <Rows2 v-if="splitOrientation === 'vertical'" class="w-3.5 h-3.5 text-primary" />
          <Columns2 v-else class="w-3.5 h-3.5 text-primary" />
          <span class="text-[10px] hidden sm:inline">{{ splitOrientation === 'horizontal' ? 'Horizontal' : 'Vertikal' }}</span>
        </button>

        <!-- Terminal Count -->
        <span class="text-muted-foreground/60 hidden md:inline">
          {{ terminals.length }} Terminal
        </span>

        <!-- App Version Badge -->
        <span
          class="text-muted-foreground/80 hover:text-foreground cursor-pointer transition-colors"
          title="Klik untuk membuka Pengaturan Pembaruan"
          @click="isSettingsModalOpen = true"
        >
          v{{ currentAppVersion }}
        </span>

        <!-- Layout Indicator -->
        <span class="text-primary/90 uppercase font-semibold text-[10px]">
          {{ currentLayout }}
        </span>

        <span>UTF-8</span>
      </div>
    </footer>

    <!-- Custom Native Context Menu -->
    <CustomContextMenu
      :visible="contextMenuVisible"
      :x="contextMenuPos.x"
      :y="contextMenuPos.y"
      :has-selection="contextMenuHasSelection"
      :target-pane-id="contextMenuPaneId"
      @close="contextMenuVisible = false"
      @action="handleContextMenuAction"
    />

    <!-- Modals & Command Palette -->
    <AppGlobalDialog />
    <QuickFilePickerModal v-model:open="isQuickPickerOpen" />
    <GlobalSearchModal v-model:open="isGlobalSearchOpen" />
    <ShortcutsCheatsheetModal v-model:open="isShortcutsOpen" />
    <CommandPalette
      @open-presets="isPresetModalOpen = true"
      @open-settings="isSettingsModalOpen = true"
    />
    <PresetModal v-model:open="isPresetModalOpen" />
    <SettingsModal v-model:open="isSettingsModalOpen" />
    <UpdateNotificationModal v-model:open="isUpdateModalOpen" />
  </div>
</template>

<script setup lang="ts">
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'

const {
  terminals,
  activeTerminalId,
  currentLayout,
  nextTab,
  prevTab,
  addTerminal,
  duplicateTerminal,
  removeTerminal,
  moveTerminalTab,
  setLayout,
  initFromStorage,
  saveSession,
  presets,
  applyPreset
} = useWorkspaceStore()
const { writePty, pasteFromClipboard } = useTauriPty()

const isPresetModalOpen = ref(false)
const isSettingsModalOpen = ref(false)
const { isOpen: isCommandPaletteOpen, togglePalette, openPalette } = useCommandPalette()

// Context Menu State
const contextMenuVisible = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })
const contextMenuHasSelection = ref(false)
const contextMenuPaneId = ref('')

const handleGlobalContextMenu = (e: MouseEvent) => {
  e.preventDefault()
  contextMenuPos.value = { x: e.clientX, y: e.clientY }
  contextMenuHasSelection.value = Boolean(window.getSelection()?.toString())
  contextMenuPaneId.value = activeTerminalId.value
  contextMenuVisible.value = true
}

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
  // Cyclic navigation: Ctrl+Tab and Ctrl+Shift+Tab
  if (e.ctrlKey && e.key === 'Tab') {
    e.preventDefault()
    if (e.shiftKey) {
      prevTab()
    } else {
      nextTab()
    }
    return
  }

  // Ctrl+T: New terminal tab
  if (e.ctrlKey && (e.key === 't' || e.key === 'T')) {
    e.preventDefault()
    addTerminal()
    return
  }

  // Ctrl+K: Open Command Palette
  if (e.ctrlKey && (e.key === 'k' || e.key === 'K' || e.keyCode === 75)) {
    e.preventDefault()
    togglePalette()
    return
  }

  // Ctrl+W: Close active terminal tab
  if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
    e.preventDefault()
    if (activeTerminalId.value) {
      removeTerminal(activeTerminalId.value)
    }
    return
  }

  // Layout, Duplicate & Tab Reorder Shortcuts
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
    } else if (e.key === 'D' || e.key === 'd') {
      e.preventDefault()
      duplicateTerminal()
    } else if (e.key === 'G' || e.key === 'g') {
      e.preventDefault()
      setLayout('grid-2x2')
    } else if (e.key === 'E' || e.key === 'e') {
      e.preventDefault()
      setLayout('split-h')
    } else if (e.key === 'O' || e.key === 'o') {
      e.preventDefault()
      setLayout('split-v')
    } else if (e.key === 'S' || e.key === 's') {
      e.preventDefault()
      setLayout('single')
    } else if (e.key === 'P' || e.key === 'p') {
      e.preventDefault()
      isPresetModalOpen.value = true
    }
  }
}

onMounted(() => {
  initFromStorage()
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
  window.addEventListener('contextmenu', handleGlobalContextMenu)
  window.addEventListener('mytermin-open-palette', () => {
    isCommandPaletteOpen.value = true
  })
  window.addEventListener('beforeunload', () => {
    saveSession(false)
  })
})

onBeforeUnmount(() => {
  saveSession(false)
  window.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('contextmenu', handleGlobalContextMenu)
  window.removeEventListener('mytermin-open-palette', () => {})
})
</script>

<template>
  <div
    class="flex flex-col h-screen w-screen bg-background overflow-hidden font-sans select-none"
    @contextmenu.prevent="handleGlobalContextMenu"
  >
    <!-- Custom Draggable TitleBar with Terminal Tabs -->
    <TitleBar
      @open-presets="isPresetModalOpen = true"
      @open-settings="isSettingsModalOpen = true"
      @open-palette="isCommandPaletteOpen = true"
    />

    <!-- Main Workspace Viewport: Displays Open Tabs in Single / 2-Split / 4-Grid -->
    <main class="flex-1 w-full h-[calc(100vh-2.5rem)] overflow-hidden relative">
      <LayoutGrid
        @open-presets="isPresetModalOpen = true"
        @contextmenu="handlePaneContextMenu"
      />
    </main>

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
    <CommandPalette
      @open-presets="isPresetModalOpen = true"
      @open-settings="isSettingsModalOpen = true"
    />
    <PresetModal v-model:open="isPresetModalOpen" />
    <SettingsModal v-model:open="isSettingsModalOpen" />
  </div>
</template>

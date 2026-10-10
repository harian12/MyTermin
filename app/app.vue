<script setup lang="ts">
import { GitBranch, GitCommit, FolderOpen, Rows2, Columns2, Sparkles, ArrowDown, ArrowUp, FileEdit, RefreshCw, Loader2 } from 'lucide-vue-next'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'
import { useEditorStore } from '~/composables/useEditorStore'
import { useProjectExplorer } from '~/composables/useProjectExplorer'
import { useGitExtras } from '~/composables/useGitExtras'
import { useGitHubActions } from '~/composables/useGitHubActions'
import { useUpdater } from '~/composables/useUpdater'

const {
  workstations,
  activeWorkstationId,
  activeWorkstation,
  removeWorkstation,
  terminals,
  renameTerminal,
  activeTerminalId,
  currentLayout,
  nextTab,
  prevTab,
  addTerminal,
  duplicateTerminal,
  removeTerminal,
  moveTerminalTab,
  toggleSidebar,
  isSidebarOpen,
  nextWorkstation,
  prevWorkstation,
  setLayout,
  togglePinTerminal,
  reopenClosedTerminal,
  toggleBroadcastInput,
  initFromStorage,
  saveSession,
  sessionReady,
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
  createScratchpadFile,
  closeActiveFile,
  reopenClosedTab,
  nextFileTab,
  prevFileTab,
  editorCursorPos,
  activeLineBlame,
  initEditorSession,
  saveEditorSession,
  saveAll
} = useEditorStore()
const { gitBranch, gitOverview, refreshGitStatus, startGitPolling, stopGitPolling, fetchBranches, pullGit, pushGit } = useProjectExplorer()
const { aheadBehind, fetchAll } = useGitExtras()
const { runningCount: actionsRunningCount } = useGitHubActions()
const sidebarActiveTab = useState<'explorer' | 'git' | 'terminals'>('sidebar-active-tab', () => 'explorer')
const { isTauri, writePty, pasteFromClipboard, copyToClipboard } = useTauriPty()
const { isShortcut, requestDesktopNotification, settings, updateSettings } = useSettingsStore()
const { showAppConfirm, showAppPrompt } = useAppDialog()
const { backgroundAlerts } = useWorkspaceStore()
const { loadConfig, loadEnvFile, envEntries } = useProjectConfig()
const { error: logError, warn: logWarn } = useDiagnostics()

const envEntriesAreEmpty = () => envEntries.value.length === 0

// Error runtime global disimpan agar bisa dilihat di Pengaturan > Diagnostik
// tanpa harus membuka DevTools.
const handleGlobalError = (event: ErrorEvent) => {
  logError('runtime', event.message || String(event.error || 'unknown error'))
}

const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
  logError('promise', String(event.reason?.message || event.reason || 'unhandled rejection'))
}
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
const settingsInitialTab = ref<'appearance' | 'session' | 'shortcuts' | 'cli' | 'diagnostics'>('appearance')
const handleOpenSettingsTab = (tab?: string) => {
  if (tab) {
    settingsInitialTab.value = tab as any
  }
  isSettingsModalOpen.value = true
}
const isQuickPickerOpen = ref(false)
const isGlobalSearchOpen = ref(false)
const isShortcutsOpen = ref(false)
const isUpdateModalOpen = ref(false)
const isBranchModalOpen = ref(false)
const isGitGraphModalOpen = ref(false)
const isBranchCompareModalOpen = ref(false)
const isGitActionsModalOpen = ref(false)
const isPortManagerModalOpen = ref(false)
const isAiPanelOpen = ref(false)
const isOnboardingOpen = ref(false)

const { portsList: activePortsList, startPolling: startPortPolling, stopPolling: stopPortPolling } = usePortManager()

const openFooterBranchPicker = async () => {
  await fetchBranches()
  isBranchModalOpen.value = true
}

const gitChangesCount = computed(() => {
  return (gitOverview.value?.staged?.length || 0) +
    (gitOverview.value?.unstaged?.length || 0) +
    (gitOverview.value?.untracked?.length || 0)
})

const isPullingFooter = ref(false)
const handleFooterPull = async () => {
  if (isPullingFooter.value) return
  isPullingFooter.value = true
  try {
    const res = await pullGit()
    if (res.success) {
      await refreshGitStatus()
    } else {
      await showAppConfirm(
        `Gagal melakukan pull: ${res.error || 'Terjadi kesalahan saat git pull'}`,
        'Git Pull',
        'info',
        'OK'
      )
    }
  } finally {
    isPullingFooter.value = false
  }
}

const isPushingFooter = ref(false)
const handleFooterPush = async () => {
  if (isPushingFooter.value) return
  isPushingFooter.value = true
  try {
    const res = await pushGit()
    if (res.success) {
      await refreshGitStatus()
    } else {
      await showAppConfirm(
        `Gagal melakukan push: ${res.error || 'Terjadi kesalahan saat git push'}`,
        'Git Push',
        'info',
        'OK'
      )
    }
  } finally {
    isPushingFooter.value = false
  }
}

const isFetchingFooter = ref(false)
const handleFooterFetch = async () => {
  if (isFetchingFooter.value) return
  isFetchingFooter.value = true
  try {
    await fetchAll()
    await refreshGitStatus()
  } finally {
    isFetchingFooter.value = false
  }
}

const openGitSidebarTab = () => {
  sidebarActiveTab.value = 'git'
  isSidebarOpen.value = true
}
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
const contextMenuSelectionText = ref('')
const contextMenuPaneId = ref('')

const handlePaneContextMenu = (payload: { x: number; y: number; hasSelection: boolean; selectionText?: string; paneId: string }) => {
  contextMenuPos.value = { x: payload.x, y: payload.y }
  contextMenuHasSelection.value = payload.hasSelection
  contextMenuSelectionText.value = payload.selectionText || ''
  contextMenuPaneId.value = payload.paneId
  contextMenuVisible.value = true
}

const handleContextMenuAction = async (action: string) => {
  if (action === 'copy') {
    const sel = contextMenuSelectionText.value || window.getSelection()?.toString() || ''
    if (sel) {
      await copyToClipboard(sel)
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
  } else if (action === 'reset') {
    const target = contextMenuPaneId.value || activeTerminalId.value
    if (target && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`terminal-action-${target}`, { detail: 'reset' }))
    }
  } else if (action === 'search') {
    const target = contextMenuPaneId.value || activeTerminalId.value
    if (target && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`terminal-action-${target}`, { detail: 'search' }))
    }
  } else if (action === 'select-all') {
    const target = contextMenuPaneId.value || activeTerminalId.value
    if (target && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`terminal-action-${target}`, { detail: 'select-all' }))
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
  } else if (action === 'git-worktrees') {
    openFooterBranchPicker()
  } else if (action === 'duplicate') {
    duplicateTerminal(contextMenuPaneId.value || activeTerminalId.value)
  } else if (action === 'rename-tab') {
    const target = contextMenuPaneId.value || activeTerminalId.value
    if (target) {
      const term = terminals.value.find(t => t.id === target)
      const newTitle = await showAppPrompt('Nama baru untuk tab terminal:', 'Ganti Nama Terminal', term?.title || 'Terminal')
      if (newTitle && newTitle.trim()) {
        renameTerminal(target, newTitle.trim())
      }
    }
  } else if (action === 'toggle-pin-tab') {
    const target = contextMenuPaneId.value || activeTerminalId.value
    if (target) {
      togglePinTerminal(target)
    }
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
  } else if (action === 'layout-split-3') {
    setLayout('split-3')
  } else if (action === 'layout-grid-2x2') {
    setLayout('grid-2x2')
  } else if (action.startsWith('color-')) {
    const color = action.replace('color-', '')
    const targetPane = contextMenuPaneId.value || activeTerminalId.value
    if (targetPane) {
      const { setTerminalColor } = useWorkspaceStore()
      setTerminalColor(targetPane, color === 'none' ? undefined : color)
    }
  }
}

const openSettings = (tab: typeof settingsInitialTab.value = 'appearance') => {
  settingsInitialTab.value = tab
  isSettingsModalOpen.value = true
}

const openSettingsToKeybindings = () => {
  isShortcutsOpen.value = false
  openSettings('shortcuts')
}

// Global Keybindings
const handleKeydown = (e: KeyboardEvent) => {
  // Keyboard Shortcuts Cheatsheet: F1 or Ctrl+/
  if (e.key === 'F1' || ((e.ctrlKey || e.metaKey) && e.key === '/')) {
    e.preventDefault()
    isShortcutsOpen.value = !isShortcutsOpen.value
    return
  }

  // Quick Open File: Ctrl+P / Cmd+P (Hanya di Editor, bukan saat terminal fokus)
  if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null
    const isDirectlyInTerminal = Boolean(activeEl?.closest('.xterm') || activeEl?.closest('#terminal-grid-container'))
    if (!isDirectlyInTerminal) {
      e.preventDefault()
      isQuickPickerOpen.value = !isQuickPickerOpen.value
      return
    }
  }

  // Global Search in Files: Ctrl+Shift+F / Cmd+Shift+F
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
    e.preventDefault()
    isGlobalSearchOpen.value = !isGlobalSearchOpen.value
    return
  }

  // Reopen Closed Editor Tab: default Ctrl+Shift+T ( customizable via keybindings)
  if (isShortcut(e, 'reopenClosedTab')) {
    e.preventDefault()
    reopenClosedTab()
    return
  }

  // New Draft / Scratchpad File: Ctrl+N / Cmd+N (Hanya saat bukan di terminal)
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null
    const isDirectlyInTerminal = Boolean(activeEl?.closest('.xterm') || activeEl?.closest('#terminal-grid-container'))
    if (!isDirectlyInTerminal) {
      e.preventDefault()
      createScratchpadFile()
      return
    }
  }

  // Open New Blank Window: Ctrl+Shift+N / Cmd+Shift+N
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
    e.preventDefault()
    if (isTauri.value) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('open_new_window', { blank: true }).catch(console.error)
      })
    } else {
      window.open(window.location.origin, '_blank')
    }
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

  if (isShortcut(e, 'commandHistory')) {
    e.preventDefault()
    const { togglePalette: toggleHistoryPalette } = useCommandHistory()
    toggleHistoryPalette()
    return
  }

  if (isShortcut(e, 'searchBuffer')) {
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null
    const isDirectlyInTerminal = Boolean(activeEl?.closest('.xterm') || activeEl?.closest('#terminal-grid-container'))
    const isDirectlyInEditor = Boolean(
      activeEl?.closest('.monaco-editor') ||
      activeEl?.closest('.monaco-diff-editor') ||
      activeEl?.closest('#code-editor-pane')
    )
    const isEditorActive = isDirectlyInEditor || (!isDirectlyInTerminal && lastFocusedPane.value === 'editor')

    if (isEditorActive && isEditorVisible.value && openFiles.value.length > 0) {
      // Biarkan Monaco Editor menangani Ctrl+F untuk mencari di file aktif
      return
    }

    e.preventDefault()
    if (activeTerminalId.value && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`terminal-action-${activeTerminalId.value}`, { detail: 'search' }))
    }
    return
  }

  if (isShortcut(e, 'closeTab')) {
    e.preventDefault()
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null
    const isDirectlyInTerminal = Boolean(activeEl?.closest('.xterm') || activeEl?.closest('#terminal-grid-container'))
    const isDirectlyInEditor = Boolean(
      activeEl?.closest('.monaco-editor') ||
      activeEl?.closest('.monaco-diff-editor') ||
      activeEl?.closest('#code-editor-pane')
    )

    // Tab editor cuma div dengan @click, tidak focusable — jadi activeElement
    // tetap body saat tab diklik dan deteksi ancestor jadi gagal. lastFocusedPane
    // sudah dicatat lewat @focusin, pakai itu sebagai fallback.
    const isEditorActive = isDirectlyInEditor || (!isDirectlyInTerminal && lastFocusedPane.value === 'editor')

    if (isEditorActive && isEditorVisible.value && activeFileId.value) {
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

  if (isShortcut(e, 'reopenClosedTerminal')) {
    e.preventDefault()
    reopenClosedTerminal()
    return
  }

  if (isShortcut(e, 'toggleBroadcastInput')) {
    e.preventDefault()
    toggleBroadcastInput()
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

  if (isShortcut(e, 'aiPanel')) {
    e.preventDefault()
    isAiPanelOpen.value = true
    return
  }

  // Sidebar punya shortcut sendiri di luar blok ctrl+shift, jadi cukup
  // cegah agar tidak ikut memicu aksi lain.
  if (isShortcut(e, 'toggleSidebar')) {
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

// Folder project bisa diganti kapan saja; env & config ikut dimuat ulang
// supaya terminal berikutnya langsung memakai nilai yang benar.
watch(
  () => activeWorkstation.value?.folderPath,
  async (folder) => {
    if (!folder || settings.value.useProjectConfig === false) return
    await loadConfig(folder)
    if (envEntriesAreEmpty()) {
      await loadEnvFile(folder)
    }
  }
)

onMounted(async () => {
  let isBlank = false
  if (isTauri.value) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      isBlank = await invoke<boolean>('is_blank_startup')
    } catch (e) {
      console.warn('Check blank startup failed:', e)
    }
  }

  try {
    if (!isBlank) {
      initFromStorage()
      initEditorSession()
    }
  } catch (err) {
    logError('startup', `Gagal memulihkan sesi: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    // Sesi selesai dipulihkan (atau sengaja dikosongkan) — izinkan terminal spawn PTY.
    // Tanpa flag ini PTY bisa spawn duluan dengan state default (tanpa folder project)
    // sehingga Rust fallback ke cwd proses aplikasi (home user).
    sessionReady.value = true
  }

  // Env & config project ikut dimuat sebelum PTY pertama spawn.
  const bootFolder = activeWorkstation.value?.folderPath
  if (!isBlank && bootFolder && settings.value.useProjectConfig !== false) {
    await loadConfig(bootFolder)
    if (envEntriesAreEmpty()) {
      await loadEnvFile(bootFolder)
    }
  }

  // Onboarding hanya sekali per instalasi.
  if (!isBlank && settings.value.firstRunDone !== true) {
    isOnboardingOpen.value = true
  }

  // Apply startup presets after session init (if configured in Settings and not blank)
  const startupIds = settings.value.startupPresetIds || []
  if (!isBlank && startupIds.length > 0) {
    const preset = presets.value.filter(p => startupIds.includes(p.id))
    const firstPreset = preset[0]
    if (firstPreset) {
      applyPreset({
        ...firstPreset,
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

  // Poll listening ports in background for footer status
  startPortPolling(5000)
  startGitPolling(3000)

  window.addEventListener('beforeunload', () => {
    saveSession(false)
    saveEditorSession()
    persistWindowState()
    stopPortPolling()
    stopGitPolling()
  })
  window.addEventListener('error', handleGlobalError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
})

onBeforeUnmount(() => {
  saveSession(false)
  saveEditorSession()
  if (windowStateTimer) clearTimeout(windowStateTimer)
  unlistenResize?.()
  unlistenMove?.()
  stopPortPolling()
  stopGitPolling()
  window.removeEventListener('keydown', handleKeydown, true)
  window.removeEventListener('error', handleGlobalError)
  window.removeEventListener('unhandledrejection', handleUnhandledRejection)
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
      @open-ports="isPortManagerModalOpen = true"
    />

    <!-- Main Workspace Viewport: Sidebar Workstation Kiri + Editor / Terminal Viewport Kanan -->
    <main class="flex-1 w-full h-[calc(100vh-2.5rem-1.5rem)] overflow-hidden flex relative">
      <WorkstationSidebar
        @open-presets="isPresetModalOpen = true"
        @open-palette="isCommandPaletteOpen = true"
        @open-settings="handleOpenSettingsTab"
        @open-git-actions="isGitActionsModalOpen = true"
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
    <footer
      class="h-6 w-full bg-[#0a0b0f] border-t border-border/60 px-3 flex items-center justify-between text-[11px] font-mono select-none z-30 flex-shrink-0 text-muted-foreground"
      data-tauri-drag-region
    >
      <!-- Left: Git Branch, Folder Path, Workspace Name -->
      <div class="flex items-center gap-3 truncate max-w-[60%]">
        <!-- Git Branch Badge / Selector with Ahead/Behind indicator -->
        <UiTooltip v-if="gitBranch" :text="aheadBehind?.has_upstream ? `Git Branch: ${gitBranch} (vs ${aheadBehind.upstream}: ${aheadBehind.ahead} ahead, ${aheadBehind.behind} behind). Klik untuk beralih/buat branch.` : `Git Branch: ${gitBranch} (Klik untuk beralih atau buat branch)`" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-[#1c1d2b] text-primary hover:text-primary/90 transition-colors cursor-pointer font-medium"
            @click="openFooterBranchPicker"
          >
            <GitBranch class="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span>{{ gitBranch }}</span>
            <span v-if="aheadBehind?.has_upstream && (aheadBehind.ahead > 0 || aheadBehind.behind > 0)" class="flex items-center gap-1 font-mono text-[10px] ml-0.5">
              <span v-if="aheadBehind.ahead > 0" class="text-emerald-400 font-semibold">↑{{ aheadBehind.ahead }}</span>
              <span v-if="aheadBehind.behind > 0" class="text-amber-400 font-semibold">↓{{ aheadBehind.behind }}</span>
            </span>
          </button>
        </UiTooltip>

        <!-- Pull Button / Indicator if behind > 0 -->
        <UiTooltip v-if="gitBranch && aheadBehind?.has_upstream && aheadBehind.behind > 0" :text="`Tarik ${aheadBehind.behind} commit dari ${aheadBehind.upstream} (Git Pull)`" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors cursor-pointer font-medium text-[10px]"
            :disabled="isPullingFooter"
            @click="handleFooterPull"
          >
            <RefreshCw v-if="isPullingFooter" class="w-3 h-3 text-amber-400 animate-spin" />
            <ArrowDown v-else class="w-3 h-3 text-amber-400 animate-bounce" />
            <span>Pull {{ aheadBehind.behind }}</span>
          </button>
        </UiTooltip>

        <!-- Push Button / Indicator if ahead > 0 -->
        <UiTooltip v-if="gitBranch && aheadBehind?.has_upstream && aheadBehind.ahead > 0" :text="`Kirim ${aheadBehind.ahead} commit ke ${aheadBehind.upstream} (Git Push)`" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors cursor-pointer font-medium text-[10px]"
            :disabled="isPushingFooter"
            @click="handleFooterPush"
          >
            <RefreshCw v-if="isPushingFooter" class="w-3 h-3 text-emerald-400 animate-spin" />
            <ArrowUp v-else class="w-3 h-3 text-emerald-400" />
            <span>Push {{ aheadBehind.ahead }}</span>
          </button>
        </UiTooltip>

        <!-- Quick Fetch / Sync Button -->
        <UiTooltip v-if="gitBranch" text="Fetch status dari remote (Git Fetch)" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#1c1d2b] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            :disabled="isFetchingFooter"
            @click="handleFooterFetch"
          >
            <RefreshCw :class="['w-3 h-3', isFetchingFooter ? 'animate-spin text-primary' : '']" />
          </button>
        </UiTooltip>

        <!-- Changes Badge Button (Open Git Sidebar Tab) -->
        <UiTooltip v-if="gitBranch && gitChangesCount > 0" :text="`${gitChangesCount} berkas berubah (${gitOverview.staged.length} staged, ${gitOverview.unstaged.length} unstaged, ${gitOverview.untracked.length} untracked). Klik untuk buka panel Git.`" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500/25 transition-colors cursor-pointer text-[10px] font-medium"
            @click="openGitSidebarTab"
          >
            <FileEdit class="w-3 h-3 text-sky-400" />
            <span>{{ gitChangesCount }} Perubahan</span>
          </button>
        </UiTooltip>

        <!-- Git Graph Visual Button -->
        <UiTooltip v-if="gitBranch" text="Buka Visual Git Commit Graph" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#1c1d2b] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            @click="isGitGraphModalOpen = true"
          >
            <span class="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.2 rounded font-mono font-medium">Graph</span>
          </button>
        </UiTooltip>

        <!-- Branch Compare Button -->
        <UiTooltip v-if="gitBranch" text="Buka Branch Compare & Diff" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#1c1d2b] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            @click="isBranchCompareModalOpen = true"
          >
            <span class="text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-1 py-0.2 rounded font-mono font-medium">Compare</span>
          </button>
        </UiTooltip>

        <!-- CI/CD Pipelines Button (GitHub & GitLab) -->
        <UiTooltip v-if="gitBranch" :text="`Buka CI/CD Pipelines (GitHub & GitLab)${actionsRunningCount > 0 ? ` (${actionsRunningCount} sedang berjalan)` : ''}`" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors cursor-pointer"
            :class="actionsRunningCount > 0 ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'hover:bg-[#1c1d2b] text-muted-foreground hover:text-foreground'"
            @click="isGitActionsModalOpen = true"
          >
            <span v-if="actionsRunningCount > 0" class="relative flex h-2 w-2 shrink-0">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
            </span>
            <span class="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-1 py-0.2 rounded font-mono font-medium">CI/CD</span>
            <span v-if="actionsRunningCount > 0" class="text-[10px] font-semibold text-sky-400">{{ actionsRunningCount }} live</span>
          </button>
        </UiTooltip>

        <UiTooltip v-if="activeWorkstation.folderPath" :text="activeWorkstation.folderPath" side="top" class="flex-shrink-0 min-w-0">
          <div class="flex items-center gap-1.5 text-muted-foreground truncate">
            <FolderOpen class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span class="truncate">{{ activeWorkstation.name }}</span>
          </div>
        </UiTooltip>

        <!-- If active file exists in editor -->
        <UiTooltip v-if="activeFile && isEditorVisible" :text="activeFile.path" side="top" class="flex-shrink-0 truncate hidden sm:inline-flex">
          <span class="truncate text-muted-foreground/70">
            • {{ activeFile.name }}
          </span>
        </UiTooltip>
      </div>

      <!-- Right: Sessions & Layout info -->
      <div class="flex items-center gap-3.5 flex-shrink-0">
        <!-- Listening Ports Indicator -->
        <UiTooltip v-if="activePortsList.length > 0" :text="`Ada ${activePortsList.length} port listening aktif (${activePortsList.slice(0, 3).map(p => p.port).join(', ')}...). Klik untuk kelola proses.`" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors cursor-pointer"
            @click="isPortManagerModalOpen = true"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span class="text-[10px] font-mono font-semibold">{{ activePortsList.length }} Ports</span>
          </button>
        </UiTooltip>

        <!-- Update Available Badge -->
        <UiTooltip v-if="hasUpdate" :text="`Versi baru v${newVersion} tersedia. Buka Pengaturan untuk memperbarui.`" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-colors animate-pulse"
            @click="isUpdateModalOpen = true"
          >
            <Sparkles class="w-3 h-3 text-blue-400" />
            <span class="text-[10px] font-semibold">Update v{{ newVersion }}</span>
          </button>
        </UiTooltip>

        <!-- Split Orientation Toggle Button -->
        <UiTooltip v-if="isEditorVisible" :text="splitOrientation === 'horizontal' ? 'Posisi: Kiri/Kanan (Klik untuk ubah ke Atas/Bawah)' : 'Posisi: Atas/Bawah (Klik untuk ubah ke Kiri/Kanan)'" side="top" class="flex-shrink-0">
          <button
            class="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#1c1d2b] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            @click="splitOrientation = splitOrientation === 'horizontal' ? 'vertical' : 'horizontal'"
          >
            <Rows2 v-if="splitOrientation === 'vertical'" class="w-3.5 h-3.5 text-primary" />
            <Columns2 v-else class="w-3.5 h-3.5 text-primary" />
            <span class="text-[10px] hidden sm:inline">{{ splitOrientation === 'horizontal' ? 'Horizontal' : 'Vertikal' }}</span>
          </button>
        </UiTooltip>

        <!-- Terminal Count -->
        <span class="text-muted-foreground/60 hidden md:inline">
          {{ terminals.length }} Terminal
        </span>

        <!-- App Version Badge -->
        <UiTooltip text="Klik untuk membuka Pengaturan Pembaruan" side="top" class="flex-shrink-0">
          <span
            class="text-muted-foreground/80 hover:text-foreground cursor-pointer transition-colors"
            @click="isSettingsModalOpen = true"
          >
            v{{ currentAppVersion }}
          </span>
        </UiTooltip>

        <!-- Layout Indicator -->
        <span class="text-primary/90 uppercase font-semibold text-[10px]">
          {{ currentLayout }}
        </span>

        <template v-if="isEditorVisible && activeFile">
          <UiTooltip
            v-if="activeLineBlame"
            :text="`${activeLineBlame.commit}: ${activeLineBlame.summary} (${activeLineBlame.author}, ${activeLineBlame.date})`"
            side="top"
            class="contents"
          >
            <span class="hover:text-foreground text-muted-foreground/60 transition-colors hidden lg:inline-flex items-center gap-1 truncate max-w-[220px] cursor-default font-sans text-[10px]">
              <GitCommit class="w-3 h-3 text-primary/70 flex-shrink-0" />
              <span class="truncate">{{ activeLineBlame.author }}, {{ activeLineBlame.date }}</span>
            </span>
          </UiTooltip>
          <span class="hover:text-foreground transition-colors hidden sm:inline">
            Ln {{ editorCursorPos.line }}, Col {{ editorCursorPos.column }}
          </span>
          <UiTooltip text="Klik untuk ubah ukuran tab (2 atau 4 spasi)" side="top" class="contents">
            <button
              class="hover:text-foreground transition-colors hidden md:inline cursor-pointer"
              @click="updateSettings({ editorTabSize: (settings.editorTabSize === 4 ? 2 : 4) })"
            >
              Spaces: {{ settings.editorTabSize || 2 }}
            </button>
          </UiTooltip>
        </template>

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
    <ShortcutsCheatsheetModal
      v-model:open="isShortcutsOpen"
      @open-keybindings="openSettingsToKeybindings"
    />
    <CommandPalette
      @open-presets="isPresetModalOpen = true"
      @open-settings="isSettingsModalOpen = true"
      @open-git-actions="isGitActionsModalOpen = true"
    />
    <CommandHistoryPalette />
    <PresetModal v-model:open="isPresetModalOpen" />
    <SettingsModal v-model:open="isSettingsModalOpen" :initial-tab="settingsInitialTab" />
    <UpdateNotificationModal v-model:open="isUpdateModalOpen" />
    <GitBranchModal v-model:open="isBranchModalOpen" />
    <GitGraphModal v-model:open="isGitGraphModalOpen" />
    <BranchCompareModal v-model:open="isBranchCompareModalOpen" />
    <GitActionsModal
      v-model:open="isGitActionsModalOpen"
      @open-settings="handleOpenSettingsTab"
    />
    <PortManagerModal v-model:open="isPortManagerModalOpen" />
    <AiPanelModal v-model:open="isAiPanelOpen" />
    <OnboardingModal v-model:open="isOnboardingOpen" />
  </div>
</template>

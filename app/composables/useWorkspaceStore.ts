import type { TerminalTab, WorkspacePreset, LayoutType, TerminalSettings } from '~/types/terminal'

const STORAGE_KEY = 'mytermin_session_v4'
const CUSTOM_PRESETS_KEY = 'mytermin_custom_presets_v1'

const defaultBuiltInPresets: WorkspacePreset[] = [
  {
    id: 'ai-quad',
    name: 'OpenCode + Codex 4-Grid',
    description: '4 Terminal: OpenCode, Codex, Dev Server, & Git Watcher',
    layout: 'grid-2x2',
    icon: 'sparkles',
    isCustom: false,
    terminals: [
      { title: 'OpenCode Assistant', command: 'opencode\r' },
      { title: 'Codex AI CLI', command: 'codex\r' },
      { title: 'Dev Server', command: 'npm run dev\r' },
      { title: 'Git & Shell', command: 'git status\r' }
    ]
  },
  {
    id: 'dual-ai',
    name: 'OpenCode + Terminal (Side-by-Side)',
    description: '2 Terminal vertikal untuk coding & eksekusi cepat',
    layout: 'split-h',
    icon: 'bot',
    isCustom: false,
    terminals: [
      { title: 'OpenCode', command: 'opencode\r' },
      { title: 'CLI Console' }
    ]
  },
  {
    id: 'fullstack-grid',
    name: 'Fullstack 4-Grid Workspace',
    description: 'Frontend, Backend API, Database, & CLI Console',
    layout: 'grid-2x2',
    icon: 'layout-grid',
    isCustom: false,
    terminals: [
      { title: 'Frontend Server', command: 'npm run dev\r' },
      { title: 'Backend API', command: 'cargo run\r' },
      { title: 'Database / Docker' },
      { title: 'CLI Console' }
    ]
  }
]

export const useWorkspaceStore = () => {
  const terminals = useState<TerminalTab[]>('workspace-terminals', () => [
    { id: 'term-1', title: 'Terminal 1' }
  ])

  const activeTerminalId = useState<string>('active-terminal-id', () => 'term-1')
  const currentLayout = useState<LayoutType>('current-layout', () => 'grid-2x2')
  const customPresets = useState<WorkspacePreset[]>('workspace-custom-presets', () => [])
  const hiddenBuiltinPresets = useState<string[]>('workspace-hidden-builtin-presets', () => [])
  const saveNotification = useState<string | null>('save-notification', () => null)
  const { settings, initSettings } = useSettingsStore()

  const allPresets = computed<WorkspacePreset[]>(() => {
    const builtins = defaultBuiltInPresets.filter(p => !hiddenBuiltinPresets.value.includes(p.id))
    return [...customPresets.value, ...builtins]
  })

  const activeTerminal = computed(() => {
    return terminals.value.find(t => t.id === activeTerminalId.value) || terminals.value[0]
  })

  // Save session
  const saveSession = (showNotification = false) => {
    if (typeof window === 'undefined') return
    try {
      const data = {
        terminals: terminals.value,
        activeTerminalId: activeTerminalId.value,
        currentLayout: currentLayout.value,
        savedAt: new Date().toISOString()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      if (showNotification) {
        saveNotification.value = 'Sesi terminal berhasil disimpan!'
        setTimeout(() => {
          saveNotification.value = null
        }, 2500)
      }
    } catch (e) {
      console.error('Failed to save session:', e)
      if (showNotification) {
        saveNotification.value = 'Gagal menyimpan sesi.'
      }
    }
  }

  // Load custom presets
  const loadCustomPresets = () => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(CUSTOM_PRESETS_KEY)
      if (raw) {
        customPresets.value = JSON.parse(raw)
      }
      const hiddenRaw = localStorage.getItem('mytermin_hidden_builtin_presets_v1')
      if (hiddenRaw) {
        hiddenBuiltinPresets.value = JSON.parse(hiddenRaw)
      }
    } catch (e) {
      console.error('Failed to load custom presets:', e)
    }
  }

  // Save current workspace state as custom preset.
  // If customTerminals provided (non-empty), use those instead of the live workspace.
    const saveCurrentAsPreset = (
      name: string,
      description: string,
      icon = 'sparkles',
      customTerminals?: { title: string; command?: string; shell?: string; cwd?: string }[]
    ): WorkspacePreset => {
      const sourceTerminals = customTerminals && customTerminals.length > 0
        ? customTerminals
        : terminals.value.map(t => ({
            title: t.title,
            command: t.initialCommand,
            shell: t.shell,
            cwd: t.cwd
          }))
     const newPreset: WorkspacePreset = {
       id: `custom-preset-${Date.now()}`,
       name: name.trim() || `Workspace Preset (${currentLayout.value})`,
       description: description.trim() || `${sourceTerminals.length} Terminal - Layout ${currentLayout.value}`,
       layout: currentLayout.value,
       icon,
       isCustom: true,
       terminals: sourceTerminals
     }

    customPresets.value = [newPreset, ...customPresets.value]
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets.value))
      } catch (e) {
        console.error('Failed to save custom preset:', e)
      }
    }

    saveNotification.value = `Preset "${newPreset.name}" berhasil dibuat!`
    setTimeout(() => {
      saveNotification.value = null
    }, 2500)

    return newPreset
  }

  // Update existing preset (custom or override built-in)
  const updatePreset = (updated: WorkspacePreset) => {
    const isBuiltin = defaultBuiltInPresets.some(p => p.id === updated.id)
    if (isBuiltin) {
      // Hide built-in, save as custom preset with same details
      if (!hiddenBuiltinPresets.value.includes(updated.id)) {
        hiddenBuiltinPresets.value = [...hiddenBuiltinPresets.value, updated.id]
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('mytermin_hidden_builtin_presets_v1', JSON.stringify(hiddenBuiltinPresets.value))
          } catch (e) {
            console.error('Failed to hide builtin preset:', e)
          }
        }
      }
      // Add as custom preset
      const newCustom: WorkspacePreset = {
        ...updated,
        id: `custom-preset-${Date.now()}`,
        isCustom: true
      }
      customPresets.value = [newCustom, ...customPresets.value]
    } else {
      // Update existing custom preset in place
      const idx = customPresets.value.findIndex(p => p.id === updated.id)
      if (idx !== -1) {
        customPresets.value[idx] = { ...updated, isCustom: true }
        customPresets.value = [...customPresets.value]
      }
    }

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets.value))
      } catch (e) {
        console.error('Failed to save updated presets:', e)
      }
    }

    saveNotification.value = `Preset "${updated.name}" berhasil diperbarui!`
    setTimeout(() => {
      saveNotification.value = null
    }, 2500)
  }

  // Delete custom preset
  const deleteCustomPreset = (presetId: string) => {
    customPresets.value = customPresets.value.filter(p => p.id !== presetId)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(customPresets.value))
      } catch (e) {
        console.error('Failed to delete custom preset:', e)
      }
    }
  }

  // Delete preset: custom dihapus permanen, built-in disembunyikan (hidden list persisted)
  const deletePreset = (presetId: string) => {
    const isBuiltin = defaultBuiltInPresets.some(p => p.id === presetId)
    if (isBuiltin) {
      if (!hiddenBuiltinPresets.value.includes(presetId)) {
        hiddenBuiltinPresets.value = [...hiddenBuiltinPresets.value, presetId]
      }
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('mytermin_hidden_builtin_presets_v1', JSON.stringify(hiddenBuiltinPresets.value))
        } catch (e) {
          console.error('Failed to save hidden presets:', e)
        }
      }
    } else {
      deleteCustomPreset(presetId)
    }
  }

  // Load session from storage on startup
  const initFromStorage = () => {
    if (typeof window === 'undefined') return
    initSettings()
    loadCustomPresets()
    try {
      if (!settings.value.autoRestoreSession) {
        return // User disabled auto-restore
      }
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.terminals)) {
          terminals.value = parsed.terminals
          activeTerminalId.value = parsed.activeTerminalId || (parsed.terminals[0]?.id ?? '')
          currentLayout.value = parsed.currentLayout || 'grid-2x2'
        }
      }
    } catch (e) {
      console.error('Failed to load session:', e)
    }
  }

  const clearSavedSession = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
      saveNotification.value = 'Sesi tersimpan telah dibersihkan.'
      setTimeout(() => {
        saveNotification.value = null
      }, 2500)
    }
  }

  // Cyclic navigation: Ctrl+Tab
  const nextTab = () => {
    if (terminals.value.length === 0) return
    const idx = terminals.value.findIndex(t => t.id === activeTerminalId.value)
    const nextIdx = (idx + 1) % terminals.value.length
    activeTerminalId.value = terminals.value[nextIdx].id
  }

  // Cyclic navigation: Ctrl+Shift+Tab
  const prevTab = () => {
    if (terminals.value.length === 0) return
    const idx = terminals.value.findIndex(t => t.id === activeTerminalId.value)
    const prevIdx = (idx - 1 + terminals.value.length) % terminals.value.length
    activeTerminalId.value = terminals.value[prevIdx].id
  }

  const addTerminal = (presetTerminal?: { title: string; command?: string; shell?: string; cwd?: string }) => {
    const termNum = terminals.value.length + 1
    const newId = `term-${Date.now()}`
    terminals.value.push({
      id: newId,
      title: presetTerminal?.title || `Terminal ${termNum}`,
      initialCommand: presetTerminal?.command,
      shell: presetTerminal?.shell,
      cwd: presetTerminal?.cwd
    })
    activeTerminalId.value = newId
    saveSession(false)
  }

  // Duplikat Tab Terminal
  const duplicateTerminal = (targetTermId?: string) => {
    const sourceId = targetTermId || activeTerminalId.value
    const sourceTerm = terminals.value.find(t => t.id === sourceId)
    if (!sourceTerm) return

    const newId = `term-${Date.now()}`
    const copyTitle = `${sourceTerm.title} (Copy)`
    
    // Sisipkan tepat di samping tab yang diduplikasi
    const sourceIdx = terminals.value.findIndex(t => t.id === sourceId)
    const newTerm: TerminalTab = {
      id: newId,
      title: copyTitle,
      shell: sourceTerm.shell,
      cwd: sourceTerm.cwd,
      initialCommand: sourceTerm.initialCommand
    }

    if (sourceIdx !== -1) {
      terminals.value.splice(sourceIdx + 1, 0, newTerm)
    } else {
      terminals.value.push(newTerm)
    }

    activeTerminalId.value = newId
    saveSession(false)
  }

  // Hapus terminal (bisa sampai 0/kosong)
  const removeTerminal = (termId: string) => {
    const idx = terminals.value.findIndex(t => t.id === termId)
    if (idx !== -1) {
      terminals.value.splice(idx, 1)
      if (terminals.value.length === 0) {
        activeTerminalId.value = ''
      } else if (activeTerminalId.value === termId) {
        activeTerminalId.value = terminals.value[Math.max(0, idx - 1)].id
      }
      saveSession(false)
    }
  }

  const moveTerminalTab = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0 ||
      fromIndex >= terminals.value.length ||
      toIndex < 0 ||
      toIndex >= terminals.value.length ||
      fromIndex === toIndex
    ) {
      return
    }
    const [movedTab] = terminals.value.splice(fromIndex, 1)
    terminals.value.splice(toIndex, 0, movedTab)
    saveSession(false)
  }

  const renameTerminal = (termId: string, newTitle: string) => {
    const term = terminals.value.find(t => t.id === termId)
    if (term && newTitle.trim()) {
      term.title = newTitle.trim()
      saveSession(false)
    }
  }

  const updateTerminalCwd = (termId: string, cwd: string) => {
    const term = terminals.value.find(t => t.id === termId)
    if (term && cwd && cwd !== term.cwd) {
      term.cwd = cwd
      saveSession(false)
    }
  }

  const updateTerminalLastCommand = (termId: string, cmd: string) => {
    const term = terminals.value.find(t => t.id === termId)
    const cleanCmd = cmd.trim()
    if (term && cleanCmd && cleanCmd !== 'clear' && cleanCmd !== 'cls' && cleanCmd !== 'exit') {
      if (term.lastCommand !== cleanCmd) {
        term.lastCommand = cleanCmd
        saveSession(false)
      }
    }
  }

  const setLayout = (layout: LayoutType) => {
    currentLayout.value = layout
    saveSession(false)
  }

  const applyPreset = (preset: WorkspacePreset) => {
    currentLayout.value = preset.layout
    terminals.value = preset.terminals.map((t, idx) => ({
      id: `term-${Date.now()}-${idx + 1}`,
      title: t.title,
      initialCommand: t.command,
      shell: t.shell,
      cwd: t.cwd
    }))
    activeTerminalId.value = terminals.value[0]?.id || ''
    saveSession(false)
  }

  // Apply startup presets if configured in settings (multiple supported)
  const applyStartupPreset = (settings: TerminalSettings) => {
    const ids = settings.startupPresetIds || []
    if (ids.length === 0) return
    const all = [...customPresets.value, ...defaultBuiltInPresets]
    const selected = all.filter(p => ids.includes(p.id))
    if (selected.length === 0) return
    // Merge terminals from all selected presets, layout from the first
    const first = selected[0]
    const merged: WorkspacePreset = {
      ...first,
      id: `startup-${Date.now()}`,
      layout: first.layout,
      terminals: selected.flatMap(p => p.terminals.map(t => ({
        title: t.title,
        command: t.command,
        shell: t.shell,
        cwd: t.cwd
      })))
    }
    applyPreset(merged)
  }

  return {
    terminals,
    activeTerminalId,
    activeTerminal,
    currentLayout,
    presets: allPresets,
    customPresets,
    saveNotification,
    initFromStorage,
    saveSession,
    clearSavedSession,
    saveCurrentAsPreset,
    updatePreset,
    deleteCustomPreset,
    deletePreset,
    nextTab,
    prevTab,
    addTerminal,
    duplicateTerminal,
    removeTerminal,
    moveTerminalTab,
    renameTerminal,
    updateTerminalCwd,
    updateTerminalLastCommand,
    setLayout,
    applyPreset,
    applyStartupPreset
  }
}

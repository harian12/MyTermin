import type { TerminalTab, WorkspacePreset, LayoutType, TerminalSettings, Workstation, PresetWorkstationConfig } from '~/types/terminal'

const STORAGE_KEY = 'mytermin_session_v5'
const CUSTOM_PRESETS_KEY = 'mytermin_custom_presets_v1'

const generateUid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const defaultBuiltInPresets: WorkspacePreset[] = []

const createDefaultWorkstation = (id = 'ws-1', name = 'Workstation 1'): Workstation => ({
  id,
  name,
  layout: 'grid-2x2',
  activeTerminalId: 'term-1',
  terminals: [{ id: 'term-1', title: 'Terminal 1' }]
})

export const useWorkspaceStore = () => {
  const workstations = useState<Workstation[]>('workspace-workstations', () => [
    createDefaultWorkstation()
  ])
  const activeWorkstationId = useState<string>('active-workstation-id', () => 'ws-1')
  const isSidebarOpen = useState<boolean>('workspace-sidebar-open', () => true)

  const backgroundAlerts = useState<Record<string, 'running' | 'completed'>>('workspace-alerts', () => ({}))
  const customPresets = useState<WorkspacePreset[]>('workspace-custom-presets', () => [])
  const hiddenBuiltinPresets = useState<string[]>('workspace-hidden-builtin-presets', () => [])
  const saveNotification = useState<string | null>('save-notification', () => null)
  const { settings, initSettings } = useSettingsStore()

  // Computed Active Workstation
  const activeWorkstation = computed<Workstation>(() => {
    return workstations.value.find(w => w.id === activeWorkstationId.value) || workstations.value[0] || createDefaultWorkstation()
  })

  // Proxy getters & setters for active workstation
  const terminals = computed<TerminalTab[]>({
    get: () => activeWorkstation.value.terminals,
    set: (val) => {
      const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
      if (ws) {
        ws.terminals = val
      }
    }
  })

  const activeTerminalId = computed<string>({
    get: () => activeWorkstation.value.activeTerminalId,
    set: (val) => {
      const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
      if (ws) {
        ws.activeTerminalId = val
      }
    }
  })

  const currentLayout = computed<LayoutType>({
    get: () => activeWorkstation.value.layout,
    set: (val) => {
      const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
      if (ws) {
        ws.layout = val
      }
    }
  })

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
        workstations: workstations.value,
        activeWorkstationId: activeWorkstationId.value,
        isSidebarOpen: isSidebarOpen.value,
        savedAt: new Date().toISOString()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      if (showNotification) {
        saveNotification.value = 'Sesi workstation berhasil disimpan!'
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

  // Workstation management
  const addWorkstation = (name?: string, layout: LayoutType = 'grid-2x2', initialTerminals?: TerminalTab[]) => {
    const num = workstations.value.length + 1
    const newWsId = generateUid('ws')
    const termList = initialTerminals && initialTerminals.length > 0
      ? initialTerminals.map((t, idx) => ({
          ...t,
          id: t.id ? t.id : generateUid(`term-${idx + 1}`)
        }))
      : []

    const newWs: Workstation = {
      id: newWsId,
      name: name?.trim() || `Workstation ${num}`,
      layout,
      activeTerminalId: termList[0]?.id || '',
      terminals: termList
    }

    workstations.value.push(newWs)
    activeWorkstationId.value = newWsId
    saveSession(false)
    return newWs
  }

  const switchWorkstation = (wsId: string) => {
    if (workstations.value.some(w => w.id === wsId)) {
      activeWorkstationId.value = wsId
      saveSession(false)
    }
  }

  const renameWorkstation = (wsId: string, newName: string) => {
    const ws = workstations.value.find(w => w.id === wsId)
    if (ws && newName.trim()) {
      ws.name = newName.trim()
      saveSession(false)
    }
  }

  const removeWorkstation = async (wsId: string) => {
    const idx = workstations.value.findIndex(w => w.id === wsId)
    if (idx === -1) return

    // Konfirmasi bila ada proses terminal yang masih berjalan di workstation ini
    const targetWs = workstations.value[idx]
    if (!targetWs) return
    const wsTerminals = targetWs.terminals
    const hasRunning = wsTerminals.some(t => backgroundAlerts.value[t.id] === 'running')
    if (hasRunning) {
      const { showAppConfirm } = useAppDialog()
      const ok = await showAppConfirm(
        `Workstation "${targetWs.name}" masih memiliki proses terminal yang berjalan. Tutup tetap?`,
        'Konfirmasi Tutup Workstation',
        'warning',
        'Tutup'
      )
      if (!ok) return
    }

    // Matikan seluruh proses PTY di workstation ini agar port (bun/node/vite) langsung lepas
    const { killPty } = useTauriPty()
    for (const t of wsTerminals) {
      killPty(t.id).catch(() => {})
    }

    workstations.value.splice(idx, 1)
    if (workstations.value.length === 0) {
      const fresh = createDefaultWorkstation()
      workstations.value = [fresh]
      activeWorkstationId.value = fresh.id
    } else if (activeWorkstationId.value === wsId) {
      activeWorkstationId.value = workstations.value[Math.max(0, idx - 1)]?.id ?? activeWorkstationId.value
    }
    saveSession(false)
  }

  const moveWorkstationTab = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex < 0 ||
      fromIndex >= workstations.value.length ||
      toIndex < 0 ||
      toIndex >= workstations.value.length ||
      fromIndex === toIndex
    ) {
      return
    }
    const [moved] = workstations.value.splice(fromIndex, 1)
    if (!moved) return
    workstations.value.splice(toIndex, 0, moved)
    saveSession(false)
  }

  const nextWorkstation = () => {
    if (workstations.value.length <= 1) return
    const curIdx = workstations.value.findIndex((w) => w.id === activeWorkstationId.value)
    const nextIdx = (curIdx + 1) % workstations.value.length
    const nextWs = workstations.value[nextIdx]
    if (!nextWs) return
    activeWorkstationId.value = nextWs.id
    saveSession(false)
  }

  const prevWorkstation = () => {
    if (workstations.value.length <= 1) return
    const curIdx = workstations.value.findIndex((w) => w.id === activeWorkstationId.value)
    const prevIdx = (curIdx - 1 + workstations.value.length) % workstations.value.length
    const prevWs = workstations.value[prevIdx]
    if (!prevWs) return
    activeWorkstationId.value = prevWs.id
    saveSession(false)
  }

  const toggleSidebar = () => {
    isSidebarOpen.value = !isSidebarOpen.value
    saveSession(false)
  }

  // Save custom preset with one or more dynamic workstation cards
  const saveCustomPreset = (
    name: string,
    description: string,
    icon = 'sparkles',
    workstationsList: {
      name: string
      folderPath?: string
      layout: LayoutType
      terminals: { title: string; command?: string; shell?: string; cwd?: string }[]
    }[]
  ): WorkspacePreset => {
    const wsConfigs: PresetWorkstationConfig[] = workstationsList.map((w, idx) => ({
      id: `preset-ws-${Date.now()}-${idx + 1}`,
      name: w.name.trim() || `Workstation ${idx + 1}`,
      folderPath: w.folderPath,
      layout: w.layout || 'grid-2x2',
      terminals: w.terminals.map((t, tIdx) => ({
        title: t.title.trim() || `Terminal ${tIdx + 1}`,
        command: t.command?.trim(),
        shell: t.shell,
        cwd: t.cwd || w.folderPath
      }))
    }))

    const firstWs = wsConfigs[0]
    const totalTerms = wsConfigs.reduce((acc, w) => acc + w.terminals.length, 0)
    const newPreset: WorkspacePreset = {
      id: `custom-preset-${Date.now()}`,
      name: name.trim() || (wsConfigs.length > 1 ? `Workspace (${wsConfigs.length} Workstation)` : `${firstWs?.name || 'Workstation'} Preset`),
      description: description.trim() || `${wsConfigs.length} Workstation, total ${totalTerms} Terminal`,
      layout: firstWs?.layout || 'grid-2x2',
      icon,
      folderPath: firstWs?.folderPath,
      isCustom: true,
      workstations: wsConfigs,
      terminals: firstWs?.terminals || []
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

  const updatePreset = (updated: WorkspacePreset) => {
    const isBuiltin = defaultBuiltInPresets.some(p => p.id === updated.id)
    if (isBuiltin) {
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
      const newCustom: WorkspacePreset = {
        ...updated,
        id: `custom-preset-${Date.now()}`,
        isCustom: true
      }
      customPresets.value = [newCustom, ...customPresets.value]
    } else {
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
        return
      }

      // Check new storage first
      const rawV5 = localStorage.getItem(STORAGE_KEY)
      if (rawV5) {
        const parsed = JSON.parse(rawV5)
        if (Array.isArray(parsed.workstations) && parsed.workstations.length > 0) {
          // Self-healing: Deduplicate workstation IDs if they were duplicated
          const seenWsIds = new Set<string>()
          parsed.workstations.forEach((ws: Workstation, i: number) => {
            if (!ws.id || seenWsIds.has(ws.id)) {
              ws.id = generateUid(`ws-${i + 1}`)
            }
            seenWsIds.add(ws.id)

            // Deduplicate terminal IDs
            const seenTermIds = new Set<string>()
            if (Array.isArray(ws.terminals)) {
              ws.terminals.forEach((t: TerminalTab, tIdx: number) => {
                if (!t.id || seenTermIds.has(t.id)) {
                  t.id = generateUid(`term-${tIdx + 1}`)
                }
                seenTermIds.add(t.id)
              })
            } else {
              ws.terminals = []
            }
            if (!ws.terminals.some(t => t.id === ws.activeTerminalId)) {
              ws.activeTerminalId = ws.terminals[0]?.id || ''
            }
          })

          workstations.value = parsed.workstations
          activeWorkstationId.value = parsed.workstations.some((w: Workstation) => w.id === parsed.activeWorkstationId)
            ? parsed.activeWorkstationId
            : parsed.workstations[0].id

          if (typeof parsed.isSidebarOpen === 'boolean') {
            isSidebarOpen.value = parsed.isSidebarOpen
          }
          saveSession(false)
          return
        }
      }

      // Fallback migration from older v4 session
      const rawV4 = localStorage.getItem('mytermin_session_v4')
      if (rawV4) {
        const parsed = JSON.parse(rawV4)
        if (Array.isArray(parsed.terminals) && parsed.terminals.length > 0) {
          workstations.value = [{
            id: 'ws-1',
            name: 'Workstation 1',
            layout: parsed.currentLayout || 'grid-2x2',
            activeTerminalId: parsed.activeTerminalId || parsed.terminals[0].id,
            terminals: parsed.terminals
          }]
          activeWorkstationId.value = 'ws-1'
        }
      }
    } catch (e) {
      console.error('Failed to load session:', e)
    }
  }

  const clearSavedSession = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem('mytermin_session_v4')
      saveNotification.value = 'Sesi tersimpan telah dibersihkan.'
      setTimeout(() => {
        saveNotification.value = null
      }, 2500)
    }
  }

  // Cyclic navigation: Ctrl+Tab inside active workstation
  const nextTab = () => {
    if (terminals.value.length === 0) return
    const idx = terminals.value.findIndex(t => t.id === activeTerminalId.value)
    const nextIdx = (idx + 1) % terminals.value.length
    const nextTerm = terminals.value[nextIdx]
    if (nextTerm) activeTerminalId.value = nextTerm.id
  }

  const prevTab = () => {
    if (terminals.value.length === 0) return
    const idx = terminals.value.findIndex(t => t.id === activeTerminalId.value)
    const prevIdx = (idx - 1 + terminals.value.length) % terminals.value.length
    const prevTerm = terminals.value[prevIdx]
    if (prevTerm) activeTerminalId.value = prevTerm.id
  }

  const addTerminal = (presetTerminal?: { title?: string; command?: string; shell?: string; cwd?: string }) => {
    const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
    if (!ws) return
    const termNum = ws.terminals.length + 1
    const newId = generateUid('term')
    const targetCwd = presetTerminal?.cwd || ws.folderPath
    ws.terminals.push({
      id: newId,
      title: presetTerminal?.title || `Terminal ${termNum}`,
      initialCommand: presetTerminal?.command,
      shell: presetTerminal?.shell,
      cwd: targetCwd
    })
    ws.activeTerminalId = newId
    saveSession(false)
  }

  const duplicateTerminal = async (targetTermId?: string) => {
    const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
    if (!ws) return
    const sourceId = targetTermId || ws.activeTerminalId
    const sourceTerm = ws.terminals.find(t => t.id === sourceId)
    if (!sourceTerm) return

    let currentCwd = sourceTerm.cwd
    const { getPtyCwd } = useTauriPty()
    try {
      const liveCwd = await getPtyCwd(sourceId)
      if (liveCwd) {
        currentCwd = liveCwd
        sourceTerm.cwd = liveCwd
      }
    } catch {
      // Fallback
    }

    const newId = generateUid('term')
    const copyTitle = `${sourceTerm.title} (Copy)`
    const sourceIdx = ws.terminals.findIndex(t => t.id === sourceId)
    const newTerm: TerminalTab = {
      id: newId,
      title: copyTitle,
      shell: sourceTerm.shell,
      cwd: currentCwd || ws.folderPath
    }

    if (sourceIdx !== -1) {
      ws.terminals.splice(sourceIdx + 1, 0, newTerm)
    } else {
      ws.terminals.push(newTerm)
    }

    ws.activeTerminalId = newId
    saveSession(false)
  }

  const removeTerminal = (termId: string) => {
    const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
    if (!ws) return
    const idx = ws.terminals.findIndex(t => t.id === termId)
    if (idx !== -1) {
      const { killPty } = useTauriPty()
      killPty(termId).catch(() => {})
      ws.terminals.splice(idx, 1)
      if (ws.terminals.length === 0) {
        ws.activeTerminalId = ''
      } else if (ws.activeTerminalId === termId) {
        const fallbackTerm = ws.terminals[Math.max(0, idx - 1)]
        if (fallbackTerm) ws.activeTerminalId = fallbackTerm.id
      }
      saveSession(false)
    }
  }

  const moveTerminalTab = (fromIndex: number, toIndex: number) => {
    const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
    if (!ws) return
    if (
      fromIndex < 0 ||
      fromIndex >= ws.terminals.length ||
      toIndex < 0 ||
      toIndex >= ws.terminals.length ||
      fromIndex === toIndex
    ) {
      return
    }
    const [movedTab] = ws.terminals.splice(fromIndex, 1)
    if (!movedTab) return
    ws.terminals.splice(toIndex, 0, movedTab)
    saveSession(false)
  }

  const renameTerminal = (termId: string, newTitle: string) => {
    const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
    if (!ws) return
    const term = ws.terminals.find(t => t.id === termId)
    if (term && newTitle.trim()) {
      term.title = newTitle.trim()
      saveSession(false)
    }
  }

  const updateTerminalCwd = (termId: string, cwd: string) => {
    const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
    if (!ws) return
    const term = ws.terminals.find(t => t.id === termId)
    if (term && cwd && cwd !== term.cwd) {
      term.cwd = cwd
      saveSession(false)
      const { setPtyCwd } = useTauriPty()
      setPtyCwd(termId, cwd)
    }
  }

  const updateTerminalLastCommand = (termId: string, cmd: string) => {
    const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
    if (!ws) return
    const term = ws.terminals.find(t => t.id === termId)
    const cleanCmd = cmd.trim()
    if (term && cleanCmd && cleanCmd !== 'clear' && cleanCmd !== 'cls' && cleanCmd !== 'exit') {
      if (term.lastCommand !== cleanCmd) {
        term.lastCommand = cleanCmd
        saveSession(false)
      }
    }
  }

  const setLayout = (layout: LayoutType) => {
    const ws = workstations.value.find(w => w.id === activeWorkstationId.value)
    if (ws) {
      ws.layout = layout
      saveSession(false)
    }
  }

  const applyPreset = async (preset: WorkspacePreset, asNewWorkstation = false) => {
    const { killPty } = useTauriPty()

    // Jika 'Terapkan' (menggantikan seluruh workspace saat ini), matikan semua PTY lama terlebih dahulu
    if (!asNewWorkstation) {
      for (const ws of workstations.value) {
        for (const t of ws.terminals) {
          killPty(t.id).catch(() => {})
        }
      }
    }

    if (preset.workstations && preset.workstations.length > 0) {
      const createdWorkstations: Workstation[] = preset.workstations.map((wsConfig, wsIdx) => {
        const termList: TerminalTab[] = wsConfig.terminals.map((t, idx) => ({
          id: generateUid(`term-${idx + 1}`),
          title: t.title,
          initialCommand: t.command,
          shell: t.shell,
          cwd: t.cwd || wsConfig.folderPath
        }))
        return {
          id: generateUid(`ws-${wsIdx + 1}`),
          name: wsConfig.name || `Workstation ${wsIdx + 1}`,
          layout: wsConfig.layout || 'grid-2x2',
          folderPath: wsConfig.folderPath,
          activeTerminalId: termList[0]?.id || '',
          terminals: termList
        }
      })

      if (asNewWorkstation) {
        workstations.value.push(...createdWorkstations)
      } else {
        workstations.value = createdWorkstations
      }
      const firstWsCreated = createdWorkstations[0]
      if (firstWsCreated) activeWorkstationId.value = firstWsCreated.id
      saveSession(false)
      return
    }

    // Fallback untuk single preset
    const termList: TerminalTab[] = (preset.terminals || []).map((t, idx) => ({
      id: generateUid(`term-${idx + 1}`),
      title: t.title,
      initialCommand: t.command,
      shell: t.shell,
      cwd: t.cwd || preset.folderPath
    }))

    const singleWs: Workstation = {
      id: generateUid('ws'),
      name: preset.name,
      layout: preset.layout,
      folderPath: preset.folderPath,
      activeTerminalId: termList[0]?.id || '',
      terminals: termList
    }

    if (asNewWorkstation) {
      workstations.value.push(singleWs)
    } else {
      workstations.value = [singleWs]
    }
    activeWorkstationId.value = singleWs.id
    saveSession(false)
  }

  const applyStartupPreset = (settings: TerminalSettings) => {
    const ids = settings.startupPresetIds || []
    if (ids.length === 0) return
    const all = [...customPresets.value, ...defaultBuiltInPresets]
    const selected = all.filter(p => ids.includes(p.id))
    if (selected.length === 0) return
    const first = selected[0]
    if (!first) return
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

  const setTerminalAlert = (termId: string, status: 'running' | 'completed' | null) => {
    if (!status) {
      if (backgroundAlerts.value[termId]) {
        const copy = { ...backgroundAlerts.value }
        delete copy[termId]
        backgroundAlerts.value = copy
      }
    } else {
      backgroundAlerts.value = { ...backgroundAlerts.value, [termId]: status }
    }
  }

  const clearTerminalAlert = (termId: string) => {
    setTerminalAlert(termId, null)
  }

  return {
    workstations,
    activeWorkstationId,
    activeWorkstation,
    isSidebarOpen,
    toggleSidebar,
    addWorkstation,
    switchWorkstation,
    nextWorkstation,
    prevWorkstation,
    renameWorkstation,
    removeWorkstation,
    moveWorkstationTab,
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
    saveCustomPreset,
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
    applyStartupPreset,
    backgroundAlerts,
    setTerminalAlert,
    clearTerminalAlert
  }
}

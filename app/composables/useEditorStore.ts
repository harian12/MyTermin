export interface OpenFileItem {
  id: string
  name: string
  path: string
  content: string
  originalContent: string
  isDirty: boolean
  isDiff?: boolean
  diffOriginalContent?: string
}

export type ViewportMode = 'split' | 'editor-full' | 'terminal-full'

export interface WorkstationEditorState {
  openFiles: OpenFileItem[]
  activeFileId: string | null
  secondaryFileId: string | null
  isEditorPaneSplit: boolean
  splitRatio: number
  closedTabsHistory: string[]
}

const EDITOR_SESSION_KEY = 'mytermin_editor_session_v2'

export const useEditorStore = () => {
  const { activeWorkstationId, activeWorkstation } = useWorkspaceStore()
  const workstationEditors = useState<Record<string, WorkstationEditorState>>(
    'editor-workstations-map',
    () => ({})
  )

  const viewportMode = useState<ViewportMode>('workspace-viewport-mode', () => 'split')
  const splitOrientation = useState<'horizontal' | 'vertical'>('workspace-split-orientation', () => 'horizontal')
  const isAutoSave = useState<boolean>('editor-auto-save-mode', () => false)
  const isWordWrap = useState<boolean>('editor-word-wrap-mode', () => true)
  const lastFocusedPane = useState<'editor' | 'terminal'>('app-last-focused-pane', () => 'editor')
  const editorNotification = useState<string | null>('editor-notification', () => null)
  const unsavedConfirmFile = useState<OpenFileItem | null>('editor-unsaved-confirm-file', () => null)
  const targetNavigatePosition = useState<{ line: number; col: number; timestamp: number } | null>(
    'editor-navigate-pos',
    () => null
  )
  const { isTauri } = useTauriPty()

  // Save editor state to localStorage
  const saveEditorSession = () => {
    if (typeof window === 'undefined') return
    try {
      const dataToSave: Record<string, {
        filePaths: string[]
        activePath: string | null
        secondaryPath: string | null
        isEditorPaneSplit: boolean
        splitRatio: number
      }> = {}

      for (const wsId of Object.keys(workstationEditors.value)) {
        const state = workstationEditors.value[wsId]
        if (state) {
          const activeItem = state.openFiles.find(f => f.id === state.activeFileId)
          const secondaryItem = state.openFiles.find(f => f.id === state.secondaryFileId)
          dataToSave[wsId] = {
            filePaths: state.openFiles.filter(f => !f.isDiff).map(f => f.path),
            activePath: activeItem?.path || null,
            secondaryPath: secondaryItem?.path || null,
            isEditorPaneSplit: state.isEditorPaneSplit,
            splitRatio: state.splitRatio
          }
        }
      }

      localStorage.setItem(EDITOR_SESSION_KEY, JSON.stringify(dataToSave))
    } catch (e) {
      console.warn('Failed to save editor session:', e)
    }
  }

  // Restore editor state from localStorage on startup
  const initEditorSession = async () => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(EDITOR_SESSION_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (typeof parsed !== 'object') return

      for (const wsId of Object.keys(parsed)) {
        const entry = parsed[wsId]
        if (!entry || !Array.isArray(entry.filePaths)) continue

        const restoredFiles: OpenFileItem[] = []
        for (const filePath of entry.filePaths) {
          const filename = filePath.split(/[\\/]/).pop() || filePath
          let content = ''
          if (isTauri.value) {
            try {
              const { invoke } = await import('@tauri-apps/api/core')
              content = await invoke<string>('read_file_content', { path: filePath })
            } catch {
              continue // File might have been deleted or moved
            }
          } else {
            content = `// Restored file: ${filename}\n`
          }

          restoredFiles.push({
            id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name: filename,
            path: filePath,
            content,
            originalContent: content,
            isDirty: false
          })
        }

        const activeFound = restoredFiles.find(f => f.path === entry.activePath)
        const secondaryFound = restoredFiles.find(f => f.path === entry.secondaryPath)

        workstationEditors.value[wsId] = {
          openFiles: restoredFiles,
          activeFileId: activeFound ? activeFound.id : (restoredFiles[0]?.id || null),
          secondaryFileId: secondaryFound ? secondaryFound.id : null,
          isEditorPaneSplit: entry.isEditorPaneSplit || false,
          splitRatio: entry.splitRatio || 50,
          closedTabsHistory: []
        }
      }
    } catch (e) {
      console.warn('Failed to restore editor session:', e)
    }
  }

  const currentEditorState = computed<WorkstationEditorState>(() => {
    const wsId = activeWorkstationId.value || 'ws-default'
    if (!workstationEditors.value[wsId]) {
      workstationEditors.value[wsId] = {
        openFiles: [],
        activeFileId: null,
        secondaryFileId: null,
        isEditorPaneSplit: false,
        splitRatio: 50,
        closedTabsHistory: []
      }
    }
    return workstationEditors.value[wsId]
  })

  const openFiles = computed({
    get: () => currentEditorState.value.openFiles,
    set: (val: OpenFileItem[]) => {
      currentEditorState.value.openFiles = val
      saveEditorSession()
    }
  })

  const activeFileId = computed({
    get: () => currentEditorState.value.activeFileId,
    set: (val: string | null) => {
      currentEditorState.value.activeFileId = val
      saveEditorSession()
    }
  })

  const secondaryFileId = computed({
    get: () => currentEditorState.value.secondaryFileId,
    set: (val: string | null) => {
      currentEditorState.value.secondaryFileId = val
      saveEditorSession()
    }
  })

  const isEditorPaneSplit = computed({
    get: () => currentEditorState.value.isEditorPaneSplit,
    set: (val: boolean) => {
      currentEditorState.value.isEditorPaneSplit = val
      saveEditorSession()
    }
  })

  const splitEditorRatio = computed({
    get: () => currentEditorState.value.splitRatio ?? 50,
    set: (val: number) => {
      currentEditorState.value.splitRatio = val
      saveEditorSession()
    }
  })

  const isEditorVisible = computed(() => {
    return openFiles.value.length > 0 && viewportMode.value !== 'terminal-full'
  })

  const isTerminalVisible = computed(() => {
    return openFiles.value.length === 0 || viewportMode.value !== 'editor-full'
  })

  const activeFile = computed(() => {
    return openFiles.value.find((f) => f.id === activeFileId.value) || null
  })

  const secondaryFile = computed(() => {
    if (!secondaryFileId.value) return null
    return openFiles.value.find((f) => f.id === secondaryFileId.value) || null
  })

  const toggleEditorPaneSplit = () => {
    isEditorPaneSplit.value = !isEditorPaneSplit.value
    if (isEditorPaneSplit.value) {
      if (!secondaryFileId.value) {
        const other = openFiles.value.find((f) => f.id !== activeFileId.value)
        secondaryFileId.value = other ? other.id : activeFileId.value
      }
    }
    saveEditorSession()
  }

  const openGitDiffTab = async (filePath: string, relPath: string, headContent: string) => {
    if (!filePath) return
    const filename = filePath.split(/[\\/]/).pop() || filePath
    const diffTabId = `diff-${filePath}`

    // Cek apakah file sedang dibuka di tab editor reguler
    const openRegular = openFiles.value.find(f => f.path === filePath && !f.isDiff)
    let currentContent = openRegular ? openRegular.content : ''

    if (!currentContent && isTauri.value) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        currentContent = await invoke<string>('read_file_content', { path: filePath })
      } catch (e: any) {
        currentContent = ''
      }
    }

    if (viewportMode.value === 'terminal-full') {
      viewportMode.value = 'split'
    }

    const existing = openFiles.value.find((f) => f.id === diffTabId)
    if (existing) {
      existing.diffOriginalContent = headContent
      existing.content = currentContent
      existing.originalContent = currentContent
      activeFileId.value = existing.id
      return
    }

    const newItem: OpenFileItem = {
      id: diffTabId,
      name: `${filename} (Diff)`,
      path: filePath,
      content: currentContent,
      originalContent: currentContent,
      isDirty: false,
      isDiff: true,
      diffOriginalContent: headContent
    }

    openFiles.value.push(newItem)
    activeFileId.value = newItem.id
  }

  const openFileAtPosition = async (filePath: string, line: number, col = 1) => {
    await openFile(filePath)
    targetNavigatePosition.value = { line, col, timestamp: Date.now() }
  }

  const openFile = async (filePath: string) => {
    if (!filePath) return
    const filename = filePath.split(/[\\/]/).pop() || filePath
    const existing = openFiles.value.find((f) => f.path === filePath)

    if (viewportMode.value === 'terminal-full') {
      viewportMode.value = 'split'
    }

    if (existing) {
      activeFileId.value = existing.id
      return
    }

    let content = ''
    if (isTauri.value) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        content = await invoke<string>('read_file_content', { path: filePath })
      } catch (e: any) {
        console.error('Failed to read file:', e)
        editorNotification.value = `Gagal membaca file: ${e}`
        setTimeout(() => {
          editorNotification.value = null
        }, 3000)
        return
      }
    } else {
      content = `// Preview file: ${filename}\n// Path: ${filePath}\n\nconsole.log('Hello from MyTermin Editor!')\n`
    }

    const newItem: OpenFileItem = {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: filename,
      path: filePath,
      content,
      originalContent: content,
      isDirty: false
    }

    openFiles.value.push(newItem)
    activeFileId.value = newItem.id

    if (isEditorPaneSplit.value && !secondaryFileId.value) {
      secondaryFileId.value = newItem.id
    }

    saveEditorSession()
  }

  // Auto-reload non-dirty files from disk if modified externally
  const reloadOpenFilesFromDisk = async () => {
    if (!isTauri.value || openFiles.value.length === 0) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      for (const file of openFiles.value) {
        if (!file.isDirty && !file.isDiff) {
          try {
            const diskContent = await invoke<string>('read_file_content', { path: file.path })
            if (diskContent !== file.content) {
              file.content = diskContent
              file.originalContent = diskContent
            }
          } catch {
            // File might have been deleted
          }
        }
      }
    } catch {
      // Silent
    }
  }

  const saveFile = async (fileId?: string) => {
    const targetId = fileId || activeFileId.value
    const file = openFiles.value.find((f) => f.id === targetId)
    if (!file) return

    if (isTauri.value) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('save_file_content', { path: file.path, content: file.content })
        file.originalContent = file.content
        file.isDirty = false
        editorNotification.value = `${file.name} disimpan!`
        setTimeout(() => {
          editorNotification.value = null
        }, 2000)

        const { refreshGitStatus } = useProjectExplorer()
        await refreshGitStatus()

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mytermin-file-saved', { detail: { path: file.path } }))
        }
      } catch (e: any) {
        console.error('Failed to save file:', e)
        editorNotification.value = `Gagal menyimpan file: ${e}`
        setTimeout(() => {
          editorNotification.value = null
        }, 3000)
      }
    } else {
      file.originalContent = file.content
      file.isDirty = false
      editorNotification.value = `${file.name} disimpan!`
      setTimeout(() => {
        editorNotification.value = null
      }, 2000)
    }

    saveEditorSession()
  }

  const saveAll = async () => {
    const dirtyFiles = openFiles.value.filter((f) => f.isDirty)
    if (dirtyFiles.length === 0) return

    for (const f of dirtyFiles) {
      await saveFile(f.id)
    }
    editorNotification.value = `Semua file (${dirtyFiles.length}) disimpan!`
    setTimeout(() => {
      editorNotification.value = null
    }, 2000)
  }

  const autoSaveTimers = new Map<string, any>()

  const updateContent = (fileId: string, newContent: string) => {
    const file = openFiles.value.find((f) => f.id === fileId)
    if (file) {
      file.content = newContent
      file.isDirty = file.content !== file.originalContent

      if (isAutoSave.value && file.isDirty) {
        if (autoSaveTimers.has(fileId)) {
          clearTimeout(autoSaveTimers.get(fileId))
        }
        const t = setTimeout(() => {
          saveFile(fileId)
          autoSaveTimers.delete(fileId)
        }, 1000)
        autoSaveTimers.set(fileId, t)
      }
    }
  }

  let lastCloseTime = 0

  const performClose = (fileId: string) => {
    const idx = openFiles.value.findIndex((f) => f.id === fileId)
    if (idx !== -1) {
      const closedFile = openFiles.value[idx]
      if (closedFile && !closedFile.isDiff) {
        currentEditorState.value.closedTabsHistory.push(closedFile.path)
        if (currentEditorState.value.closedTabsHistory.length > 20) {
          currentEditorState.value.closedTabsHistory.shift()
        }
      }

      openFiles.value.splice(idx, 1)
      if (openFiles.value.length === 0) {
        activeFileId.value = null
        secondaryFileId.value = null
        isEditorPaneSplit.value = false
      } else if (activeFileId.value === fileId) {
        const nextIdx = Math.min(idx, openFiles.value.length - 1)
        activeFileId.value = openFiles.value[nextIdx].id
      }
      if (secondaryFileId.value === fileId) {
        secondaryFileId.value = activeFileId.value
      }
    }
    saveEditorSession()
  }

  const closeFile = (fileId: string, force = false) => {
    const now = Date.now()
    if (now - lastCloseTime < 80) {
      return
    }
    lastCloseTime = now

    const file = openFiles.value.find((f) => f.id === fileId)
    if (!file) return

    if (file.isDirty && !force && !isAutoSave.value) {
      unsavedConfirmFile.value = file
      return
    }

    performClose(fileId)
  }

  const reopenClosedTab = async () => {
    const history = currentEditorState.value.closedTabsHistory
    if (history && history.length > 0) {
      const lastPath = history.pop()
      if (lastPath) {
        await openFile(lastPath)
      }
    }
  }

  const discardAndClose = () => {
    if (unsavedConfirmFile.value) {
      performClose(unsavedConfirmFile.value.id)
      unsavedConfirmFile.value = null
    }
  }

  const saveAndClose = async () => {
    if (unsavedConfirmFile.value) {
      const id = unsavedConfirmFile.value.id
      await saveFile(id)
      performClose(id)
      unsavedConfirmFile.value = null
    }
  }

  const closeOtherTabs = (keepFileId: string) => {
    const toClose = openFiles.value.filter((f) => f.id !== keepFileId)
    for (const f of toClose) {
      closeFile(f.id, true)
    }
    activeFileId.value = keepFileId
    secondaryFileId.value = null
    isEditorPaneSplit.value = false
    saveEditorSession()
  }

  const closeTabsToTheRight = (targetFileId: string) => {
    const idx = openFiles.value.findIndex(f => f.id === targetFileId)
    if (idx === -1) return
    const toClose = openFiles.value.slice(idx + 1)
    for (const f of toClose) {
      closeFile(f.id, true)
    }
    saveEditorSession()
  }

  const closeAllTabs = () => {
    openFiles.value = []
    activeFileId.value = null
    secondaryFileId.value = null
    isEditorPaneSplit.value = false
    saveEditorSession()
  }

  const closeActiveFile = () => {
    if (activeFileId.value) {
      closeFile(activeFileId.value)
    }
  }

  const nextFileTab = () => {
    lastFocusedPane.value = 'editor'
    if (openFiles.value.length <= 1) return
    const curIdx = openFiles.value.findIndex(f => f.id === activeFileId.value)
    const nextIdx = (curIdx + 1) % openFiles.value.length
    activeFileId.value = openFiles.value[nextIdx].id
  }

  const prevFileTab = () => {
    lastFocusedPane.value = 'editor'
    if (openFiles.value.length <= 1) return
    const curIdx = openFiles.value.findIndex(f => f.id === activeFileId.value)
    const prevIdx = (curIdx - 1 + openFiles.value.length) % openFiles.value.length
    activeFileId.value = openFiles.value[prevIdx].id
  }

  const copyRelativePath = async (filePath: string) => {
    const root = (activeWorkstation.value.folderPath || '').replace(/\\/g, '/').replace(/\/+$/, '')
    const norm = filePath.replace(/\\/g, '/')
    const rel = (root && norm.startsWith(root)) ? norm.substring(root.length).replace(/^\/+/, '') : filePath
    await navigator.clipboard.writeText(rel)
    editorNotification.value = `Disalin: ${rel}`
    setTimeout(() => { editorNotification.value = null }, 2000)
  }

  return {
    openFiles,
    activeFileId,
    secondaryFileId,
    activeFile,
    secondaryFile,
    isEditorPaneSplit,
    splitEditorRatio,
    viewportMode,
    splitOrientation,
    isAutoSave,
    isWordWrap,
    lastFocusedPane,
    isEditorVisible,
    isTerminalVisible,
    editorNotification,
    unsavedConfirmFile,
    targetNavigatePosition,
    initEditorSession,
    saveEditorSession,
    reloadOpenFilesFromDisk,
    openFile,
    openGitDiffTab,
    openFileAtPosition,
    saveFile,
    saveAll,
    updateContent,
    toggleEditorPaneSplit,
    closeFile,
    reopenClosedTab,
    discardAndClose,
    saveAndClose,
    closeOtherTabs,
    closeTabsToTheRight,
    closeAllTabs,
    closeActiveFile,
    nextFileTab,
    prevFileTab,
    copyRelativePath
  }
}

<script setup lang="ts">
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import {
  Trash2,
  Play,
  Pencil,
  Check,
  Activity,
  Cpu,
  RotateCcw,
  FolderInput,
  Search,
  ArrowUp,
  ArrowDown,
  Download,
  X
} from 'lucide-vue-next'
import { TERMINAL_THEMES } from '~/composables/useThemes'
import type { PtyStats } from '~/types/terminal'
import { sendDesktopNotification } from '~/composables/useSettingsStore'

interface Props {
  paneId: string
  title: string
  isActive: boolean
  shell?: string
  cwd?: string
  /** Folder project milik workstation pemilik pane ini (untuk deteksi selisih cwd). */
  projectFolder?: string
  initialCommand?: string
  lastCommand?: string
  isTabActive?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isTabActive: true
})

const emit = defineEmits<{
  (e: 'focus', paneId: string): void
  (e: 'close', paneId: string): void
  (e: 'contextmenu', payload: { x: number; y: number; hasSelection: boolean; paneId: string }): void
}>()

const terminalContainer = ref<HTMLElement | null>(null)
const {
  isTauri,
  createPty,
  writePty,
  resizePty,
  killPty,
  onPtyData,
  onPtyExit,
  getAllPtyStats,
  saveTempImage,
  saveTempFile,
  pasteFromClipboard,
  getClipboardFiles,
  copyToClipboard
} = useTauriPty()
const { settings, isShortcut, updateSettings } = useSettingsStore()
const { terminals, renameTerminal, updateTerminalCwd, updateTerminalLastCommand, setTerminalAlert, clearTerminalAlert, sessionReady } = useWorkspaceStore()
const { togglePalette, openPalette } = useCommandPalette()

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let searchAddon: SearchAddon | null = null
let webglAddon: WebglAddon | null = null
let ligaturesAddon: LigaturesAddon | null = null
let unlistenData: (() => void) | null = null
let unlistenExit: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let statsInterval: any = null
let ptyStreamBuffer = ''
let wasProcessBusy = false

const isPtyReady = ref(false)
const isPtyExited = ref(false)
const showQuickCommands = ref(false)
const isEditingTitle = ref(false)
const newPaneTitle = ref(props.title)
const paneStats = ref<PtyStats | null>(null)
const isFileDraggingOver = ref(false)

// --- Deteksi selisih cwd terminal vs folder project -------------------------
const normalizePath = (p?: string) =>
  (p || '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\//g, '\\')
    .replace(/\\+$/, '')
    .toLowerCase()

// Prefer cwd proses nyata dari sysinfo; fallback ke cwd tersimpan di store.
const effectiveCwd = computed(() => paneStats.value?.cwd || props.cwd || '')

const isCwdMismatch = computed(() => {
  const project = normalizePath(props.projectFolder)
  if (!project) return false
  const current = normalizePath(effectiveCwd.value)
  if (!current) return false
  return current !== project
})

const goToProjectFolder = async () => {
  const target = props.projectFolder
  if (!target || !isTauri.value) return
  await writePty(props.paneId, `cd "${target}"\r`)
  updateTerminalCwd(props.paneId, target)
  term?.focus()
}

// Search bar state
const isSearchOpen = ref(false)
const searchQuery = ref('')
const searchMatchCase = ref(false)
const searchFound = ref<boolean | null>(null)

const currentTheme = computed(() => {
  return TERMINAL_THEMES[settings.value.theme]?.theme || TERMINAL_THEMES['tokyoNight']?.theme || {}
})

const safeFit = () => {
  if (!fitAddon || !term || !terminalContainer.value) return
  const el = terminalContainer.value
  if (el.clientWidth > 40 && el.clientHeight > 40) {
    try {
      fitAddon.fit()
      if (term.cols && term.rows && term.cols > 10 && term.rows > 2) {
        resizePty(props.paneId, term.cols, term.rows)
      }
      term.scrollToBottom()
    } catch (e) {
      console.warn('safeFit skipped:', e)
    }
  }
}

const startRename = () => {
  isEditingTitle.value = true
  newPaneTitle.value = props.title
  nextTick(() => {
    const input = document.getElementById(`pane-title-input-${props.paneId}`)
    input?.focus()
  })
}

const finishRename = () => {
  if (newPaneTitle.value.trim()) {
    renameTerminal(props.paneId, newPaneTitle.value.trim())
  }
  isEditingTitle.value = false
}

const dynamicQuickActions = computed(() => {
  return settings.value.quickCommands && settings.value.quickCommands.length > 0
    ? settings.value.quickCommands
    : DEFAULT_QUICK_COMMANDS
})

const executeCommand = (cmd: string) => {
  const formattedCmd = cmd.endsWith('\r') || cmd.endsWith('\n') ? cmd : cmd + '\r'
  if (isTauri.value) {
    writePty(props.paneId, formattedCmd)
    updateTerminalLastCommand(props.paneId, cmd)
  } else if (term) {
    term.writeln(`\r\n$ ${cmd.trim()}`)
  }
  showQuickCommands.value = false
}

// Search and Export Logic
const openSearch = () => {
  isSearchOpen.value = true
  nextTick(() => {
    const el = document.getElementById(`search-input-${props.paneId}`) as HTMLInputElement | null
    el?.focus()
    el?.select()
  })
}

const closeSearch = () => {
  isSearchOpen.value = false
  searchQuery.value = ''
  searchFound.value = null
  searchAddon?.clearDecorations()
  term?.focus()
}

const searchNext = () => {
  if (!searchAddon || !searchQuery.value) return
  searchFound.value = searchAddon.findNext(searchQuery.value, {
    caseSensitive: searchMatchCase.value,
    incremental: false
  })
}

const searchPrev = () => {
  if (!searchAddon || !searchQuery.value) return
  searchFound.value = searchAddon.findPrevious(searchQuery.value, {
    caseSensitive: searchMatchCase.value
  })
}

const onSearchInput = () => {
  if (!searchAddon) return
  if (!searchQuery.value) {
    searchFound.value = null
    return
  }
  searchFound.value = searchAddon.findNext(searchQuery.value, {
    caseSensitive: searchMatchCase.value,
    incremental: true
  })
}

const exportBufferToFile = () => {
  if (!term) return
  const buffer = term.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i)
    if (line) {
      lines.push(line.translateToString(true))
    }
  }
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') {
    lines.pop()
  }
  const content = lines.join('\r\n')
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_log_${Date.now()}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const parseStreamForCwd = (rawChunk: string) => {
  // OSC 9;9 (Windows Terminal / ConEmu)
  const osc9Match = rawChunk.match(/\x1B\]9;9;"?([^"\x07\x1B]+)"?(?:\x07|\x1B\\)/)
  if (osc9Match && osc9Match[1]) {
    const p = osc9Match[1].trim()
    if (p.length >= 2) {
      updateTerminalCwd(props.paneId, p)
      return
    }
  }

  // OSC 7 (file:// hostname / path)
  const osc7Match = rawChunk.match(/\x1B\]7;file:\/\/[^/]*\/([^\x07\x1B]+)(?:\x07|\x1B\\)/)
  if (osc7Match && osc7Match[1]) {
    let p = decodeURIComponent(osc7Match[1])
    if (p.startsWith('/') && p.length >= 3 && p[2] === ':') p = p.slice(1)
    p = p.replace(/\//g, '\\').trim()
    if (p.length >= 2) {
      updateTerminalCwd(props.paneId, p)
      return
    }
  }

  // Strip ANSI and match prompts across chunk boundaries
  const clean = rawChunk.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g, '')
  ptyStreamBuffer = (ptyStreamBuffer + clean).slice(-1024)

  const psMatches = [...ptyStreamBuffer.matchAll(/PS\s+([A-Za-z]:[\\/][^>\r\n]+)>/g)]
  const lastPsMatch = psMatches[psMatches.length - 1]?.[1]
  if (lastPsMatch) {
    const matched = lastPsMatch.trim()
    if (matched.length >= 2) {
      updateTerminalCwd(props.paneId, matched)
      return
    }
  }

  const cmdMatches = [...ptyStreamBuffer.matchAll(/(?:^|[\r\n])\s*([A-Za-z]:[\\/][^>\r\n]+)>/g)]
  const lastCmdMatch = cmdMatches[cmdMatches.length - 1]?.[1]
  if (lastCmdMatch) {
    const matched = lastCmdMatch.trim()
    if (matched.length >= 2) {
      updateTerminalCwd(props.paneId, matched)
    }
  }
}

// Tunggu sesi dipulihkan dari storage agar cwd spawn tidak kosong (state default
// saat boot tidak punya folder project -> Rust fallback ke cwd proses = home user).
const waitForSessionReady = async (timeoutMs = 3000) => {
  if (sessionReady.value) return
  const started = Date.now()
  while (!sessionReady.value && Date.now() - started < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

const initTerminal = async () => {
  if (!terminalContainer.value) return
  await waitForSessionReady()
  if (!terminalContainer.value || term) return

  term = new Terminal({
    fontSize: settings.value.fontSize,
    fontFamily: settings.value.fontFamily,
    cursorStyle: settings.value.cursorStyle,
    cursorBlink: settings.value.cursorBlink,
    theme: currentTheme.value,
    scrollback: settings.value.scrollback || 5000,
    allowProposedApi: true,
    smoothScrollDuration: 0,
    convertEol: false,
    windowsMode: false
  })

  fitAddon = new FitAddon()
  searchAddon = new SearchAddon()
  const webLinksAddon = new WebLinksAddon()
  const unicode11Addon = new Unicode11Addon()

  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)
  term.loadAddon(webLinksAddon)
  term.loadAddon(unicode11Addon)
  term.unicode.activeVersion = '11'

  if (settings.value.fontLigatures !== false) {
    try {
      ligaturesAddon = new LigaturesAddon()
      term.loadAddon(ligaturesAddon)
    } catch (e) {
      console.warn('Ligatures addon skipped:', e)
      ligaturesAddon = null
    }
  }

  if (settings.value.enableWebgl !== false) {
    try {
      webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose()
        webglAddon = null
      })
      term.loadAddon(webglAddon)
    } catch (e) {
      console.warn('WebGL addon skipped, using DOM renderer:', e)
      webglAddon = null
    }
  }

  // Forward critical shortcuts (Ctrl+C selection copy, Ctrl+Tab, Custom Keybindings, etc.)
  term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
    // Search Buffer
    if (isShortcut(event, 'searchBuffer')) {
      if (event.type === 'keydown') {
        event.preventDefault()
        event.stopPropagation()
        openSearch()
      }
      return false
    }

    // Ctrl+C: If text is selected in xterm, copy to clipboard. Otherwise let xterm send SIGINT (\x03)
    if (event.ctrlKey && !event.shiftKey && (event.key === 'c' || event.key === 'C' || event.code === 'KeyC')) {
      const selection = term?.getSelection()
      if (selection && selection.length > 0) {
        if (event.type === 'keydown') {
          event.preventDefault()
          event.stopPropagation()
          copySelection()
        }
        return false
      }
    }

    // Ctrl+V or Ctrl+Shift+V: Paste text / image / file path from native OS clipboard directly to PTY session
    if (event.ctrlKey && (event.key === 'v' || event.key === 'V' || event.code === 'KeyV')) {
      if (event.type === 'keydown') {
        event.preventDefault()
        event.stopPropagation()
        pasteClipboard()
      }
      return false
    }

    // Terminal Font Zoom: Ctrl + = / Ctrl + + / Ctrl + - / Ctrl + 0 (also Numpad)
    if (event.ctrlKey && !event.altKey && (event.key === '=' || event.key === '+' || event.code === 'NumpadAdd')) {
      if (event.type === 'keydown') {
        event.preventDefault()
        event.stopPropagation()
        zoomIn()
      }
      return false
    }

    if (event.ctrlKey && !event.altKey && (event.key === '-' || event.code === 'NumpadSubtract')) {
      if (event.type === 'keydown') {
        event.preventDefault()
        event.stopPropagation()
        zoomOut()
      }
      return false
    }

    if (event.ctrlKey && !event.altKey && (event.key === '0' || event.code === 'Numpad0')) {
      if (event.type === 'keydown') {
        event.preventDefault()
        event.stopPropagation()
        zoomReset()
      }
      return false
    }

    // Command Palette
    if (isShortcut(event, 'commandPalette')) {
      if (event.type === 'keydown') {
        event.preventDefault()
        event.stopPropagation()
        openPalette()
      }
      return false
    }

    if (event.ctrlKey && event.key === 'Tab') {
      return false // Allow window to handle cyclic tab switch
    }

    // Custom Keybindings to bubble to window handler
    if (
      isShortcut(event, 'newTab') ||
      isShortcut(event, 'closeTab') ||
      isShortcut(event, 'duplicateTab') ||
      isShortcut(event, 'splitHorizontal') ||
      isShortcut(event, 'splitVertical') ||
      isShortcut(event, 'grid2x2') ||
      isShortcut(event, 'singleView')
    ) {
      return false
    }

    if (event.ctrlKey && event.shiftKey) {
      return false // Allow layout, duplicate & tab reorder shortcuts
    }
    return true
  })

  term.onKey(({ domEvent }) => {
    if (isShortcut(domEvent, 'searchBuffer')) {
      domEvent.preventDefault()
      domEvent.stopPropagation()
      openSearch()
    }
    if (isShortcut(domEvent, 'commandPalette')) {
      domEvent.preventDefault()
      domEvent.stopPropagation()
      openPalette()
    }
  })

  term.open(terminalContainer.value)
  safeFit()

  // Setup PTY in Tauri
  const cols = term.cols && term.cols > 10 ? term.cols : 80
  const rows = term.rows && term.rows > 2 ? term.rows : 24

  try {
    // Fallback ke folder project bila cwd tersimpan kosong/tidak valid.
    const spawnCwd = props.cwd || props.projectFolder
    await createPty(props.paneId, props.shell || settings.value.defaultShell, spawnCwd, cols, rows)
    // Guard: bila pane sudah unmount selama await (tab ditutup cepat), matikan PTY yatim
    if (!terminalContainer.value || !term) {
      await killPty(props.paneId)
      return
    }
    isPtyReady.value = true

    unlistenData = await onPtyData(props.paneId, (data) => {
      term?.write(data)
      parseStreamForCwd(data)
    })

    unlistenExit = await onPtyExit(props.paneId, () => {
      isPtyExited.value = true
      // Tidak auto-restart secara agresif untuk mencegah memory exhaustion / infinite process spawn loop
    })

    // Listen to terminal title changes (Windows PowerShell often emits directory in title)
    term.onTitleChange((newTitle) => {
      const match = newTitle.match(/([A-Za-z]:\\[^\r\n]*)/)
      if (match && match[1]) {
        updateTerminalCwd(props.paneId, match[1].trim())
      }
    })

    let inputLineBuffer = ''

    // Listen to user input keystrokes & track executed commands
    term.onData((data) => {
      writePty(props.paneId, data)
      if (data === '\r' || data === '\n') {
        const cmd = inputLineBuffer.trim()
        if (cmd) {
          updateTerminalLastCommand(props.paneId, cmd)
        }
        inputLineBuffer = ''
      } else if (data === '\u007F' || data === '\b') {
        inputLineBuffer = inputLineBuffer.slice(0, -1)
      } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
        inputLineBuffer += data
      }
    })

    // Auto-run hanya initialCommand (preset). Perintah terakhir tidak dijalankan ulang;
    // hanya direktori terakhir yang dipulihkan via props.cwd.
    if (props.initialCommand) {
      const initialCommand = props.initialCommand
      setTimeout(() => {
        const formattedCmd = initialCommand.endsWith('\r') || initialCommand.endsWith('\n') ? initialCommand : `${initialCommand}\r`
        writePty(props.paneId, formattedCmd)
      }, 700)
    }
  } catch (err) {
    console.error('Failed to start PTY:', err)
    if (!isTauri.value) {
      term.writeln('\x1b[33m[MyTermin Web Mode: Simulasi Terminal Siap]\x1b[0m')
      term.writeln('\x1b[36mKetik atau pilih preset opencode / codex di toolbar atas.\x1b[0m\r\n$ ')
      term.onData((data) => {
        if (data === '\r') {
          term?.writeln('\r\n$ ')
        } else if (data === '\u007F') {
          term?.write('\b \b')
        } else {
          term?.write(data)
        }
      })
    }
  }

  // Handle Resize
  resizeObserver = new ResizeObserver(() => {
    safeFit()
  })
  resizeObserver.observe(terminalContainer.value)

  if (props.isActive) {
    term.focus()
  }
}

const restartTerminalSession = async (silent = false) => {
  if (!isTauri.value) return
  isPtyExited.value = false
  paneStats.value = null
  if (unlistenData) unlistenData()
  if (unlistenExit) unlistenExit()
  await killPty(props.paneId)

  if (term) {
    if (!silent) {
      term.reset()
    }
  }

  const cols = term?.cols && term.cols > 10 ? term.cols : 80
  const rows = term?.rows && term.rows > 2 ? term.rows : 24
  const latestCwd = terminals.value.find(t => t.id === props.paneId)?.cwd || props.cwd

  try {
    await createPty(props.paneId, props.shell || settings.value.defaultShell, latestCwd, cols, rows)
    isPtyReady.value = true

    unlistenData = await onPtyData(props.paneId, (data) => {
      term?.write(data)
      parseStreamForCwd(data)
    })

    unlistenExit = await onPtyExit(props.paneId, () => {
      isPtyExited.value = true
    })

    term?.focus()
  } catch (err) {
    console.error('Failed to restart PTY:', err)
  }
}

const clearTerminal = () => {
  term?.clear()
}

const copySelection = async () => {
  const selection = term?.getSelection()
  if (selection) {
    await copyToClipboard(selection)
  }
}

const pasteClipboard = async () => {
  try {
    // Backend mengirim bracketed paste agar OpenCode memproses text/file/image sebagai attachment.
    if (isTauri.value) {
      await pasteFromClipboard(props.paneId)
    } else {
      const text = await navigator.clipboard?.readText()
      if (text) {
        writePty(props.paneId, text)
      }
    }
  } catch (e) {
    console.error('Clipboard paste failed:', e)
  }
}

// Drag & Drop file lokal dari File Explorer langsung ke dalam terminal
const handleContainerDragOver = (e: DragEvent) => {
  e.preventDefault()
  if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
    e.dataTransfer.dropEffect = 'copy'
    isFileDraggingOver.value = true
  }
}

const handleContainerDragLeave = (e: DragEvent) => {
  const currentTarget = e.currentTarget as HTMLElement
  const relatedTarget = e.relatedTarget as HTMLElement
  if (!currentTarget || !currentTarget.contains(relatedTarget)) {
    isFileDraggingOver.value = false
  }
}

const handleContainerDrop = async (e: DragEvent) => {
  e.preventDefault()
  isFileDraggingOver.value = false
  emit('focus', props.paneId)

  if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return

  const paths: string[] = []
  for (let i = 0; i < e.dataTransfer.files.length; i++) {
    const file = e.dataTransfer.files[i] as File & { path?: string }
    // Di Electron / Tauri Webview2, object File membawa properti path absolut asli
    if (file.path) {
      paths.push(`"${file.path}"`)
    } else {
      // Fallback simpan data file ke temp directory
      try {
        const arrayBuffer = await file.arrayBuffer()
        const savedPath = await saveTempFile(new Uint8Array(arrayBuffer), file.name)
        if (savedPath) {
          paths.push(`"${savedPath}"`)
        }
      } catch (err) {
        console.error('Drop file save failed:', err)
      }
    }
  }

  if (paths.length > 0) {
    writePty(props.paneId, paths.join(' ') + ' ')
    term?.focus()
  }
}

const handleContextMenu = (e: MouseEvent) => {
  e.preventDefault()
  e.stopPropagation()
  emit('focus', props.paneId)
  const hasSel = Boolean(term?.hasSelection())
  emit('contextmenu', {
    x: e.clientX,
    y: e.clientY,
    hasSelection: hasSel,
    paneId: props.paneId
  })
}

defineExpose({
  copySelection,
  pasteClipboard,
  clearTerminal,
  openSearch,
  exportBufferToFile,
  focus: () => term?.focus()
})

const handlePaneClick = () => {
  emit('focus', props.paneId)
  term?.focus()
}

watch(
  () => props.isActive,
  (active) => {
    if (active) {
      clearTerminalAlert(props.paneId)
      nextTick(() => {
        term?.focus()
      })
    }
  }
)

watch(
  () => props.isTabActive,
  (isActive) => {
    if (isActive) {
      clearTerminalAlert(props.paneId)
      nextTick(() => {
        setTimeout(() => {
          safeFit()
          if (props.isActive) {
            term?.focus()
          }
        }, 50)
      })
    }
  }
)

watch(
  () => settings.value.theme,
  () => {
    if (term) {
      term.options.theme = currentTheme.value
    }
  }
)

watch(
  () => settings.value.fontSize,
  (newSize) => {
    if (term) {
      term.options.fontSize = newSize
      safeFit()
    }
  }
)

watch(
  () => settings.value.fontFamily,
  (newFamily) => {
    if (term && newFamily) {
      term.options.fontFamily = newFamily
      safeFit()
    }
  }
)

watch(
  () => settings.value.fontLigatures,
  (enabled) => {
    if (enabled) {
      if (!ligaturesAddon && term) {
        try {
          ligaturesAddon = new LigaturesAddon()
          term.loadAddon(ligaturesAddon)
        } catch {
          ligaturesAddon = null
        }
      }
    } else if (ligaturesAddon) {
      ligaturesAddon.dispose()
      ligaturesAddon = null
    }
  }
)

watch(
  () => settings.value.scrollback,
  (newScrollback) => {
    if (term && newScrollback) {
      term.options.scrollback = newScrollback
    }
  }
)

watch(
  () => settings.value.enableWebgl,
  (enabled) => {
    if (enabled) {
      if (!webglAddon && term) {
        try {
          webglAddon = new WebglAddon()
          webglAddon.onContextLoss(() => {
            webglAddon?.dispose()
            webglAddon = null
          })
          term.loadAddon(webglAddon)
        } catch {
          webglAddon = null
        }
      }
    } else if (webglAddon) {
      webglAddon.dispose()
      webglAddon = null
    }
  }
)

const fetchStats = async () => {
  if (!isTauri.value || !isPtyReady.value || isPtyExited.value) return
  try {
    const all = await getAllPtyStats()
    const stats = all?.[props.paneId]
    if (stats) {
      paneStats.value = stats
      const isBusy = stats.child_count > 0 || stats.cpu_usage > 5.0

      if (isBusy) {
        wasProcessBusy = true
        if (!props.isTabActive) {
          setTerminalAlert(props.paneId, 'running')
        }
      } else if (wasProcessBusy) {
        wasProcessBusy = false
        if (!props.isTabActive) {
          setTerminalAlert(props.paneId, 'completed')
        }
        // Kirim OS desktop notification jika jendela di-minimize atau tab di background
        if (settings.value.enableNotifications !== false) {
          const isBackground = !props.isTabActive || (typeof document !== 'undefined' && (document.hidden || !document.hasFocus()))
          if (isBackground) {
            sendDesktopNotification(
              'MyTermin - Proses Selesai',
              `Perintah di tab "${props.title}" telah selesai dieksekusi.`
            )
          }
        }
      }

      // Jika Rust sysinfo mendeteksi CWD proses aktif (misal opencode, node, dsb), update direktori tab
      if (stats.cwd) {
        updateTerminalCwd(props.paneId, stats.cwd)
      }
      // Jika mendeteksi subproses aktif (misal opencode, codex, vite, cargo), simpan ke lastCommand
      if (
        stats.child_count > 0 &&
        stats.process_name &&
        !['powershell.exe', 'cmd.exe', 'bash.exe', 'zsh', 'conhost.exe'].includes(stats.process_name.toLowerCase()) && ['bun', 'node', 'deno', 'python', 'python3', 'go', 'cargo', 'npm', 'pnpm', 'yarn', 'bunx', 'npx', 'pip', 'pip3', 'uv', 'java', 'dotnet', 'rustc'].indexOf(stats.process_name.toLowerCase().replace(/\.exe$/i, '')) === -1
      ) {
        const procClean = stats.process_name.replace(/\.exe$/i, '')
        updateTerminalLastCommand(props.paneId, procClean)
      }
    }
  } catch (e) {
    // Silent
  }
}

const handleTerminalAction = (e: any) => {
  const act = e?.detail
  if (act === 'search') openSearch()
  else if (act === 'export') exportBufferToFile()
  else if (act === 'clear') clearTerminal()
}

// Terminal Font Zoom (Ctrl + Wheel / Ctrl + = / Ctrl + - / Ctrl + 0)
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 32

const applyFontSize = (size: number) => {
  const clamped = Math.min(Math.max(Math.round(size), MIN_FONT_SIZE), MAX_FONT_SIZE)
  if (clamped === settings.value.fontSize) return
  updateSettings({ fontSize: clamped })
}

const zoomIn = () => applyFontSize((settings.value.fontSize || 14) + 1)
const zoomOut = () => applyFontSize((settings.value.fontSize || 14) - 1)
const zoomReset = () => applyFontSize(14)

const handleWheelZoom = (e: WheelEvent) => {
  if (!e.ctrlKey) return
  e.preventDefault()
  e.stopPropagation()
  if (e.deltaY < 0) {
    zoomIn()
  } else if (e.deltaY > 0) {
    zoomOut()
  }
}

onMounted(() => {
  nextTick(() => {
    initTerminal()
  })
  if (isTauri.value) {
    statsInterval = setInterval(fetchStats, 2000)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener(`terminal-action-${props.paneId}`, handleTerminalAction)
  }
  nextTick(() => {
    terminalContainer.value?.addEventListener('wheel', handleWheelZoom, { passive: false })
  })
})

onBeforeUnmount(async () => {
  if (typeof window !== 'undefined') {
    window.removeEventListener(`terminal-action-${props.paneId}`, handleTerminalAction)
  }
  terminalContainer.value?.removeEventListener('wheel', handleWheelZoom)
  if (statsInterval) clearInterval(statsInterval)
  resizeObserver?.disconnect()
  if (unlistenData) unlistenData()
  if (unlistenExit) unlistenExit()
  ligaturesAddon?.dispose()
  ligaturesAddon = null
  webglAddon?.dispose()
  webglAddon = null
  await killPty(props.paneId)
  term?.dispose()
})
</script>

<template>
  <div
    :class="[
      'flex flex-col h-full w-full bg-[#12131a] rounded-lg border overflow-hidden transition-all duration-200 relative group',
      isActive ? 'border-primary ring-1 ring-primary/40' : 'border-border/60 hover:border-border'
    ]"
    @click="handlePaneClick"
    @contextmenu="handleContextMenu"
  >
    <!-- Pane Sub-Header -->
    <div class="flex items-center justify-between px-3 py-1.5 bg-[#171822] border-b border-border/40 select-none text-xs flex-shrink-0">
      <div class="flex items-center gap-2">
        <AppLogo :size="14" class="flex-shrink-0" />

        <!-- Editable Title or Text -->
        <div v-if="isEditingTitle" class="flex items-center gap-1" @click.stop>
          <input
            :id="`pane-title-input-${props.paneId}`"
            v-model="newPaneTitle"
            type="text"
            class="px-1.5 py-0.5 text-xs bg-background border border-primary rounded text-foreground outline-none w-32"
            @keydown.enter="finishRename"
            @blur="finishRename"
          />
          <button class="text-emerald-400 hover:text-emerald-300" @click.stop="finishRename">
            <Check class="w-3 h-3" />
          </button>
        </div>
        <div
          v-else
          class="flex items-center gap-1.5 cursor-pointer"
          title="Double-click to rename"
          @dblclick.stop="startRename"
        >
          <span class="font-medium text-foreground/90 tracking-wide">{{ title }}</span>
          <button
            class="opacity-0 group-hover:opacity-100 hover:text-foreground text-muted-foreground p-0.5 rounded transition-opacity"
            title="Rename Pane"
            @click.stop="startRename"
          >
            <Pencil class="w-2.5 h-2.5" />
          </button>
        </div>

        <!-- Process Status Badge -->
        <div v-if="isTauri && paneStats" class="flex items-center gap-1.5 pl-1">
          <!-- Status Dot -->
          <div
            :class="[
              'w-2 h-2 rounded-full transition-all duration-300',
              isPtyExited
                ? 'bg-rose-500 shadow-sm shadow-rose-500/50'
                : (paneStats.cpu_usage > 2.0 || paneStats.child_count > 0)
                  ? 'bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50'
                  : 'bg-slate-500/60'
            ]"
            :title="isPtyExited ? 'Process Completed' : (paneStats.cpu_usage > 2.0 || paneStats.child_count > 0) ? 'Active Workload' : 'Idle'"
          />

          <!-- Process Name -->
          <div
            v-if="!isPtyExited"
            class="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground bg-background/40 px-1.5 py-0.5 rounded border border-border/30"
          >
            <span class="text-foreground/80 font-medium truncate max-w-[100px]" :title="paneStats.process_name">
              {{ paneStats.process_name }}
            </span>
          </div>
          <button
            v-else
            class="flex items-center gap-1 text-[10px] text-rose-300 font-mono bg-rose-950/60 hover:bg-rose-900/80 px-2 py-0.5 rounded border border-rose-800/60 transition-colors cursor-pointer"
            title="Klik untuk memulai ulang sesi terminal"
            @click.stop="restartTerminalSession()"
          >
            <RotateCcw class="w-2.5 h-2.5" />
            <span>Restart</span>
          </button>
        </div>

        <!-- Selisih cwd: terminal tidak berada di folder project -->
        <button
          v-if="isTauri && !isPtyExited && isCwdMismatch"
          class="flex items-center gap-1 text-[10px] font-mono text-amber-300 bg-amber-950/60 hover:bg-amber-900/80 px-2 py-0.5 rounded border border-amber-800/70 transition-colors cursor-pointer flex-shrink-0"
          :title="`Terminal di ${effectiveCwd} — klik untuk masuk ke folder project (${projectFolder})`"
          @click.stop="goToProjectFolder()"
        >
          <FolderInput class="w-2.5 h-2.5" />
          <span class="max-w-[110px] truncate">cd project</span>
        </button>
      </div>

      <!-- Pane Controls -->
      <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
        <!-- Quick Action Dropdown -->
        <div class="relative">
          <UiButton
            variant="ghost"
            size="icon"
            class="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Quick Action"
            @click.stop="showQuickCommands = !showQuickCommands"
          >
            <Play class="w-3 h-3 text-emerald-400" />
          </UiButton>

          <div
            v-if="showQuickCommands"
            class="absolute right-0 top-7 z-30 w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl animate-in fade-in zoom-in-95"
            @click.stop
          >
            <div class="text-[10px] font-semibold px-2 py-1 text-muted-foreground border-b border-border/40 flex items-center justify-between">
              <span>Quick Run CLI</span>
              <span class="text-[9px] opacity-70 font-mono">Customizable</span>
            </div>
            <div class="max-h-56 overflow-y-auto py-1">
              <button
                v-for="action in dynamicQuickActions"
                :key="action.id"
                class="w-full text-left px-2 py-1.5 text-xs rounded-sm hover:bg-accent hover:text-accent-foreground flex items-center justify-between transition-colors cursor-pointer group/btn"
                @click="executeCommand(action.command)"
              >
                <span class="font-medium truncate">{{ action.label }}</span>
                <span class="text-[9px] text-muted-foreground font-mono opacity-0 group-hover/btn:opacity-80 truncate max-w-[70px] ml-1">{{ action.command }}</span>
              </button>
            </div>
          </div>
        </div>

        <UiButton
          variant="ghost"
          size="icon"
          class="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="Cari di Buffer (Ctrl+F)"
          @click.stop="openSearch"
        >
          <Search class="w-3 h-3 text-sky-400" />
        </UiButton>

        <UiButton
          variant="ghost"
          size="icon"
          class="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="Export Log ke File (.txt)"
          @click.stop="exportBufferToFile"
        >
          <Download class="w-3 h-3 text-teal-400" />
        </UiButton>

        <UiButton
          variant="ghost"
          size="icon"
          class="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="Clear Buffer"
          @click.stop="clearTerminal"
        >
          <Trash2 class="w-3 h-3" />
        </UiButton>
      </div>
    </div>

    <!-- Terminal Container with File Drag-and-Drop Support -->
    <div
      ref="terminalContainer"
      class="flex-1 w-full min-h-0 overflow-hidden bg-[#1a1b26] relative"
      :style="{ opacity: settings.opacity }"
      @dragover="handleContainerDragOver"
      @dragleave="handleContainerDragLeave"
      @drop="handleContainerDrop"
    >
      <!-- Floating Search Bar (Ctrl+F) -->
      <div
        v-if="isSearchOpen"
        class="absolute top-2 right-4 z-40 flex items-center gap-1.5 bg-[#151622]/95 backdrop-blur-md border border-border/80 rounded-lg px-2.5 py-1.5 shadow-2xl animate-in fade-in zoom-in-95 text-xs select-none"
        @click.stop
      >
        <Search class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <input
          :id="`search-input-${props.paneId}`"
          v-model="searchQuery"
          type="text"
          placeholder="Cari... (Enter / Shift+Enter)"
          :class="[
            'bg-background border rounded px-2 py-0.5 text-xs text-foreground outline-none w-48 font-mono transition-colors',
            searchFound === false ? 'border-rose-500 text-rose-300' : 'border-border focus:border-primary'
          ]"
          @input="onSearchInput"
          @keydown.enter.exact.prevent="searchNext"
          @keydown.shift.enter.exact.prevent="searchPrev"
          @keydown.esc.prevent="closeSearch"
        />

        <button
          class="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Match Sebelumnya (Shift+Enter)"
          @click.stop="searchPrev"
        >
          <ArrowUp class="w-3.5 h-3.5" />
        </button>

        <button
          class="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Match Berikutnya (Enter)"
          @click.stop="searchNext"
        >
          <ArrowDown class="w-3.5 h-3.5" />
        </button>

        <button
          :class="[
            'px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors',
            searchMatchCase ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-accent text-muted-foreground hover:text-foreground'
          ]"
          title="Match Case (Aa)"
          @click.stop="searchMatchCase = !searchMatchCase; onSearchInput()"
        >
          Aa
        </button>

        <button
          class="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors ml-1"
          title="Tutup Pencarian (Esc)"
          @click.stop="closeSearch"
        >
          <X class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Drop File Visual Overlay -->
      <div
        v-if="isFileDraggingOver"
        class="absolute inset-0 bg-primary/20 backdrop-blur-[2px] border-2 border-dashed border-primary flex flex-col items-center justify-center gap-2 z-30 pointer-events-none"
      >
        <div class="p-3 bg-[#12131a] rounded-full border border-primary/50 shadow-xl animate-bounce">
          <AppLogo :size="24" />
        </div>
        <span class="text-xs font-semibold text-white tracking-wide bg-[#12131a]/90 px-3 py-1 rounded-full border border-border">
          Lepaskan file untuk menyisipkan path ke terminal
        </span>
      </div>
        </div>
  </div>
</template>                                                                                                                                                                                                                                                                                                                             

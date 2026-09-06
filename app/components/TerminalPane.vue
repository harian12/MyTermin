<script setup lang="ts">
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import {
  Trash2,
  Play,
  Pencil,
  Check,
  Activity,
  Cpu,
  RotateCcw
} from 'lucide-vue-next'
import { TERMINAL_THEMES } from '~/composables/useThemes'
import type { PtyStats } from '~/types/terminal'

interface Props {
  paneId: string
  title: string
  isActive: boolean
  shell?: string
  cwd?: string
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
const { settings } = useSettingsStore()
const { terminals, renameTerminal, updateTerminalCwd, updateTerminalLastCommand } = useWorkspaceStore()
const { togglePalette, openPalette } = useCommandPalette()

let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let searchAddon: SearchAddon | null = null
let unlistenData: (() => void) | null = null
let unlistenExit: (() => void) | null = null
let resizeObserver: ResizeObserver | null = null
let statsInterval: any = null

const isPtyReady = ref(false)
const isPtyExited = ref(false)
const showQuickCommands = ref(false)
const isEditingTitle = ref(false)
const newPaneTitle = ref(props.title)
const paneStats = ref<PtyStats | null>(null)
const isFileDraggingOver = ref(false)

const currentTheme = computed(() => {
  return TERMINAL_THEMES[settings.value.theme]?.theme || TERMINAL_THEMES.tokyoNight.theme
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

const initTerminal = async () => {
  if (!terminalContainer.value) return

  term = new Terminal({
    fontSize: settings.value.fontSize,
    fontFamily: settings.value.fontFamily,
    cursorStyle: settings.value.cursorStyle,
    cursorBlink: settings.value.cursorBlink,
    theme: currentTheme.value,
    allowProposedApi: true,
    smoothScrollDuration: 0,
    convertEol: false,
    windowsMode: true
  })

  fitAddon = new FitAddon()
  searchAddon = new SearchAddon()
  const webLinksAddon = new WebLinksAddon()

  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)
  term.loadAddon(webLinksAddon)

  // Forward critical shortcuts (Ctrl+C selection copy, Ctrl+Tab, Ctrl+T, Ctrl+W, Ctrl+K, etc.)
  term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
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

    if (event.ctrlKey && (event.key === 'k' || event.key === 'K' || event.code === 'KeyK' || event.keyCode === 75)) {
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
    if (event.ctrlKey && (event.key === 't' || event.key === 'T')) {
      return false // Allow Ctrl+T
    }
    if (event.ctrlKey && (event.key === 'w' || event.key === 'W')) {
      return false // Allow Ctrl+W (Close Tab)
    }
    if (event.ctrlKey && event.shiftKey) {
      return false // Allow layout, duplicate & tab reorder shortcuts
    }
    return true
  })

  term.onKey(({ domEvent }) => {
    if (domEvent.ctrlKey && (domEvent.key === 'k' || domEvent.key === 'K' || domEvent.code === 'KeyK' || domEvent.keyCode === 75)) {
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
    await createPty(props.paneId, props.shell || settings.value.defaultShell, props.cwd, cols, rows)
    isPtyReady.value = true

    unlistenData = await onPtyData(props.paneId, (data) => {
      term?.write(data)

      // Strip ANSI escape sequences to accurately read directory prompt
      const cleanData = data.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')

      // Detect current working directory from terminal prompts
      // Windows PowerShell: PS D:\ or PS C:\Users\USER\project>
      // Windows CMD: D:\> or C:\Users\USER>
      const psMatch = cleanData.match(/PS\s+([A-Za-z]:\\[^>\r\n]*)/)
      if (psMatch && psMatch[1]) {
        const detected = psMatch[1].trim()
        if (detected.length >= 2) {
          updateTerminalCwd(props.paneId, detected)
        }
      } else {
        const cmdMatch = cleanData.match(/(?:^|\r|\n)\s*([A-Za-z]:\\[^>\r\n]*)/)
        if (cmdMatch && cmdMatch[1]) {
          const detected = cmdMatch[1].trim()
          if (detected.length >= 2) {
            updateTerminalCwd(props.paneId, detected)
          }
        }
      }
    })

    unlistenExit = await onPtyExit(props.paneId, () => {
      // Auto-restart shell seketika agar terminal selalu siap dipakai
      setTimeout(() => {
        restartTerminalSession(false)
      }, 100)
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
      setTimeout(() => {
        const formattedCmd = props.initialCommand.endsWith('\r') || props.initialCommand.endsWith('\n') ? props.initialCommand : `${props.initialCommand}\r`
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
      const cleanData = data.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
      const psMatch = cleanData.match(/PS\s+([A-Za-z]:\\[^>\r\n]*)/)
      if (psMatch && psMatch[1]) {
        const detected = psMatch[1].trim()
        if (detected.length >= 2) updateTerminalCwd(props.paneId, detected)
      } else {
        const cmdMatch = cleanData.match(/(?:^|\r|\n)\s*([A-Za-z]:\\[^>\r\n]*)/)
        if (cmdMatch && cmdMatch[1]) {
          const detected = cmdMatch[1].trim()
          if (detected.length >= 2) updateTerminalCwd(props.paneId, detected)
        }
      }
    })

    unlistenExit = await onPtyExit(props.paneId, () => {
      setTimeout(() => {
        restartTerminalSession(false)
      }, 100)
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

const fetchStats = async () => {
  if (!isTauri.value || !isPtyReady.value || isPtyExited.value) return
  try {
    const all = await getAllPtyStats()
    if (all && all[props.paneId]) {
      paneStats.value = all[props.paneId]
      // Jika Rust sysinfo mendeteksi CWD proses aktif (misal opencode, node, dsb), update direktori tab
      if (paneStats.value.cwd) {
        updateTerminalCwd(props.paneId, paneStats.value.cwd)
      }
      // Jika mendeteksi subproses aktif (misal opencode, codex, vite, cargo), simpan ke lastCommand
      if (
        paneStats.value.child_count > 0 &&
        paneStats.value.process_name &&
        !['powershell.exe', 'cmd.exe', 'bash.exe', 'zsh', 'conhost.exe'].includes(paneStats.value.process_name.toLowerCase()) && ['bun', 'node', 'deno', 'python', 'python3', 'go', 'cargo', 'npm', 'pnpm', 'yarn', 'bunx', 'npx', 'pip', 'pip3', 'uv', 'java', 'dotnet', 'rustc'].indexOf(paneStats.value.process_name.toLowerCase().replace(/\.exe$/i, '')) === -1
      ) {
        const procClean = paneStats.value.process_name.replace(/\.exe$/i, '')
        updateTerminalLastCommand(props.paneId, procClean)
      }
    }
  } catch (e) {
    // Silent
  }
}

onMounted(() => {
  nextTick(() => {
    initTerminal()
  })
  if (isTauri.value) {
    statsInterval = setInterval(fetchStats, 2000)
  }
})

onBeforeUnmount(async () => {
  if (statsInterval) clearInterval(statsInterval)
  resizeObserver?.disconnect()
  if (unlistenData) unlistenData()
  if (unlistenExit) unlistenExit()
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

        <!-- Process & Health Monitor Badge -->
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

          <!-- Process Name & Live Metrics -->
          <div
            v-if="!isPtyExited"
            class="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground bg-background/40 px-1.5 py-0.5 rounded border border-border/30"
          >
            <span class="text-foreground/80 font-medium truncate max-w-[80px]" :title="paneStats.process_name">
              {{ paneStats.process_name }}
            </span>
            <span :class="paneStats.cpu_usage > 15 ? 'text-amber-400 font-semibold' : 'text-muted-foreground/80'">
              {{ paneStats.cpu_usage }}%
            </span>
            <span class="opacity-40">|</span>
            <span class="text-muted-foreground/80">
              {{ paneStats.memory_mb }}MB
            </span>
          </div>
          <button
            v-else
            class="flex items-center gap-1 text-[10px] text-rose-300 font-mono bg-rose-950/60 hover:bg-rose-900/80 px-2 py-0.5 rounded border border-rose-800/60 transition-colors cursor-pointer"
            title="Klik untuk memulai ulang sesi terminal"
            @click.stop="restartTerminalSession"
          >
            <RotateCcw class="w-2.5 h-2.5" />
            <span>Restart</span>
          </button>
        </div>
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
</template>
        !['powershell.exe', 'cmd.exe', 'bash.exe                                                                                                                                                                                                                                                                                                                             

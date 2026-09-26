<script setup lang="ts">
import {
  Search,
  Terminal as TerminalIcon,
  LayoutGrid,
  Columns2,
  Rows2,
  Square,
  Sparkles,
  Settings,
  Plus,
  Trash2,
  Copy,
  Folder,
  FolderKanban,
  Palette,
  Play,
  RotateCcw,
  Save,
  Check,
  BookmarkPlus,
  Download,
  AppWindow,
  ListTodo,
  Search as SearchIcon
} from 'lucide-vue-next'
import { TERMINAL_THEMES } from '~/composables/useThemes'

const emit = defineEmits<{
  (e: 'open-settings'): void
  (e: 'open-presets'): void
}>()

const {
  workstations,
  activeWorkstationId,
  switchWorkstation,
  addWorkstation,
  terminals,
  activeTerminalId,
  currentLayout,
  presets,
  addTerminal,
  duplicateTerminal,
  removeTerminal,
  setLayout,
  applyPreset,
  saveSession,
  clearSavedSession
} = useWorkspaceStore()

const { isOpen, closePalette } = useCommandPalette()
const { settings, updateSettings } = useSettingsStore()
const { writePty, isTauri } = useTauriPty()

const searchQuery = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listContainerRef = ref<HTMLElement | null>(null)

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  category: 'Workstations' | 'Tabs' | 'Layout' | 'Quick Commands' | 'Themes' | 'Presets' | 'System'
  icon: any
  action: () => void
}

const allCommands = computed<CommandItem[]>(() => {
  const list: CommandItem[] = []

  // 0. Workstations
  workstations.value.forEach((ws) => {
    list.push({
      id: `ws-${ws.id}`,
      title: `Switch Workstation: ${ws.name}`,
      subtitle: `${ws.terminals.length} Terminal (${ws.layout}) ${ws.id === activeWorkstationId.value ? '• Active' : ''}`,
      category: 'Workstations',
      icon: FolderKanban,
      action: () => {
        switchWorkstation(ws.id)
      }
    })
  })

  list.push({
    id: 'ws-new',
    title: 'New Workstation',
    subtitle: 'Buat workstation / ruang kerja baru',
    category: 'Workstations',
    icon: Plus,
    action: () => {
      addWorkstation()
    }
  })

  list.push({
    id: 'ws-open-blank-window',
    title: 'Open New Blank Window',
    subtitle: 'Buka instance aplikasi baru dengan workstation kosong',
    category: 'Workstations',
    icon: AppWindow,
    action: async () => {
      if (isTauri.value) {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke('open_new_window', { blank: true })
        } catch (e) {
          console.error('Failed to open new blank window:', e)
        }
      } else {
        window.open(window.location.origin, '_blank')
      }
    }
  })

  // 1. Terminal Tabs Navigation
  terminals.value.forEach((term, idx) => {
    list.push({
      id: `tab-${term.id}`,
      title: `Switch to: ${term.title}`,
      subtitle: term.cwd || (term.id === activeTerminalId.value ? 'Currently Active' : `Tab #${idx + 1}`),
      category: 'Tabs',
      icon: TerminalIcon,
      action: () => {
        activeTerminalId.value = term.id
      }
    })
  })

  list.push(
    {
      id: 'tab-new',
      title: 'New Terminal Tab',
      subtitle: 'Ctrl+T - Buka sesi shell baru',
      category: 'Tabs',
      icon: Plus,
      action: () => addTerminal()
    },
    {
      id: 'tab-duplicate',
      title: 'Duplicate Current Tab',
      subtitle: 'Ctrl+Shift+D - Duplikat direktori aktif',
      category: 'Tabs',
      icon: Copy,
      action: () => duplicateTerminal()
    },
    {
      id: 'tab-close',
      title: 'Close Active Tab',
      subtitle: 'Ctrl+W - Tutup sesi terminal ini',
      category: 'Tabs',
      icon: Trash2,
      action: () => {
        if (activeTerminalId.value) removeTerminal(activeTerminalId.value)
      }
    },
    {
      id: 'term-search',
      title: 'Find in Terminal Buffer',
      subtitle: 'Ctrl+F - Buka pencarian teks pada terminal aktif',
      category: 'Tabs',
      icon: Search,
      action: () => {
        if (activeTerminalId.value && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(`terminal-action-${activeTerminalId.value}`, { detail: 'search' }))
        }
      }
    },
    {
      id: 'term-export',
      title: 'Export Terminal Log to File',
      subtitle: 'Unduh seluruh buffer log terminal aktif (.txt)',
      category: 'Tabs',
      icon: Download,
      action: () => {
        if (activeTerminalId.value && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(`terminal-action-${activeTerminalId.value}`, { detail: 'export' }))
        }
      }
    }
  )

  // 2. Layouts
  list.push(
    {
      id: 'layout-grid',
      title: 'Layout: 4-Grid (2x2 Matrix)',
      subtitle: 'Ctrl+Shift+G - Tampilkan 4 panel serentak',
      category: 'Layout',
      icon: LayoutGrid,
      action: () => setLayout('grid-2x2')
    },
    {
      id: 'layout-split-h',
      title: 'Layout: Split Horizontal (2 Columns)',
      subtitle: 'Ctrl+Shift+E - Tampilkan 2 panel berdampingan',
      category: 'Layout',
      icon: Columns2,
      action: () => setLayout('split-h')
    },
    {
      id: 'layout-split-v',
      title: 'Layout: Split Vertical (2 Rows)',
      subtitle: 'Ctrl+Shift+O - Tampilkan 2 panel atas & bawah',
      category: 'Layout',
      icon: Rows2,
      action: () => setLayout('split-v')
    },
    {
      id: 'layout-single',
      title: 'Layout: Single Panel Fullscreen',
      subtitle: 'Ctrl+Shift+S - Fokus penuh pada 1 panel',
      category: 'Layout',
      icon: Square,
      action: () => setLayout('single')
    }
  )

  // 3. Quick Run Commands
  const quicks = settings.value.quickCommands || []
  quicks.forEach((q) => {
    list.push({
      id: `quick-${q.id}`,
      title: `Run: ${q.label}`,
      subtitle: `Command: ${q.command}`,
      category: 'Quick Commands',
      icon: Play,
      action: () => {
        if (activeTerminalId.value) {
          const cmd = q.command.endsWith('\r') || q.command.endsWith('\n') ? q.command : q.command + '\r'
          writePty(activeTerminalId.value, cmd)
        }
      }
    })
  })

  // 4. Presets & Actions
  list.push(
    {
      id: 'preset-modal',
      title: 'Open Presets Workspace',
      subtitle: 'Pilih preset OpenCode, Codex AI, atau Fullstack',
      category: 'Presets',
      icon: Sparkles,
      action: () => emit('open-presets')
    }
  )

  // Tambahkan semua preset (custom & built-in) ke list command
  presets.value.forEach((p) => {
    list.push({
      id: `apply-preset-${p.id}`,
      title: `Preset: ${p.name}`,
      subtitle: `${p.isCustom ? '[Custom] ' : ''}${p.description} (${p.layout})`,
      category: 'Presets',
      icon: p.isCustom ? BookmarkPlus : Sparkles,
      action: () => applyPreset(p)
    })
  })

  list.push(
    {
      id: 'save-session',
      title: 'Save Current Session',
      subtitle: 'Simpan snapshot semua tab, layout & folder kerja',
      category: 'System',
      icon: Save,
      action: () => saveSession(true)
    },
    {
      id: 'open-settings',
      title: 'Open Terminal Settings',
      subtitle: 'Font, shell, theme, quick commands config',
      category: 'System',
      icon: Settings,
      action: () => emit('open-settings')
    },
    {
      id: 'toggle-task-panel',
      title: 'Toggle Panel Tasks',
      subtitle: `${normalizeShortcut(settings.value.keybindings?.taskPanel || 'Ctrl+Shift+M')} - Task dari package.json / Makefile / justfile`,
      category: 'System',
      icon: ListTodo,
      action: () => {
        const open = useState<boolean>('layout-task-panel-open', () => false)
        open.value = !open.value
      }
    },
    {
      id: 'unified-search',
      title: 'Unified Search',
      subtitle: `${normalizeShortcut(settings.value.keybindings?.unifiedSearch || 'Ctrl+Shift+U')} - Cari di buffer terminal & file project`,
      category: 'System',
      icon: SearchIcon,
      action: () => {
        const open = useState<boolean>('layout-unified-search-open', () => false)
        open.value = true
      }
    }
  )

  // 5. Themes Quick Switch
  Object.keys(TERMINAL_THEMES).forEach((tKey) => {
    const t = TERMINAL_THEMES[tKey]
    if (!t) return
    list.push({
      id: `theme-${tKey}`,
      title: `Theme: ${t.name}`,
      subtitle: settings.value.theme === tKey ? 'Active Theme' : 'Ganti palet warna terminal',
      category: 'Themes',
      icon: Palette,
      action: () => updateSettings({ theme: tKey })
    })
  })

  return list
})

const filteredCommands = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return allCommands.value

  return allCommands.value.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
      c.category.toLowerCase().includes(q)
  )
})

watch(
  () => isOpen.value,
  (val) => {
    if (val) {
      searchQuery.value = ''
      selectedIndex.value = 0
      nextTick(() => {
        setTimeout(() => {
          inputRef.value?.focus()
        }, 50)
      })
    }
  }
)

watch(searchQuery, () => {
  selectedIndex.value = 0
})

watch(selectedIndex, (newIdx) => {
  nextTick(() => {
    if (!listContainerRef.value) return
    const items = listContainerRef.value.querySelectorAll('[data-palette-item]')
    const targetItem = items[newIdx] as HTMLElement
    if (targetItem) {
      targetItem.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    }
  })
})

const handleKeyDown = (e: KeyboardEvent) => {
  if (!isOpen.value) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (filteredCommands.value.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % filteredCommands.value.length
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (filteredCommands.value.length > 0) {
      selectedIndex.value =
        (selectedIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    executeSelected()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closePalette()
  }
}

const executeSelected = () => {
  const item = filteredCommands.value[selectedIndex.value]
  if (item) {
    closePalette()
    item.action()
  }
}

const selectItem = (idx: number) => {
  selectedIndex.value = idx
  executeSelected()
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[100] flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
    @click="closePalette"
  >
    <div
      class="w-full max-w-xl bg-[#14151f] border border-border/80 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
      @click.stop
      @keydown="handleKeyDown"
    >
      <!-- Search Input Header -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-border/60 bg-[#181926]">
        <Search class="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input
          ref="inputRef"
          v-model="searchQuery"
          type="text"
          placeholder="Type a command, tab, layout, or quick action... (e.g. opencode, grid, theme)"
          class="flex-1 bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground outline-none font-medium"
        />
        <kbd class="px-2 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-muted-foreground border border-border/40">
          ESC to close
        </kbd>
      </div>

      <!-- Command List View -->
      <div ref="listContainerRef" class="max-h-80 overflow-y-auto p-1.5 space-y-1">
        <div v-if="filteredCommands.length === 0" class="p-6 text-center text-xs text-muted-foreground">
          No matching commands found for "{{ searchQuery }}"
        </div>

        <template v-else>
          <div
            v-for="(cmd, idx) in filteredCommands"
            :key="cmd.id"
            data-palette-item
            :class="[
              'flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors',
              selectedIndex === idx
                ? 'bg-primary/20 text-white border border-primary/40'
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground border border-transparent'
            ]"
            @mouseenter="selectedIndex = idx"
            @click="selectItem(idx)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <component
                :is="cmd.icon"
                :class="[
                  'w-4 h-4 flex-shrink-0',
                  selectedIndex === idx ? 'text-white' : 'text-muted-foreground'
                ]"
              />
              <div class="flex flex-col min-w-0">
                <span class="font-medium truncate text-foreground/90">{{ cmd.title }}</span>
                <span v-if="cmd.subtitle" class="text-[10px] text-muted-foreground truncate">{{ cmd.subtitle }}</span>
              </div>
            </div>

            <span
              :class="[
                'text-[10px] px-1.5 py-0.5 rounded uppercase font-mono flex-shrink-0',
                selectedIndex === idx
                  ? 'bg-primary/30 text-white font-semibold'
                  : 'bg-muted/40 text-muted-foreground'
              ]"
            >
              {{ cmd.category }}
            </span>
          </div>
        </template>
      </div>

      <!-- Footer Quick Tips -->
      <div class="flex items-center justify-between px-4 py-2 bg-[#101118] border-t border-border/40 text-[11px] text-muted-foreground select-none">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <kbd class="bg-muted px-1.5 py-0.5 rounded text-[10px] text-foreground font-mono">↑↓</kbd> Navigate
          </span>
          <span class="flex items-center gap-1">
            <kbd class="bg-muted px-1.5 py-0.5 rounded text-[10px] text-foreground font-mono">↵</kbd> Select
          </span>
        </div>
        <span class="font-mono text-[10px] opacity-70">MyTermin Command Palette</span>
      </div>
    </div>
  </div>
</template>

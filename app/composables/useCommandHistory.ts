import type { CommandHistoryEntry } from '~/types/terminal'
import { isRecordable, clipCommand, recordInto } from '~/utils/commandHistory'

const STORAGE_KEY = 'mytermin_command_history_v1'

export const useCommandHistory = () => {
  const entries = useState<CommandHistoryEntry[]>('command-history-entries', () => [])
  const isPaletteOpen = useState<boolean>('command-history-palette-open', () => false)

  const initFromStorage = () => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        entries.value = JSON.parse(raw)
      }
    } catch (e) {
      console.error('Failed to load command history:', e)
    }
  }

  const saveToStorage = () => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
    } catch (e) {
      console.error('Failed to save command history:', e)
    }
  }

  const recordCommand = (cmd: string, cwd?: string, shell?: string) => {
    if (!isRecordable(cmd)) return

    const safeCmd = clipCommand(cmd)
    
    // Resolve cwd if not provided
    let safeCwd = cwd
    if (!safeCwd) {
      const { activeWorkstation } = useWorkspaceStore()
      safeCwd = activeWorkstation.value.folderPath || ''
    }

    entries.value = recordInto(entries.value, { cmd: safeCmd, cwd: safeCwd, shell })
    saveToStorage()
  }

  const clearHistory = () => {
    entries.value = []
    saveToStorage()
  }

  const removeEntry = (id: string) => {
    entries.value = entries.value.filter(e => e.id !== id)
    saveToStorage()
  }

  const openPalette = () => {
    isPaletteOpen.value = true
  }

  const closePalette = () => {
    isPaletteOpen.value = false
  }

  const togglePalette = () => {
    isPaletteOpen.value = !isPaletteOpen.value
  }

  // Load immediately if called on client
  if (typeof window !== 'undefined' && entries.value.length === 0) {
    initFromStorage()
  }

  return {
    entries,
    isPaletteOpen,
    recordCommand,
    clearHistory,
    removeEntry,
    openPalette,
    closePalette,
    togglePalette
  }
}

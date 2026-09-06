import type { TerminalSettings, QuickCommand } from '~/types/terminal'

const SETTINGS_KEY = 'mytermin_settings_v1'

export const DEFAULT_QUICK_COMMANDS: QuickCommand[] = [
  { id: '1', label: 'Run OpenCode', command: 'opencode' },
  { id: '2', label: 'Run Codex', command: 'codex' },
  { id: '3', label: 'bun run dev', command: 'bun run dev' },
  { id: '4', label: 'npm run dev', command: 'npm run dev' },
  { id: '5', label: 'git status', command: 'git status' },
  { id: '6', label: 'Clear Screen', command: 'clear' }
]

const defaultSettings: TerminalSettings = {
   fontSize: 14,
   fontFamily: 'Cascadia Code, Consolas, "Courier New", monospace',
   cursorStyle: 'bar',
   cursorBlink: true,
   theme: 'tokyoNight',
   defaultShell: 'powershell.exe',
   opacity: 0.95,
   autoRestoreSession: true,
   quickCommands: DEFAULT_QUICK_COMMANDS,
   startupPresetIds: []
 }

export const useSettingsStore = () => {
  const settings = useState<TerminalSettings>('terminal-settings', () => defaultSettings)

  const initSettings = () => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        settings.value = {
          ...defaultSettings,
          ...parsed,
          quickCommands: parsed.quickCommands && parsed.quickCommands.length > 0
            ? parsed.quickCommands
            : DEFAULT_QUICK_COMMANDS
        }
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  const updateSettings = (newSettings: Partial<TerminalSettings>) => {
    settings.value = { ...settings.value, ...newSettings }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings.value))
      } catch (e) {
        console.error('Failed to save settings:', e)
      }
    }
  }


  const addQuickCommand = (label: string, command: string) => {
    const list = settings.value.quickCommands || DEFAULT_QUICK_COMMANDS
    const newItem: QuickCommand = {
      id: Date.now().toString(),
      label: label.trim(),
      command: command.trim()
    }
    updateSettings({ quickCommands: [...list, newItem] })
  }

  const removeQuickCommand = (id: string) => {
    const list = settings.value.quickCommands || DEFAULT_QUICK_COMMANDS
    updateSettings({ quickCommands: list.filter(item => item.id !== id) })
  }

  const resetQuickCommands = () => {
    updateSettings({ quickCommands: [...DEFAULT_QUICK_COMMANDS] })
  }

  return {
    settings,
    initSettings,
    updateSettings,
    addQuickCommand,
    removeQuickCommand,
    resetQuickCommands
  }
}

import { type TerminalSettings, type QuickCommand, type KeybindingConfig, DEFAULT_KEYBINDINGS } from '~/types/terminal'

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
  fontLigatures: true,
  cursorStyle: 'bar',
  cursorBlink: true,
  theme: 'tokyoNight',
  defaultShell: 'powershell.exe',
  opacity: 0.95,
  scrollback: 5000,
  enableWebgl: true,
  enableNotifications: true,
  keybindings: { ...DEFAULT_KEYBINDINGS },
  autoRestoreSession: true,
  quickCommands: DEFAULT_QUICK_COMMANDS,
  startupPresetIds: []
}

export const matchesShortcut = (e: KeyboardEvent, shortcut: string): boolean => {
  if (!shortcut) return false
  const parts = shortcut.toLowerCase().split('+').map(s => s.trim())
  const hasCtrl = parts.includes('ctrl') || parts.includes('control')
  const hasShift = parts.includes('shift')
  const hasAlt = parts.includes('alt')

  if (e.ctrlKey !== hasCtrl) return false
  if (e.shiftKey !== hasShift) return false
  if (e.altKey !== hasAlt) return false

  const keyPart = parts.find(p => !['ctrl', 'control', 'shift', 'alt', 'meta', 'command'].includes(p))
  if (!keyPart) return false

  const eventKey = e.key.toLowerCase()
  if (eventKey === keyPart) return true
  if (keyPart.length === 1 && e.code.toLowerCase() === `key${keyPart}`) return true
  if (keyPart === 'space' && eventKey === ' ') return true
  if (keyPart === 'tab' && eventKey === 'tab') return true
  if (keyPart === 'esc' && eventKey === 'escape') return true

  return false
}

export const requestDesktopNotification = async () => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch {
        // Silent
      }
    }
  }
}

export const sendDesktopNotification = (title: string, body: string) => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/icons/icon.ico'
        })
      } catch {
        // Silent
      }
    }
  }
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
          keybindings: {
            ...DEFAULT_KEYBINDINGS,
            ...(parsed.keybindings || {})
          },
          quickCommands: parsed.quickCommands && parsed.quickCommands.length > 0
            ? parsed.quickCommands
            : DEFAULT_QUICK_COMMANDS
        }
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
  }

  const isShortcut = (e: KeyboardEvent, action: keyof KeybindingConfig): boolean => {
    const sc = settings.value.keybindings?.[action] || DEFAULT_KEYBINDINGS[action]
    return sc ? matchesShortcut(e, sc) : false
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
    resetQuickCommands,
    isShortcut,
    requestDesktopNotification
  }
}

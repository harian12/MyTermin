import {
  type TerminalSettings,
  type QuickCommand,
  type KeybindingConfig,
  type NotificationRule,
  DEFAULT_KEYBINDINGS,
  DEFAULT_NOTIFICATION_RULES
} from '~/types/terminal'

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
  startupPresetIds: [],
  shellIntegration: true,
  notificationRules: DEFAULT_NOTIFICATION_RULES,
  useProjectConfig: true,
  customTheme: null,
  firstRunDone: false
}

const MODIFIER_LABELS: Record<string, string> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  option: 'Alt',
  meta: 'Win',
  os: 'Win',
  command: 'Win',
  cmd: 'Win'
}

const MODIFIER_ORDER = ['Ctrl', 'Shift', 'Alt', 'Win']

const PRETTY_KEYS: Record<string, string> = {
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  escape: 'Esc',
  ' ': 'Space',
  space: 'Space',
  enter: 'Enter',
  backspace: 'Backspace',
  delete: 'Delete',
  tab: 'Tab',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  home: 'Home',
  end: 'End',
  insert: 'Insert'
}

// Diserialakan ulang agar "ctrl + shift + t" dan "Ctrl+Shift+T" dianggap binding sama.
export const normalizeShortcut = (shortcut: string): string => {
  if (!shortcut) return ''
  const parts = shortcut
    .split('+')
    .map(p => p.trim())
    .filter(Boolean)
  const mods: string[] = []
  let key = ''
  for (const part of parts) {
    const lower = part.toLowerCase()
    const mod = MODIFIER_LABELS[lower]
    if (mod) {
      if (!mods.includes(mod)) mods.push(mod)
    } else {
      key = PRETTY_KEYS[lower] || (part.length === 1 ? part.toUpperCase() : part)
    }
  }
  mods.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
  return [...mods, key].filter(Boolean).join('+')
}

// Ubah event keyboard menjadi representasi shortcut yang bisa disimpan.
// Modifier saja tidak sah sebagai binding (harus ada tombol utama).
export const shortcutFromEvent = (e: KeyboardEvent): string | null => {
  const key = e.key
  if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph'].includes(key)) return null

  const mods: string[] = []
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.shiftKey) mods.push('Shift')
  if (e.altKey) mods.push('Alt')
  if (e.metaKey) mods.push('Win')
  if (mods.length === 0) return null

  let main = PRETTY_KEYS[key.toLowerCase()]
  if (!main) {
    if (key.length === 1) main = key.toUpperCase()
    else if (/^F\d{1,2}$/.test(key)) main = key
    else if (e.code && e.code.startsWith('Key')) main = e.code.slice(3)
    else if (e.code && e.code.startsWith('Digit')) main = e.code.slice(5)
    else if (e.code && e.code.startsWith('Numpad')) main = e.code.slice(6)
    else main = key
  }

  mods.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b))
  return [...mods, main].join('+')
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
          notificationRules: Array.isArray(parsed.notificationRules)
            ? parsed.notificationRules
            : DEFAULT_NOTIFICATION_RULES,
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

  const addNotificationRule = (rule?: Partial<NotificationRule>) => {
    const list = settings.value.notificationRules || []
    updateSettings({
      notificationRules: [
        ...list,
        {
          id: `rule-${Date.now()}`,
          label: 'Rule Baru',
          kind: 'keyword',
          pattern: '',
          enabled: true,
          notifyOnSuccess: true,
          cooldownSec: 30,
          ...rule
        }
      ]
    })
  }

  const updateNotificationRule = (id: string, patch: Partial<NotificationRule>) => {
    const list = settings.value.notificationRules || []
    updateSettings({
      notificationRules: list.map(r => (r.id === id ? { ...r, ...patch } : r))
    })
  }

  const removeNotificationRule = (id: string) => {
    const list = settings.value.notificationRules || []
    updateSettings({ notificationRules: list.filter(r => r.id !== id) })
  }

  // Aksi yang memakai binding sama persis — ditampilkan sebagai peringatan di Pengaturan.
  const findKeybindingConflicts = computed<Record<string, string[]>>(() => {
    const kb = settings.value.keybindings || {}
    const map: Record<string, string[]> = {}
    for (const [action, combo] of Object.entries(kb)) {
      if (!combo) continue
      const normalized = normalizeShortcut(combo)
      if (!normalized) continue
      map[normalized] ||= []
      map[normalized]!.push(action)
    }
    const result: Record<string, string[]> = {}
    for (const [combo, actions] of Object.entries(map)) {
      if (actions.length > 1) result[combo] = actions
    }
    return result
  })

  const exportSettingsJson = (): string => JSON.stringify(settings.value, null, 2)

  const importSettingsJson = (raw: string) => {
    const parsed = JSON.parse(raw)
    updateSettings({
      ...parsed,
      keybindings: { ...DEFAULT_KEYBINDINGS, ...(parsed.keybindings || {}) }
    })
  }

  return {
    settings,
    initSettings,
    updateSettings,
    addQuickCommand,
    removeQuickCommand,
    resetQuickCommands,
    addNotificationRule,
    updateNotificationRule,
    removeNotificationRule,
    findKeybindingConflicts,
    exportSettingsJson,
    importSettingsJson,
    isShortcut,
    requestDesktopNotification
  }
}

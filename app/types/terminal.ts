export type LayoutType = 'single' | 'split-h' | 'split-v' | 'grid-2x2'

export interface TerminalTab {
  id: string
  title: string
  shell?: string
  cwd?: string
  initialCommand?: string
  lastCommand?: string
}

export interface ShellOption {
  name: string
  path: string
  icon: string
}

export interface WorkspacePreset {
  id: string
  name: string
  description: string
  layout: LayoutType
  icon: string
  isCustom?: boolean
  terminals: {
    title: string
    command?: string
    shell?: string
    cwd?: string
  }[]
}

export interface PresetTerminalConfig {
  title: string
  command?: string
  shell?: string
  cwd?: string
}

export interface QuickCommand {
  id: string
  label: string
  command: string
}

export interface PtyStats {
  pid?: number
  process_name: string
  cpu_usage: number
  memory_mb: number
  is_running: boolean
  child_count: number
  cwd?: string
}

export interface KeybindingConfig {
  newTab?: string
  closeTab?: string
  duplicateTab?: string
  searchBuffer?: string
  commandPalette?: string
  splitHorizontal?: string
  splitVertical?: string
  grid2x2?: string
  singleView?: string
}

export const DEFAULT_KEYBINDINGS: Required<KeybindingConfig> = {
  newTab: 'Ctrl+T',
  closeTab: 'Ctrl+W',
  duplicateTab: 'Ctrl+Shift+D',
  searchBuffer: 'Ctrl+F',
  commandPalette: 'Ctrl+K',
  splitHorizontal: 'Ctrl+Shift+E',
  splitVertical: 'Ctrl+Shift+O',
  grid2x2: 'Ctrl+Shift+G',
  singleView: 'Ctrl+Shift+S'
}

export interface TerminalSettings {
  fontSize: number
  fontFamily: string
  fontLigatures?: boolean
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  theme: string
  defaultShell: string
  opacity: number
  scrollback?: number
  enableWebgl?: boolean
  enableNotifications?: boolean
  keybindings?: KeybindingConfig
  autoRestoreSession: boolean
  quickCommands?: QuickCommand[]
  startupPresetIds?: string[]
}

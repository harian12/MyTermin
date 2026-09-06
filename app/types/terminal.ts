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

export interface TerminalSettings {
  fontSize: number
  fontFamily: string
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  theme: string
  defaultShell: string
  opacity: number
  autoRestoreSession: boolean
  quickCommands?: QuickCommand[]
  startupPresetIds?: string[]
}

export type LayoutType = 'single' | 'split-h' | 'split-v' | 'grid-2x2'

export interface TerminalTab {
  id: string
  title: string
  shell?: string
  cwd?: string
  initialCommand?: string
  lastCommand?: string
}

export interface Workstation {
  id: string
  name: string
  folderPath?: string
  icon?: string
  layout: LayoutType
  activeTerminalId: string
  terminalSplitPercent?: number
  terminals: TerminalTab[]
}

export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size?: number
  gitStatus?: string
}

export interface ShellOption {
  name: string
  path: string
  icon: string
}

export interface PresetWorkstationConfig {
  id: string
  name: string
  folderPath?: string
  layout: LayoutType
  terminals: {
    title: string
    command?: string
    shell?: string
    cwd?: string
  }[]
}

export interface WorkspacePreset {
  id: string
  name: string
  description: string
  layout: LayoutType
  icon: string
  folderPath?: string
  openFiles?: string[]
  isCustom?: boolean
  workstations?: PresetWorkstationConfig[]
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
  runTask?: string
  taskPanel?: string
  unifiedSearch?: string
  aiPanel?: string
  toggleSidebar?: string
  reopenClosedTab?: string
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
  singleView: 'Ctrl+Shift+L',
  runTask: 'Ctrl+Shift+B',
  taskPanel: 'Ctrl+Shift+M',
  unifiedSearch: 'Ctrl+Shift+U',
  aiPanel: 'Ctrl+Shift+I',
  toggleSidebar: 'Ctrl+B',
  reopenClosedTab: 'Ctrl+Shift+T'
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
  shellIntegration?: boolean
  notificationRules?: NotificationRule[]
  useProjectConfig?: boolean
  customTheme?: CustomTheme | null
  firstRunDone?: boolean
  aiTool?: string
  aiCommand?: string
}

export type NotificationRuleKind = 'keyword' | 'regex' | 'exit-code' | 'terminal-name' | 'duration'

export interface NotificationRule {
  id: string
  label: string
  kind: NotificationRuleKind
  pattern: string
  enabled: boolean
  notifyOnSuccess: boolean
  cooldownSec: number
}

export const DEFAULT_NOTIFICATION_RULES: NotificationRule[] = [
  {
    id: 'rule-error',
    label: 'Kata "error" di output',
    kind: 'keyword',
    pattern: 'error',
    enabled: false,
    notifyOnSuccess: true,
    cooldownSec: 30
  },
  {
    id: 'rule-exit',
    label: 'Exit code bukan 0',
    kind: 'exit-code',
    pattern: '',
    enabled: true,
    notifyOnSuccess: false,
    cooldownSec: 0
  }
]

export interface ShellStatus {
  termId: string
  state: 'running' | 'idle' | 'unknown'
  exitCode: number
  durationMs: number
  branch: string
  cwd: string
  updatedAt: number
}

export interface TaskDefinition {
  label: string
  command: string
  source: string
  is_watch: boolean
}

export interface GitAheadBehind {
  ahead: number
  behind: number
  upstream: string
  has_upstream: boolean
}

export interface GitStashEntry {
  index: number
  selector: string
  message: string
  branch: string
  date: string
}

export interface EnvEntry {
  key: string
  value: string
  isSecret: boolean
}

export interface ProjectConfigTerminal {
  title: string
  command?: string
  shell?: string
  cwd?: string
}

export interface ProjectConfig {
  name?: string
  env?: Record<string, string>
  terminals?: ProjectConfigTerminal[]
  openFiles?: string[]
  envFile?: string
}

export interface CustomTheme {
  key: string
  name: string
  theme: {
    foreground: string
    background: string
    cursor: string
    cursorAccent: string
    selectionBackground: string
    black: string
    red: string
    green: string
    yellow: string
    blue: string
    magenta: string
    cyan: string
    white: string
    brightBlack: string
    brightRed: string
    brightGreen: string
    brightYellow: string
    brightBlue: string
    brightMagenta: string
    brightCyan: string
    brightWhite: string
  }
}

export interface GitGraphNode {
  hash: string
  short_hash: string
  parents: string[]
  author: string
  author_email: string
  date: string
  relative_time: string
  subject: string
  body: string
  refs: string[]
}

export interface GitCommitDiffFile {
  path: string
  status: string
  old_path?: string
  insertions: number
  deletions: number
}

export interface GitCommitDetail {
  hash: string
  short_hash: string
  parents: string[]
  author: string
  author_email: string
  date: string
  relative_time: string
  subject: string
  body: string
  refs: string[]
  files: GitCommitDiffFile[]
}

export interface GitGraphVisualNode extends GitGraphNode {
  lane: number
  color: string
  x: number
  y: number
  routes: Array<{
    fromLane: number
    toLane: number
    toY: number
    color: string
  }>
}

export interface GitBranchCompareData {
  base_branch: string
  compare_branch: string
  ahead_count: number
  behind_count: number
  ahead_commits: Array<{
    hash: string
    short_hash: string
    message: string
    author: string
    relative_time: string
  }>
  behind_commits: Array<{
    hash: string
    short_hash: string
    message: string
    author: string
    relative_time: string
  }>
  changed_files: GitCommitDiffFile[]
}

export interface ListeningPortInfo {
  protocol: string
  local_address: string
  port: number
  pid: number
  process_name: string
}

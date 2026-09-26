export interface DiagnosticEntry {
  at: number
  level: 'info' | 'warn' | 'error'
  scope: string
  message: string
}

const MAX_ENTRIES = 200

// Ring buffer error terakhir supaya bisa dilampirkan ke bug report
// tanpa perlu menggali DevTools manually.
export const useDiagnostics = () => {
  const entries = useState<DiagnosticEntry[]>('diagnostics-entries', () => [])
  const runtimeErrors = useState<number>('diagnostics-runtime-errors', () => 0)

  const log = (level: DiagnosticEntry['level'], scope: string, message: string) => {
    const entry: DiagnosticEntry = { at: Date.now(), level, scope, message }
    entries.value = [...entries.value, entry].slice(-MAX_ENTRIES)
    if (level === 'error') runtimeErrors.value += 1
  }

  const info = (scope: string, message: string) => log('info', scope, message)
  const warn = (scope: string, message: string) => log('warn', scope, message)
  const error = (scope: string, message: string) => log('error', scope, message)

  const clear = () => {
    entries.value = []
    runtimeErrors.value = 0
  }

  const collectDebugInfo = (extra?: Record<string, unknown>): string => {
    const { settings } = useSettingsStore()
    const { workstations, activeWorkstationId } = useWorkspaceStore()
    const lines: string[] = [
      '===== MyTermin Debug Info =====',
      `Waktu: ${new Date().toISOString()}`,
      `User-Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}`,
      `Platform: ${typeof navigator !== 'undefined' ? navigator.platform : 'n/a'}`,
      `Runtime errors: ${runtimeErrors.value}`,
      '',
      '--- Workstations ---',
      ...workstations.value.map(ws =>
        `  ${ws.name} [${ws.id}] layout=${ws.layout} folder=${ws.folderPath || '-'} terminals=${ws.terminals.length}`
      ),
      `  active=${activeWorkstationId.value}`,
      '',
      '--- Terminal ---',
      `  shell default: ${settings.value.defaultShell}`,
      `  font: ${settings.value.fontFamily} @ ${settings.value.fontSize}px`,
      `  theme: ${settings.value.theme}`,
      `  scrollback: ${settings.value.scrollback || 5000}`,
      `  webgl: ${settings.value.enableWebgl !== false}`,
      `  shellIntegration: ${settings.value.shellIntegration !== false}`,
      '',
      '--- Keybindings ---',
      ...Object.entries(settings.value.keybindings || {}).map(([k, v]) => `  ${k}: ${v}`),
      '',
      '--- Log (50 terakhir) ---',
      ...entries.value.slice(-50).map(e => `  [${new Date(e.at).toLocaleTimeString()}] ${e.level.toUpperCase()} ${e.scope}: ${e.message}`)
    ]

    if (extra) {
      lines.push('', '--- Extra ---', ...Object.entries(extra).map(([k, v]) => `  ${k}: ${String(v)}`))
    }

    return lines.join('\n')
  }

  return { entries, runtimeErrors, log, info, warn, error, clear, collectDebugInfo }
}

import type { CommandHistoryEntry } from '~/types/terminal'

export function isRecordable(cmd: string): boolean {
  const c = cmd.trim()
  if (!c) return false
  const lower = c.toLowerCase()
  if (['clear', 'cls', 'exit'].includes(lower)) return false
  return true
}

export function clipCommand(cmd: string, max = 500): string {
  const c = cmd.trim()
  if (c.length > max) return c.substring(0, max)
  return c
}

export function recordInto(
  entries: CommandHistoryEntry[],
  entry: Omit<CommandHistoryEntry, 'id' | 'runCount' | 'at'>,
  cap = 500
): CommandHistoryEntry[] {
  const newEntries = [...entries]
  const existingIdx = newEntries.findIndex(
    (e) => e.cmd === entry.cmd && e.cwd === entry.cwd
  )

  if (existingIdx !== -1) {
    const existing = newEntries.splice(existingIdx, 1)[0]
    newEntries.unshift({
      ...existing,
      at: Date.now(),
      runCount: existing.runCount + 1,
      shell: entry.shell || existing.shell
    })
  } else {
    newEntries.unshift({
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cmd: entry.cmd,
      cwd: entry.cwd,
      shell: entry.shell,
      at: Date.now(),
      runCount: 1
    })
  }

  if (newEntries.length > cap) {
    newEntries.length = cap
  }

  return newEntries
}

export function filterByScope(
  entries: CommandHistoryEntry[],
  scope: 'project' | 'all',
  projectFolder: string
): CommandHistoryEntry[] {
  if (scope === 'all') return entries
  return entries.filter((e) => {
    if (!e.cwd) return false
    // Normalize slashes for comparison
    const eCwd = e.cwd.replace(/\\/g, '/')
    const pFolder = projectFolder.replace(/\\/g, '/')
    // project scope: cwd starts with projectFolder
    return eCwd.startsWith(pFolder)
  })
}

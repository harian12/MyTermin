import type { DetailedLineRangeMapping } from '~/utils/diffComputer'

export interface HunkItem {
  index: number
  startLineOriginal: number
  endLineOriginal: number
  startLineModified: number
  endLineModified: number
  addedCount: number
  deletedCount: number
  change: DetailedLineRangeMapping
}

/**
 * Mendeteksi Line Endings (CRLF vs LF) agar konsisten dengan file asli
 */
function detectEol(text: string): string {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

/**
 * Terapkan satu hunk/perubahan dari modified ke original (Git Stage Hunk)
 */
export function applyChangeToOriginal(
  origContent: string,
  change: {
    original: { startLineNumber: number; endLineNumberExclusive: number; isEmpty: boolean }
    modified: { startLineNumber: number; endLineNumberExclusive: number; isEmpty: boolean }
  },
  modContent: string
): string {
  const eol = detectEol(origContent) || detectEol(modContent)
  const origLines = origContent.split(/\r?\n/)
  const modLines = modContent.split(/\r?\n/)

  const origStart = Math.max(0, change.original.startLineNumber - 1)
  const origDeleteCount = change.original.isEmpty
    ? 0
    : Math.max(0, change.original.endLineNumberExclusive - change.original.startLineNumber)

  const modInsertLines = change.modified.isEmpty
    ? []
    : modLines.slice(change.modified.startLineNumber - 1, change.modified.endLineNumberExclusive - 1)

  const newOrigLines = [...origLines]
  newOrigLines.splice(origStart, origDeleteCount, ...modInsertLines)
  return newOrigLines.join(eol)
}

/**
 * Batalkan satu hunk/perubahan dari modified kembali ke original (Git Discard Hunk)
 */
export function discardChangeFromModified(
  modContent: string,
  change: {
    original: { startLineNumber: number; endLineNumberExclusive: number; isEmpty: boolean }
    modified: { startLineNumber: number; endLineNumberExclusive: number; isEmpty: boolean }
  },
  origContent: string
): string {
  const eol = detectEol(modContent) || detectEol(origContent)
  const origLines = origContent.split(/\r?\n/)
  const modLines = modContent.split(/\r?\n/)

  const modStart = Math.max(0, change.modified.startLineNumber - 1)
  const modDeleteCount = change.modified.isEmpty
    ? 0
    : Math.max(0, change.modified.endLineNumberExclusive - change.modified.startLineNumber)

  const origInsertLines = change.original.isEmpty
    ? []
    : origLines.slice(change.original.startLineNumber - 1, change.original.endLineNumberExclusive - 1)

  const newModLines = [...modLines]
  newModLines.splice(modStart, modDeleteCount, ...origInsertLines)
  return newModLines.join(eol)
}

export interface ConflictBlock {
  startLine: number
  midLine: number
  endLine: number
  currentText: string
  incomingText: string
  incomingBranch: string
}

export function detectConflicts(content: string): ConflictBlock[] {
  if (!content || !content.includes('<<<<<<<')) return []
  const lines = content.split('\n')
  const conflicts: ConflictBlock[] = []

  let inConflict = false
  let startIdx = -1
  let midIdx = -1
  let incomingBranch = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!inConflict && line.startsWith('<<<<<<<')) {
      inConflict = true
      startIdx = i
      midIdx = -1
      incomingBranch = ''
    } else if (inConflict && line.startsWith('=======') && midIdx === -1) {
      midIdx = i
    } else if (inConflict && line.startsWith('>>>>>>>')) {
      if (midIdx !== -1) {
        incomingBranch = line.substring(7).trim() || 'Incoming'
        const currentText = lines.slice(startIdx + 1, midIdx).join('\n')
        const incomingText = lines.slice(midIdx + 1, i).join('\n')
        conflicts.push({
          startLine: startIdx + 1,
          midLine: midIdx + 1,
          endLine: i + 1,
          currentText,
          incomingText,
          incomingBranch
        })
      }
      inConflict = false
      startIdx = -1
      midIdx = -1
    }
  }

  return conflicts
}

export function resolveAllConflicts(
  content: string,
  choice: 'current' | 'incoming' | 'both'
): string {
  const conflicts = detectConflicts(content)
  if (conflicts.length === 0) return content

  const lines = content.split('\n')
  // Selesaikan dari bawah ke atas agar index baris tidak bergeser
  for (let i = conflicts.length - 1; i >= 0; i--) {
    const c = conflicts[i]!
    const start = c.startLine - 1
    const end = c.endLine - 1
    const mid = c.midLine - 1

    let replacement: string[] = []
    if (choice === 'current') {
      replacement = lines.slice(start + 1, mid)
    } else if (choice === 'incoming') {
      replacement = lines.slice(mid + 1, end)
    } else if (choice === 'both') {
      replacement = [
        ...lines.slice(start + 1, mid),
        ...lines.slice(mid + 1, end)
      ]
    }

    lines.splice(start, end - start + 1, ...replacement)
  }

  return lines.join('\n')
}

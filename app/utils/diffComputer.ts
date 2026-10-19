import * as monaco from 'monaco-editor'

export class LineRange {
  startLineNumber: number
  endLineNumberExclusive: number

  constructor(startLineNumber: number, endLineNumberExclusive: number) {
    this.startLineNumber = startLineNumber
    this.endLineNumberExclusive = endLineNumberExclusive
  }

  get isEmpty(): boolean {
    return this.startLineNumber === this.endLineNumberExclusive
  }

  get length(): number {
    return this.endLineNumberExclusive - this.startLineNumber
  }

  contains(lineNumber: number): boolean {
    return this.startLineNumber <= lineNumber && lineNumber < this.endLineNumberExclusive
  }

  delta(offset: number): LineRange {
    return new LineRange(this.startLineNumber + offset, this.endLineNumberExclusive + offset)
  }

  join(other: LineRange): LineRange {
    return new LineRange(
      Math.min(this.startLineNumber, other.startLineNumber),
      Math.max(this.endLineNumberExclusive, other.endLineNumberExclusive)
    )
  }

  toString(): string {
    return `[${this.startLineNumber},${this.endLineNumberExclusive})`
  }
}

export class RangeMapping {
  originalRange: monaco.Range
  modifiedRange: monaco.Range

  constructor(originalRange: monaco.Range, modifiedRange: monaco.Range) {
    this.originalRange = originalRange
    this.modifiedRange = modifiedRange
  }
}

export class DetailedLineRangeMapping {
  original: LineRange
  modified: LineRange
  innerChanges?: RangeMapping[]

  constructor(original: LineRange, modified: LineRange, innerChanges?: RangeMapping[]) {
    this.original = original
    this.modified = modified
    this.innerChanges = innerChanges
  }
}

/**
 * Optimized LCS line difference computer that runs synchronously in-process
 * Includes common prefix & suffix trimming and a safety ceiling to prevent main thread freezes
 */
export function computeLineDiff(
  originalLines: string[],
  modifiedLines: string[]
): {
  identical: boolean
  quitEarly: boolean
  changes: DetailedLineRangeMapping[]
  moves: any[]
} {
  const n = originalLines.length
  const m = modifiedLines.length

  if (n === m && originalLines.every((line, idx) => line === modifiedLines[idx])) {
    return { identical: true, quitEarly: false, changes: [], moves: [] }
  }

  // 1. Trim common prefix (O(prefix) shortcut)
  let prefix = 0
  while (prefix < n && prefix < m && originalLines[prefix] === modifiedLines[prefix]) {
    prefix++
  }

  // 2. Trim common suffix (O(suffix) shortcut)
  let suffix = 0
  while (
    suffix < (n - prefix) &&
    suffix < (m - prefix) &&
    originalLines[n - 1 - suffix] === modifiedLines[m - 1 - suffix]
  ) {
    suffix++
  }

  const subOrigLen = n - prefix - suffix
  const subModLen = m - prefix - suffix

  if (subOrigLen === 0 && subModLen === 0) {
    return { identical: true, quitEarly: false, changes: [], moves: [] }
  }

  // ponytail: fallback whole-chunk diff jika matrix > 1.000.000 sel agar tidak membekukan UI thread
  if (subOrigLen * subModLen > 1_000_000) {
    const origRange = new LineRange(prefix + 1, n - suffix + 1)
    const modRange = new LineRange(prefix + 1, m - suffix + 1)
    return {
      identical: false,
      quitEarly: true,
      changes: [new DetailedLineRangeMapping(origRange, modRange)],
      moves: []
    }
  }

  // LCS Matrix table pada sub-array yang sudah dipangkas
  const dp: number[][] = Array.from({ length: subOrigLen + 1 }, () => new Array(subModLen + 1).fill(0))
  const cell = (i: number, j: number): number => dp[i]?.[j] ?? 0

  for (let i = 1; i <= subOrigLen; i++) {
    const row = dp[i]
    const prevRow = dp[i - 1]
    if (!row || !prevRow) continue
    const origLine = originalLines[prefix + i - 1]
    for (let j = 1; j <= subModLen; j++) {
      if (origLine === modifiedLines[prefix + j - 1]) {
        row[j] = cell(i - 1, j - 1) + 1
      } else {
        row[j] = Math.max(cell(i - 1, j), cell(i, j - 1))
      }
    }
  }

  // Backtrack to find edit operations
  type DiffOp = { type: 'equal' | 'delete' | 'insert'; oIdx: number; mIdx: number }
  const ops: DiffOp[] = []
  let i = subOrigLen
  let j = subModLen

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && originalLines[prefix + i - 1] === modifiedLines[prefix + j - 1]) {
      ops.push({ type: 'equal', oIdx: prefix + i - 1, mIdx: prefix + j - 1 })
      i--
      j--
    } else if (j > 0 && (i === 0 || cell(i, j - 1) >= cell(i - 1, j))) {
      ops.push({ type: 'insert', oIdx: prefix + i, mIdx: prefix + j - 1 })
      j--
    } else if (i > 0 && (j === 0 || cell(i, j - 1) < cell(i - 1, j))) {
      ops.push({ type: 'delete', oIdx: prefix + i - 1, mIdx: prefix + j })
      i--
    }
  }

  ops.reverse()

  const changes: DetailedLineRangeMapping[] = []
  let k = 0

  while (k < ops.length) {
    const currentOp = ops[k]
    if (!currentOp || currentOp.type === 'equal') {
      k++
      continue
    }

    const startOp = currentOp
    let oStart = startOp.oIdx
    let mStart = startOp.mIdx
    let oEnd = oStart
    let mEnd = mStart

    while (k < ops.length) {
      const loopOp = ops[k]
      if (!loopOp || loopOp.type === 'equal') break
      if (loopOp.type === 'delete') {
        oEnd = loopOp.oIdx + 1
      } else {
        mEnd = loopOp.mIdx + 1
      }
      k++
    }

    const origRange = new LineRange(oStart + 1, oEnd + 1)
    const modRange = new LineRange(mStart + 1, mEnd + 1)

    // Compute inner character ranges
    const innerChanges: RangeMapping[] = []

    if (origRange.isEmpty) {
      // Pure insertion
      const endLine = Math.max(1, mEnd)
      const endCol = (modifiedLines[endLine - 1]?.length || 0) + 1
      innerChanges.push(
        new RangeMapping(
          new monaco.Range(oStart + 1, 1, oStart + 1, 1),
          new monaco.Range(mStart + 1, 1, endLine, endCol)
        )
      )
    } else if (modRange.isEmpty) {
      // Pure deletion
      const endLine = Math.max(1, oEnd)
      const endCol = (originalLines[endLine - 1]?.length || 0) + 1
      innerChanges.push(
        new RangeMapping(
          new monaco.Range(oStart + 1, 1, endLine, endCol),
          new monaco.Range(mStart + 1, 1, mStart + 1, 1)
        )
      )
    } else {
      // Modification / Replacement
      const origEndLine = Math.max(1, oEnd)
      const origEndCol = (originalLines[origEndLine - 1]?.length || 0) + 1
      const modEndLine = Math.max(1, mEnd)
      const modEndCol = (modifiedLines[modEndLine - 1]?.length || 0) + 1

      innerChanges.push(
        new RangeMapping(
          new monaco.Range(oStart + 1, 1, origEndLine, origEndCol),
          new monaco.Range(mStart + 1, 1, modEndLine, modEndCol)
        )
      )
    }

    changes.push(new DetailedLineRangeMapping(origRange, modRange, innerChanges))
  }

  return {
    identical: changes.length === 0,
    quitEarly: false,
    changes,
    moves: []
  }
}

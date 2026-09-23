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
 * Standard LCS line difference computer that runs synchronously in-process
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

  // LCS Matrix table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (originalLines[i - 1] === modifiedLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find edit operations
  type DiffOp = { type: 'equal' | 'delete' | 'insert'; oIdx: number; mIdx: number }
  const ops: DiffOp[] = []
  let i = n
  let j = m

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && originalLines[i - 1] === modifiedLines[j - 1]) {
      ops.push({ type: 'equal', oIdx: i - 1, mIdx: j - 1 })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: 'insert', oIdx: i, mIdx: j - 1 })
      j--
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      ops.push({ type: 'delete', oIdx: i - 1, mIdx: j })
      i--
    }
  }

  ops.reverse()

  const changes: DetailedLineRangeMapping[] = []
  let k = 0

  while (k < ops.length) {
    if (ops[k].type === 'equal') {
      k++
      continue
    }

    const startOp = ops[k]
    let oStart = startOp.oIdx
    let mStart = startOp.mIdx
    let oEnd = oStart
    let mEnd = mStart

    while (k < ops.length && ops[k].type !== 'equal') {
      if (ops[k].type === 'delete') {
        oEnd = ops[k].oIdx + 1
      } else if (ops[k].type === 'insert') {
        mEnd = ops[k].mIdx + 1
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

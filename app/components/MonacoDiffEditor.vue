<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import { computeLineDiff, type DetailedLineRangeMapping } from '~/utils/diffComputer'
import type { HunkItem } from '~/utils/diffHunkManager'

const props = withDefaults(
  defineProps<{
    originalValue: string
    modifiedValue: string
    filename: string
    readonly?: boolean
    renderSideBySide?: boolean
  }>(),
  {
    readonly: false,
    renderSideBySide: true
  }
)

const emit = defineEmits<{
  (e: 'update:modifiedValue', value: string): void
  (e: 'save'): void
  (e: 'approve'): void
  (e: 'approve-and-next'): void
  (e: 'reject'): void
  (e: 'prev-diff'): void
  (e: 'next-diff'): void
  (e: 'stage-hunk', hunk: DetailedLineRangeMapping): void
  (e: 'discard-hunk', hunk: DetailedLineRangeMapping): void
  (e: 'stage-focused-hunk'): void
  (e: 'discard-focused-hunk'): void
  (e: 'prev-hunk'): void
  (e: 'next-hunk'): void
  (e: 'hunks-updated', hunks: HunkItem[]): void
  (e: 'active-hunk-changed', index: number): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null
let originalModel: monaco.editor.ITextModel | null = null
let modifiedModel: monaco.editor.ITextModel | null = null
let resizeObserver: ResizeObserver | null = null

let oldOriginalDecorationIds: string[] = []
let oldModifiedDecorationIds: string[] = []
let diffDebounceTimer: ReturnType<typeof setTimeout> | null = null
let activeHunkWidgets: monaco.editor.IContentWidget[] = []
let currentHunks: HunkItem[] = []

const debouncedUpdateDiffDecorations = (delay = 75) => {
  if (diffDebounceTimer) clearTimeout(diffDebounceTimer)
  diffDebounceTimer = setTimeout(() => {
    updateDiffDecorations()
  }, delay)
}

const getLanguageFromFilename = (filename: string): string => {
  const clean = filename.replace(/\s*\(Diff\)$/i, '')
  const ext = clean.split('.').pop()?.toLowerCase() || ''
  const mapping: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    vue: 'html',
    html: 'html',
    css: 'css',
    scss: 'scss',
    json: 'json',
    rs: 'rust',
    py: 'python',
    go: 'go',
    sql: 'sql',
    sh: 'shell',
    ps1: 'powershell',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown'
  }
  return mapping[ext] || 'plaintext'
}

const ensureTheme = () => {
  monaco.editor.defineTheme('mytermin-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'ff79c6', fontStyle: 'bold' },
      { token: 'identifier', foreground: 'f8f8f2' },
      { token: 'string', foreground: 'f1fa8c' },
      { token: 'number', foreground: 'bd93f9' },
      { token: 'type', foreground: '8be9fd' },
      { token: 'function', foreground: '50fa7b' }
    ],
    colors: {
      'editor.background': '#0d0e14',
      'editor.foreground': '#f8f8f2',
      'editor.lineHighlightBackground': '#181924',
      'editorCursor.foreground': '#6366f1',
      'editorWhitespace.foreground': '#282a36',
      'editorIndentGuide.background': '#1e1f2e',
      'editorIndentGuide.activeBackground': '#4b5563',
      'editorLineNumber.foreground': '#4b5563',
      'editorLineNumber.activeForeground': '#a5b4fc',
      'editor.selectionBackground': '#2d3748',
      'editor.inactiveSelectionBackground': '#1f2937'
    }
  })
}

const updateDiffDecorations = () => {
  if (!originalModel || !modifiedModel || originalModel.isDisposed() || modifiedModel.isDisposed()) return

  const originalLines = originalModel.getLinesContent()
  const modifiedLines = modifiedModel.getLinesContent()
  const diffResult = computeLineDiff(originalLines, modifiedLines)

  const originalDecorations: monaco.editor.IModelDeltaDecoration[] = []
  const modifiedDecorations: monaco.editor.IModelDeltaDecoration[] = []

  for (const change of diffResult.changes) {
    // 1. Original / Left side (Deletions / Modified)
    if (!change.original.isEmpty) {
      const startLine = change.original.startLineNumber
      const endLine = Math.max(startLine, change.original.endLineNumberExclusive - 1)
      const lineLen = originalModel.getLineLength(endLine) || 1
      originalDecorations.push({
        range: new monaco.Range(startLine, 1, endLine, lineLen + 1),
        options: {
          isWholeLine: true,
          className: 'git-diff-deleted-line',
          marginClassName: 'git-diff-deleted-gutter',
          linesDecorationsClassName: 'git-diff-deleted-gutter-sign',
          overviewRuler: {
            color: '#ef4444',
            position: monaco.editor.OverviewRulerLane.Left
          }
        }
      })

      if (change.innerChanges) {
        for (const inner of change.innerChanges) {
          if (!inner.originalRange.isEmpty()) {
            originalDecorations.push({
              range: inner.originalRange,
              options: {
                inlineClassName: 'git-diff-deleted-char'
              }
            })
          }
        }
      }
    }

    // 2. Modified / Right side (Additions / Modified)
    if (!change.modified.isEmpty) {
      const startLine = change.modified.startLineNumber
      const endLine = Math.max(startLine, change.modified.endLineNumberExclusive - 1)
      const lineLen = modifiedModel.getLineLength(endLine) || 1
      modifiedDecorations.push({
        range: new monaco.Range(startLine, 1, endLine, lineLen + 1),
        options: {
          isWholeLine: true,
          className: 'git-diff-inserted-line',
          marginClassName: 'git-diff-inserted-gutter',
          linesDecorationsClassName: 'git-diff-inserted-gutter-sign',
          overviewRuler: {
            color: '#10b981',
            position: monaco.editor.OverviewRulerLane.Right
          }
        }
      })

      if (change.innerChanges) {
        for (const inner of change.innerChanges) {
          if (!inner.modifiedRange.isEmpty()) {
            modifiedDecorations.push({
              range: inner.modifiedRange,
              options: {
                inlineClassName: 'git-diff-inserted-char'
              }
            })
          }
        }
      }
    }
  }

  // Gunakan model.deltaDecorations langsung pada ITextModel agar render pasti aktif
  oldOriginalDecorationIds = originalModel.deltaDecorations(oldOriginalDecorationIds, originalDecorations)
  oldModifiedDecorationIds = modifiedModel.deltaDecorations(oldModifiedDecorationIds, modifiedDecorations)

  // Buat Hunk Action Widgets di atas setiap blok perubahan
  clearHunkWidgets()
  const hunksList: HunkItem[] = []
  let hunkIndex = 0

  for (const change of diffResult.changes) {
    const origStart = change.original.startLineNumber
    const origEnd = Math.max(origStart, change.original.endLineNumberExclusive - 1)
    const modStart = change.modified.startLineNumber
    const modEnd = Math.max(modStart, change.modified.endLineNumberExclusive - 1)

    const addedCount = change.modified.isEmpty
      ? 0
      : change.modified.endLineNumberExclusive - change.modified.startLineNumber
    const deletedCount = change.original.isEmpty
      ? 0
      : change.original.endLineNumberExclusive - change.original.startLineNumber

    const hunk: HunkItem = {
      index: hunkIndex,
      startLineOriginal: origStart,
      endLineOriginal: origEnd,
      startLineModified: modStart,
      endLineModified: modEnd,
      addedCount,
      deletedCount,
      change
    }
    hunksList.push(hunk)

    if (!props.readonly && diffEditor) {
      const widgetLine = Math.max(1, modStart)
      const widget = createHunkWidget(hunk, widgetLine)
      diffEditor.getModifiedEditor().addContentWidget(widget)
      activeHunkWidgets.push(widget)
    }

    hunkIndex++
  }

  currentHunks = hunksList
  emit('hunks-updated', hunksList)
}

const clearHunkWidgets = () => {
  if (!diffEditor) return
  const ed = diffEditor.getModifiedEditor()
  for (const w of activeHunkWidgets) {
    try {
      ed.removeContentWidget(w)
    } catch {
      // Abaikan widget yang sudah lepas
    }
  }
  activeHunkWidgets = []
}

const createHunkWidget = (hunk: HunkItem, lineNumber: number): monaco.editor.IContentWidget => {
  const domNode = document.createElement('div')
  domNode.className = 'monaco-hunk-action-pill'
  domNode.style.cssText =
    'display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:4px;background:#141522;border:1px solid rgba(75,85,99,0.5);box-shadow:0 4px 14px rgba(0,0,0,0.5);font-size:10px;font-family:system-ui,sans-serif;z-index:40;cursor:default;user-select:none;opacity:0.9;transition:opacity 0.15s ease;'
  domNode.onmouseenter = () => {
    domNode.style.opacity = '1'
  }
  domNode.onmouseleave = () => {
    domNode.style.opacity = '0.9'
  }

  const label = document.createElement('span')
  label.style.cssText = 'color:#a1a1aa;font-family:monospace;font-size:9px;font-weight:600;'
  let stat = ''
  if (hunk.addedCount > 0) stat += `+${hunk.addedCount} `
  if (hunk.deletedCount > 0) stat += `-${hunk.deletedCount}`
  label.textContent = `Hunk ${hunk.index + 1} (${stat.trim() || 'Mod'})`
  domNode.appendChild(label)

  const stageBtn = document.createElement('button')
  stageBtn.style.cssText =
    'display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:3px;background:rgba(16,185,129,0.2);color:#34d399;font-weight:600;font-size:10px;cursor:pointer;border:none;'
  stageBtn.innerHTML = '<span>✓</span><span>Stage Hunk</span>'
  stageBtn.title = 'Stage blok ini ke git index (Alt+S)'
  stageBtn.onclick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    emit('stage-hunk', hunk.change)
  }
  domNode.appendChild(stageBtn)

  const discardBtn = document.createElement('button')
  discardBtn.style.cssText =
    'display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:3px;background:rgba(239,68,68,0.2);color:#f87171;font-weight:600;font-size:10px;cursor:pointer;border:none;'
  discardBtn.innerHTML = '<span>↺</span><span>Discard</span>'
  discardBtn.title = 'Batalkan perubahan di blok ini (Alt+D)'
  discardBtn.onclick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    emit('discard-hunk', hunk.change)
  }
  domNode.appendChild(discardBtn)

  return {
    getId: () => `hunk-action-widget-${hunk.index}`,
    getDomNode: () => domNode,
    getPosition: () => ({
      position: { lineNumber, column: 1 },
      preference: [
        monaco.editor.ContentWidgetPositionPreference.ABOVE,
        monaco.editor.ContentWidgetPositionPreference.BELOW
      ]
    })
  }
}

onMounted(() => {
  if (!containerRef.value) return

  ensureTheme()
  monaco.editor.setTheme('mytermin-dark')

  const language = getLanguageFromFilename(props.filename)
  originalModel = monaco.editor.createModel(props.originalValue, language)
  modifiedModel = monaco.editor.createModel(props.modifiedValue, language)

  diffEditor = monaco.editor.createDiffEditor(containerRef.value, {
    theme: 'mytermin-dark',
    automaticLayout: false,
    fontSize: 13,
    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, Menlo, monospace',
    fontLigatures: true,
    renderSideBySide: props.renderSideBySide,
    readOnly: props.readonly,
    originalEditable: false,
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    padding: { top: 8, bottom: 8 },
    diffCodeLens: true,
    renderIndicators: true,
    renderMarginRevertIcon: true,
    enableSplitViewResizing: true,
    ignoreTrimWhitespace: false,
    useInlineViewWhenSpaceIsLimited: false,
    fixedOverflowWidgets: true
  })

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel
  })

  diffEditor.getModifiedEditor().focus()

  nextTick(() => {
    updateDiffDecorations()
  })

  modifiedModel.onDidChangeContent(() => {
    if (modifiedModel && !modifiedModel.isDisposed()) {
      const val = modifiedModel.getValue()
      if (val !== props.modifiedValue) {
        emit('update:modifiedValue', val)
      }
      debouncedUpdateDiffDecorations()
    }
  })

  // Ctrl+S / Cmd+S save command on modified editor
  diffEditor.getModifiedEditor().addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    emit('save')
  })

  // Ctrl+/ Toggle Line Comment on modified editor
  diffEditor.getModifiedEditor().addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
    diffEditor?.getModifiedEditor().getAction('editor.action.commentLine')?.run()
  })

  // Diff Review Shortcut Commands (Modified & Original Editor)
  const editors = [diffEditor.getModifiedEditor(), diffEditor.getOriginalEditor()]
  for (const ed of editors) {
    // Ctrl+Enter / Cmd+Enter: Approve & Next
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      emit('approve-and-next')
    })
    // Alt+A: Approve
    ed.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyA, () => {
      emit('approve')
    })
    // Alt+R: Reject
    ed.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyR, () => {
      emit('reject')
    })
    // Alt+LeftArrow: Previous diff file
    ed.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow, () => {
      emit('prev-diff')
    })
    // Alt+RightArrow: Next diff file
    ed.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.RightArrow, () => {
      emit('next-diff')
    })
    // Alt+S: Stage focused hunk
    ed.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyS, () => {
      emit('stage-focused-hunk')
    })
    // Alt+D: Discard focused hunk
    ed.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyD, () => {
      emit('discard-focused-hunk')
    })
    // Alt+[: Previous hunk
    ed.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.BracketLeft, () => {
      emit('prev-hunk')
    })
    // Alt+]: Next hunk
    ed.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.BracketRight, () => {
      emit('next-hunk')
    })
  }

  diffEditor.getModifiedEditor().onDidChangeCursorPosition((e) => {
    const line = e.position.lineNumber
    const foundIdx = currentHunks.findIndex(
      (h) => line >= h.startLineModified && line <= h.endLineModified
    )
    if (foundIdx >= 0) {
      emit('active-hunk-changed', foundIdx)
    }
  })

  resizeObserver = new ResizeObserver(() => {
    diffEditor?.layout()
  })
  resizeObserver.observe(containerRef.value)
})

watch(
  () => props.modifiedValue,
  (newVal) => {
    if (modifiedModel && !modifiedModel.isDisposed() && modifiedModel.getValue() !== newVal) {
      modifiedModel.setValue(newVal)
      debouncedUpdateDiffDecorations()
    }
  }
)

watch(
  () => props.originalValue,
  (newVal) => {
    if (originalModel && !originalModel.isDisposed() && originalModel.getValue() !== newVal) {
      originalModel.setValue(newVal)
      debouncedUpdateDiffDecorations()
    }
  }
)

watch(
  () => props.renderSideBySide,
  (val) => {
    diffEditor?.updateOptions({ renderSideBySide: val })
  }
)

watch(
  () => props.filename,
  (newFilename) => {
    const lang = getLanguageFromFilename(newFilename)
    if (originalModel && !originalModel.isDisposed()) monaco.editor.setModelLanguage(originalModel, lang)
    if (modifiedModel && !modifiedModel.isDisposed()) monaco.editor.setModelLanguage(modifiedModel, lang)
    debouncedUpdateDiffDecorations(0)
  }
)

onBeforeUnmount(() => {
  clearHunkWidgets()
  if (diffDebounceTimer) {
    clearTimeout(diffDebounceTimer)
    diffDebounceTimer = null
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  // Reset model diffEditor sebelum dispose model agar Monaco tidak melempar error
  if (diffEditor) {
    try {
      diffEditor.setModel(null)
    } catch (_) {}
    diffEditor.dispose()
    diffEditor = null
  }
  if (originalModel && !originalModel.isDisposed()) {
    if (oldOriginalDecorationIds.length > 0) {
      originalModel.deltaDecorations(oldOriginalDecorationIds, [])
    }
    originalModel.dispose()
    originalModel = null
  }
  if (modifiedModel && !modifiedModel.isDisposed()) {
    if (oldModifiedDecorationIds.length > 0) {
      modifiedModel.deltaDecorations(oldModifiedDecorationIds, [])
    }
    modifiedModel.dispose()
    modifiedModel = null
  }
  oldOriginalDecorationIds = []
  oldModifiedDecorationIds = []
})

defineExpose({
  revealHunkLine: (line: number) => {
    const ed = diffEditor?.getModifiedEditor()
    if (ed) {
      ed.revealLineInCenter(line)
      ed.setPosition({ lineNumber: line, column: 1 })
      ed.focus()
    }
  },
  getCurrentHunks: () => currentHunks
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full overflow-hidden" />
</template>

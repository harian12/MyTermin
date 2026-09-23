<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import { computeLineDiff } from '~/utils/diffComputer'

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
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null
let originalModel: monaco.editor.ITextModel | null = null
let modifiedModel: monaco.editor.ITextModel | null = null
let resizeObserver: ResizeObserver | null = null

let oldOriginalDecorationIds: string[] = []
let oldModifiedDecorationIds: string[] = []

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
  if (!originalModel || !modifiedModel) return

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
            position: monaco.editor.OverviewRulerPosition.Left
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
            position: monaco.editor.OverviewRulerPosition.Right
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
    automaticLayout: true,
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
    useInlineViewWhenSpaceIsLimited: false
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
    if (modifiedModel) {
      const val = modifiedModel.getValue()
      if (val !== props.modifiedValue) {
        emit('update:modifiedValue', val)
      }
      updateDiffDecorations()
    }
  })

  // Ctrl+S / Cmd+S save command on modified editor
  diffEditor.getModifiedEditor().addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    emit('save')
  })

  resizeObserver = new ResizeObserver(() => {
    diffEditor?.layout()
  })
  resizeObserver.observe(containerRef.value)
})

watch(
  () => props.modifiedValue,
  (newVal) => {
    if (modifiedModel && modifiedModel.getValue() !== newVal) {
      modifiedModel.setValue(newVal)
      nextTick(() => updateDiffDecorations())
    }
  }
)

watch(
  () => props.originalValue,
  (newVal) => {
    if (originalModel && originalModel.getValue() !== newVal) {
      originalModel.setValue(newVal)
      nextTick(() => updateDiffDecorations())
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
    if (originalModel) monaco.editor.setModelLanguage(originalModel, lang)
    if (modifiedModel) monaco.editor.setModelLanguage(modifiedModel, lang)
    nextTick(() => updateDiffDecorations())
  }
)

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (originalModel && oldOriginalDecorationIds.length > 0) {
    originalModel.deltaDecorations(oldOriginalDecorationIds, [])
  }
  if (modifiedModel && oldModifiedDecorationIds.length > 0) {
    modifiedModel.deltaDecorations(oldModifiedDecorationIds, [])
  }
  oldOriginalDecorationIds = []
  oldModifiedDecorationIds = []
  originalModel?.dispose()
  modifiedModel?.dispose()
  diffEditor?.dispose()
  diffEditor = null
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full overflow-hidden" />
</template>

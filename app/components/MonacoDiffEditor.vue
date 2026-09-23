<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
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
      'editor.inactiveSelectionBackground': '#1f2937',
      // Git Diff Highlighting Colors (GitHub & VS Code style: Green + Red)
      'diffEditor.insertedTextBackground': '#10b98135',
      'diffEditor.insertedLineBackground': '#10b98118',
      'diffEditor.removedTextBackground': '#ef444435',
      'diffEditor.removedLineBackground': '#ef444418',
      'diffEditorGutter.insertedLineBackground': '#10b98150',
      'diffEditorGutter.removedLineBackground': '#ef444450',
      'diffEditorOverview.insertedForeground': '#10b981',
      'diffEditorOverview.removedForeground': '#ef4444',
      'diffEditor.diagonalFill': '#181924'
    }
  })
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
    useInlineViewWhenSpaceIsLimited: false,
    diffAlgorithm: {
      computeDiff: (original: any, modified: any) => {
        try {
          const originalLines = original?.getLinesContent ? original.getLinesContent() : String(original || '').split(/\r\n|\r|\n/)
          const modifiedLines = modified?.getLinesContent ? modified.getLinesContent() : String(modified || '').split(/\r\n|\r|\n/)
          return computeLineDiff(originalLines, modifiedLines)
        } catch (e) {
          console.error('Diff computation error:', e)
          return { changes: [], moves: [], identical: false, quitEarly: false }
        }
      }
    } as any
  })

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel
  })

  diffEditor.getModifiedEditor().focus()

  modifiedModel.onDidChangeContent(() => {
    if (modifiedModel) {
      const val = modifiedModel.getValue()
      if (val !== props.modifiedValue) {
        emit('update:modifiedValue', val)
      }
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
    }
  }
)

watch(
  () => props.originalValue,
  (newVal) => {
    if (originalModel && originalModel.getValue() !== newVal) {
      originalModel.setValue(newVal)
    }
  }
)

watch(
  () => props.renderSideBySide,
  (val) => {
    diffEditor?.updateOptions({ renderSideBySide: val })
  }
)

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  originalModel?.dispose()
  modifiedModel?.dispose()
  diffEditor?.dispose()
  diffEditor = null
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full overflow-hidden" />
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as monaco from 'monaco-editor'

const props = defineProps<{
  originalValue: string
  modifiedValue: string
  filename: string
  readonly?: boolean
}>()

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
  const ext = filename.split('.').pop()?.toLowerCase() || ''
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

onMounted(() => {
  if (!containerRef.value) return

  const language = getLanguageFromFilename(props.filename)
  originalModel = monaco.editor.createModel(props.originalValue, language)
  modifiedModel = monaco.editor.createModel(props.modifiedValue, language)

  diffEditor = monaco.editor.createDiffEditor(containerRef.value, {
    theme: 'mytermin-dark',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, Menlo, monospace',
    fontLigatures: true,
    renderSideBySide: true,
    readOnly: props.readonly || false,
    originalEditable: false,
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    padding: { top: 8, bottom: 8 }
  })

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel
  })

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

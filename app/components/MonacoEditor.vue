<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import { useEditorStore } from '~/composables/useEditorStore'
import { useSettingsStore } from '~/composables/useSettingsStore'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'
import { registerUniversalDefinitionProvider, setGlobalFileOpener } from '~/utils/monacoDefinitionProvider'

interface Props {
  modelValue: string
  filename: string
  filePath?: string
  readonly?: boolean
  wordWrap?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  wordWrap: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'save'): void
  (e: 'format'): void
  (e: 'run'): void
  (e: 'toggle-word-wrap'): void
}>()

const { targetNavigatePosition, editorCursorPos, openFileAtPosition } = useEditorStore()
const { activeWorkstation } = useWorkspaceStore()
const { settings } = useSettingsStore()

const containerRef = ref<HTMLDivElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let resizeObserver: ResizeObserver | null = null

const getLanguageFromFilename = (filename: string): string => {
  if (!filename) return 'plaintext'
  const lowerName = filename.toLowerCase()

  if (lowerName === 'dockerfile' || lowerName.endsWith('/dockerfile') || lowerName.endsWith('\\dockerfile')) return 'dockerfile'
  if (lowerName.endsWith('.env')) return 'ini'
  if (lowerName.endsWith('.gitignore')) return 'shell'

  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const dotExt = `.${ext}`

  // Monaco registry lookup untuk 80+ bahasa pemrograman
  if (typeof monaco !== 'undefined' && monaco.languages?.getLanguages) {
    const langs = monaco.languages.getLanguages()
    const matched = langs.find(l =>
      l.extensions?.includes(dotExt) ||
      l.filenames?.includes(filename) ||
      l.filenames?.includes(lowerName)
    )
    if (matched) return matched.id
  }

  const fallbackMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    vue: 'html',
    svelte: 'html',
    astro: 'html',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    json: 'json',
    jsonc: 'json',
    rs: 'rust',
    py: 'python',
    go: 'go',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cs: 'csharp',
    java: 'java',
    php: 'php',
    rb: 'ruby',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    ps1: 'powershell',
    bat: 'bat',
    cmd: 'bat',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'ini',
    ini: 'ini',
    xml: 'xml',
    svg: 'xml',
    md: 'markdown',
    markdown: 'markdown',
    dockerfile: 'dockerfile',
    dart: 'dart',
    kt: 'kotlin',
    kts: 'kotlin',
    swift: 'swift',
    lua: 'lua',
    sol: 'solidity',
    proto: 'protobuf',
    graphql: 'graphql',
    gql: 'graphql',
    ex: 'elixir',
    exs: 'elixir',
    r: 'r'
  }
  return fallbackMap[ext] || 'plaintext'
}

onMounted(() => {
  if (!containerRef.value) return

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
      'diffEditor.insertedTextBackground': '#10b98130',
      'diffEditor.insertedLineBackground': '#10b98115',
      'diffEditor.removedTextBackground': '#ef444430',
      'diffEditor.removedLineBackground': '#ef444418',
      'diffEditorGutter.insertedLineBackground': '#10b98140',
      'diffEditorGutter.removedLineBackground': '#ef444440',
      'diffEditorOverview.insertedForeground': '#10b981',
      'diffEditorOverview.removedForeground': '#ef4444',
      'diffEditor.diagonalFill': '#181924'
    }
  })

  setGlobalFileOpener((filePath, line, col) => {
    openFileAtPosition(filePath, line, col)
  })
  registerUniversalDefinitionProvider(() => activeWorkstation.value?.folderPath)

  const resolvedPath = props.filePath || props.filename
  const language = getLanguageFromFilename(props.filename)
  const uri = monaco.Uri.file(resolvedPath)

  let model = monaco.editor.getModel(uri)
  if (!model) {
    model = monaco.editor.createModel(props.modelValue, language, uri)
  } else {
    if (model.getValue() !== props.modelValue) {
      model.setValue(props.modelValue)
    }
    monaco.editor.setModelLanguage(model, language)
  }

  editor = monaco.editor.create(containerRef.value, {
    model,
    theme: 'mytermin-dark',
    automaticLayout: true,
    fontSize: settings.value.editorFontSize || 13,
    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, Menlo, monospace',
    fontLigatures: true,
    lineNumbers: 'on',
    wordWrap: props.wordWrap ? 'on' : 'off',
    minimap: {
      enabled: settings.value.editorMinimap !== false,
      maxColumn: 80,
      scale: 1
    },
    scrollBeyondLastLine: false,
    tabSize: settings.value.editorTabSize || 2,
    renderWhitespace: 'selection',
    readOnly: props.readonly || false,
    bracketPairColorization: {
      enabled: true
    },
    cursorBlinking: 'smooth',
    smoothScrolling: true,
    padding: {
      top: 8,
      bottom: 8
    }
  })

  editor.onDidChangeModelContent(() => {
    if (!editor) return
    const val = editor.getValue()
    if (val !== props.modelValue) {
      emit('update:modelValue', val)
    }
  })

  editor.onDidChangeCursorPosition((e) => {
    if (editorCursorPos) {
      editorCursorPos.value = {
        line: e.position.lineNumber,
        column: e.position.column
      }
    }
  })

  // Ctrl+S / Cmd+S save command
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    emit('save')
  })

  // Shift+Alt+F format command
  editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
    emit('format')
  })

  // Alt+Z toggle word wrap
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
    emit('toggle-word-wrap')
  })

  // F5 run active file
  editor.addCommand(monaco.KeyCode.F5, () => {
    emit('run')
  })

  // Ctrl+F / Cmd+F find
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
    editor?.getAction('actions.find')?.run()
  })

  // Ctrl+H / Cmd+H replace
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH, () => {
    editor?.getAction('editor.action.startFindReplaceAction')?.run()
  })

  // Auto resize observer
  resizeObserver = new ResizeObserver(() => {
    editor?.layout()
  })
  resizeObserver.observe(containerRef.value)

  if (targetNavigatePosition.value) {
    const pos = targetNavigatePosition.value
    editor.revealLineInCenter(pos.line)
    editor.setPosition({ lineNumber: pos.line, column: pos.col })
    editor.focus()
  }
})

watch(
  () => props.modelValue,
  (newVal) => {
    if (editor && editor.getValue() !== newVal) {
      const pos = editor.getPosition()
      editor.setValue(newVal)
      if (pos) editor.setPosition(pos)
    }
  }
)

watch(
  () => [props.filename, props.filePath],
  ([newFilename, newPath]) => {
    if (!editor) return
    const resolvedPath = (newPath as string) || (newFilename as string)
    const uri = monaco.Uri.file(resolvedPath)
    const newLang = getLanguageFromFilename(newFilename as string)
    let model = monaco.editor.getModel(uri)
    if (!model) {
      model = monaco.editor.createModel(props.modelValue, newLang, uri)
    } else {
      if (model.getValue() !== props.modelValue) {
        model.setValue(props.modelValue)
      }
      monaco.editor.setModelLanguage(model, newLang)
    }
    if (editor.getModel() !== model) {
      editor.setModel(model)
    }
  }
)

watch(
  () => props.wordWrap,
  (newWrap) => {
    editor?.updateOptions({ wordWrap: newWrap ? 'on' : 'off' })
  }
)

watch(
  () => targetNavigatePosition.value,
  (pos) => {
    if (pos && editor) {
      nextTick(() => {
        editor?.revealLineInCenter(pos.line)
        editor?.setPosition({ lineNumber: pos.line, column: pos.col })
        editor?.focus()
      })
    }
  }
)

watch(
  () => [settings.value.editorFontSize, settings.value.editorTabSize, settings.value.editorMinimap],
  ([fontSize, tabSize, minimap]) => {
    editor?.updateOptions({
      fontSize: (fontSize as number) || 13,
      tabSize: (tabSize as number) || 2,
      minimap: { enabled: minimap !== false }
    })
  }
)

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (editor) {
    editor.dispose()
    editor = null
  }
})

defineExpose({
  getEditor: () => editor,
  format: () => {
    editor?.getAction('editor.action.formatDocument')?.run()
  },
  find: () => {
    editor?.getAction('actions.find')?.run()
  },
  replace: () => {
    editor?.getAction('editor.action.startFindReplaceAction')?.run()
  }
})
</script>

<template>
  <div ref="containerRef" class="w-full h-full overflow-hidden" />
</template>

<style>
.monaco-editor .decorationsOverviewRuler {
  display: none !important;
}
</style>

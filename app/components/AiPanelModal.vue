<script setup lang="ts">
import { Bot, Play, Copy, FileCode2, GitCompare, Terminal as TerminalIcon, TextSelect, Sparkles } from 'lucide-vue-next'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

type ContextKey = 'activeFile' | 'selection' | 'gitDiff' | 'cwd'

const AI_TOOLS = [
  { id: 'opencode', label: 'OpenCode', command: 'opencode' },
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'codex', label: 'Codex', command: 'codex' },
  { id: 'custom', label: 'Customâ€¦', command: '' }
]

const { settings, updateSettings } = useSettingsStore()
const { activeWorkstation, addTerminal, terminals } = useWorkspaceStore()
const { openFiles, activeFile } = useEditorStore()
const { copyToClipboard } = useTauriPty()
const { gitOverview, refreshGitStatus } = useProjectExplorer()
const { saveNotification } = useWorkspaceStore()
const { info, warn } = useDiagnostics()

const tool = ref<string>(settings.value.aiTool || 'opencode')
const prompt = ref('')
const customCommand = ref(settings.value.aiCommand || '')
const contexts = reactive<Record<ContextKey, boolean>>({
  activeFile: true,
  selection: true,
  gitDiff: false,
  cwd: true
})

const getSelectedText = () => {
  const win = window as any
  return typeof win.getSelection === 'function' ? String(win.getSelection() || '').trim() : ''
}

const activeFileText = computed(() => activeFile.value?.path || '')

const changedFiles = computed(() => {
  const overview = gitOverview.value
  if (!overview) return []
  return [
    ...overview.staged.map(f => f.path),
    ...overview.unstaged.map(f => f.path),
    ...overview.untracked.map(f => f.path)
  ]
})

const buildPrompt = (): string => {
  const parts: string[] = []
  if (prompt.value.trim()) parts.push(prompt.value.trim())

  if (contexts.activeFile && activeFileText.value) {
    parts.push(`File aktif: ${activeFileText.value}`)
  }
  if (contexts.selection) {
    const selected = getSelectedText()
    if (selected) parts.push(`Selection:\n${selected}`)
  }
  if (contexts.gitDiff && changedFiles.value.length > 0) {
    parts.push(`Berkas berubah (git status): ${changedFiles.value.join(', ')}`)
  }
  if (contexts.cwd && activeWorkstation.value.folderPath) {
    parts.push(`Working directory: ${activeWorkstation.value.folderPath}`)
  }

  return parts.join('\n\n')
}

const runInNewTerminal = async () => {
  const selectedTool = AI_TOOLS.find(t => t.id === tool.value)
  const baseCommand = tool.value === 'custom' ? customCommand.value.trim() : selectedTool?.command || ''
  if (!baseCommand) {
    warn('ai-panel', 'Perintah AI CLI kosong')
    return
  }
  const composed = buildPrompt()
  // Prompt ditulis sebagai argumen pertama agar tool langsung menerima konteks.
  const fullCommand = composed ? `${baseCommand} ${JSON.stringify(composed)}` : baseCommand

  addTerminal({ title: `AI: ${selectedTool?.label || 'Custom'}`, command: fullCommand, cwd: activeWorkstation.value.folderPath })
  saveNotification.value = `Terminal AI (${selectedTool?.label || 'Custom'}) dibuka`
  setTimeout(() => (saveNotification.value = null), 2200)
  info('ai-panel', fullCommand.slice(0, 120))
  emit('update:open', false)
}

const copyPrompt = async () => {
  const composed = buildPrompt()
  if (!composed) return
  await copyToClipboard(composed)
  saveNotification.value = 'Prompt AI disalin ke clipboard'
  setTimeout(() => (saveNotification.value = null), 2000)
}

watch([tool, customCommand], () => {
  const selectedTool = AI_TOOLS.find(t => t.id === tool.value)
  updateSettings({
    aiTool: tool.value,
    aiCommand: tool.value === 'custom' ? customCommand.value : selectedTool?.command || ''
  })
})
</script>

<template>
  <UiDialog
    :open="open"
    title="AI CLI Runner"
    description="Jalankan CLI AI dengan konteks project yang dipilih, langsung di terminal baru."
    class="max-w-xl"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <label class="w-24 shrink-0 text-[11px] text-muted-foreground">Tool</label>
        <UiSelect v-model="tool" class="flex-1">
          <option v-for="t in AI_TOOLS" :key="t.id" :value="t.id">{{ t.label }}</option>
        </UiSelect>
      </div>

      <div v-if="tool === 'custom'" class="flex items-center gap-2">
        <label class="w-24 shrink-0 text-[11px] text-muted-foreground">Perintah</label>
        <UiInput v-model="customCommand" placeholder="mis. aider --model gpt-4" class="h-8 flex-1 font-mono text-xs" />
      </div>

      <div class="space-y-1.5">
        <label class="text-[11px] text-muted-foreground">Instruksi</label>
        <textarea
          v-model="prompt"
          rows="4"
          placeholder="mis: Jelaskan apa yang diubah di working tree dan propose refactor kecil."
          class="w-full resize-y rounded-md border border-input bg-transparent p-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div>
        <p class="pb-1.5 text-[11px] text-muted-foreground">Konteks yang disertakan</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            :class="[
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
              contexts.activeFile ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground'
            ]"
            @click="contexts.activeFile = !contexts.activeFile"
          >
            <FileCode2 class="h-3 w-3" />
            File aktif
            <span v-if="openFiles.length" class="text-muted-foreground">({{ openFiles.length }})</span>
          </button>
          <button
            :class="[
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
              contexts.selection ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground'
            ]"
            @click="contexts.selection = !contexts.selection"
          >
            <TextSelect class="h-3 w-3" />
            Selection
          </button>
          <button
            :class="[
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
              contexts.gitDiff ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground'
            ]"
            @click="contexts.gitDiff = !contexts.gitDiff"
          >
            <GitCompare class="h-3 w-3" />
            Git status
            <span v-if="changedFiles.length" class="text-muted-foreground">({{ changedFiles.length }})</span>
          </button>
          <button
            :class="[
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
              contexts.cwd ? 'border-primary/60 bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground'
            ]"
            @click="contexts.cwd = !contexts.cwd"
          >
            <TerminalIcon class="h-3 w-3" />
            Working dir
          </button>
        </div>
      </div>

      <details class="rounded-md border border-border/50 bg-muted/20 p-2.5">
        <summary class="cursor-pointer text-[11px] text-muted-foreground">Pratinjau prompt</summary>
        <pre class="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-foreground/80">{{ buildPrompt() || '(kosong)' }}</pre>
      </details>

      <div class="flex justify-end gap-2">
        <UiButton variant="ghost" size="sm" class="h-8 gap-1.5 text-xs" @click="copyPrompt">
          <Copy class="h-3.5 w-3.5" />
          <span>Salin Prompt</span>
        </UiButton>
        <UiButton size="sm" class="h-8 gap-1.5 text-xs" @click="runInNewTerminal">
          <Play class="h-3.5 w-3.5" />
          <span>Jalankan di Terminal Baru</span>
        </UiButton>
      </div>
    </div>
  </UiDialog>
</template>

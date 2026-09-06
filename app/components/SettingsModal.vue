<script setup lang="ts">
import { TERMINAL_THEMES } from '~/composables/useThemes'
import { Plus, Trash2, RotateCcw, Terminal as TerminalIcon } from 'lucide-vue-next'
import type { ShellOption } from '~/types/terminal'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

  const { settings, updateSettings, addQuickCommand, removeQuickCommand, resetQuickCommands } = useSettingsStore()
  const { clearSavedSession } = useWorkspaceStore()
  const { getAvailableShells } = useTauriPty()

const shells = ref<ShellOption[]>([])
const themeKeys = Object.keys(TERMINAL_THEMES)

// Form state untuk tambah quick command baru
const newLabel = ref('')
const newCommand = ref('')

const handleAddQuickCmd = () => {
  if (!newLabel.value.trim() || !newCommand.value.trim()) return
  addQuickCommand(newLabel.value, newCommand.value)
  newLabel.value = ''
  newCommand.value = ''
}

onMounted(async () => {
  shells.value = await getAvailableShells()
})
</script>

<template>
  <UiDialog
    :open="open"
    title="Terminal Settings"
    description="Sesuaikan tampilan, preferensi font, perilaku sesi, dan konfigurasi Quick Run CLI."
    @update:open="emit('update:open', $event)"
  >
    <div class="grid gap-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
      <!-- Font Size -->
      <div class="flex items-center justify-between gap-4">
        <div class="space-y-0.5">
          <UiLabel class="text-xs font-medium">Font Size (px)</UiLabel>
          <p class="text-[11px] text-muted-foreground">Ukuran font teks terminal</p>
        </div>
        <div class="w-28">
          <UiInput
            type="number"
            min="10"
            max="32"
            :model-value="settings.fontSize"
            @update:model-value="updateSettings({ fontSize: Number($event) })"
          />
        </div>
      </div>

      <!-- Color Theme -->
      <div class="flex items-center justify-between gap-4">
        <div class="space-y-0.5">
          <UiLabel class="text-xs font-medium">Color Theme</UiLabel>
          <p class="text-[11px] text-muted-foreground">Skema warna & palet ANSI</p>
        </div>
        <div class="w-44">
          <UiSelect
            :model-value="settings.theme"
            @update:model-value="updateSettings({ theme: $event as string })"
          >
            <option v-for="key in themeKeys" :key="key" :value="key">
              {{ TERMINAL_THEMES[key].name }}
            </option>
          </UiSelect>
        </div>
      </div>

      <!-- Cursor Style -->
      <div class="flex items-center justify-between gap-4">
        <div class="space-y-0.5">
          <UiLabel class="text-xs font-medium">Cursor Style</UiLabel>
          <p class="text-[11px] text-muted-foreground">Bentuk kursor pengetikan</p>
        </div>
        <div class="w-44">
          <UiSelect
            :model-value="settings.cursorStyle"
            @update:model-value="updateSettings({ cursorStyle: $event as any })"
          >
            <option value="bar">Bar (Vertical Line)</option>
            <option value="block">Block (Solid)</option>
            <option value="underline">Underline</option>
          </UiSelect>
        </div>
      </div>

      <!-- Default Shell -->
      <div class="flex items-center justify-between gap-4">
        <div class="space-y-0.5">
          <UiLabel class="text-xs font-medium">Default Shell</UiLabel>
          <p class="text-[11px] text-muted-foreground">Shell saat membuka terminal baru</p>
        </div>
        <div class="w-44">
          <UiSelect
            :model-value="settings.defaultShell"
            @update:model-value="updateSettings({ defaultShell: $event as string })"
          >
            <option v-for="sh in shells" :key="sh.path" :value="sh.path">
              {{ sh.name }}
            </option>
          </UiSelect>
        </div>
      </div>

      <!-- Quick Run CLI Commands Management -->
      <div class="pt-3 border-t border-border/40 space-y-2.5">
        <div class="flex items-center justify-between">
          <div>
            <UiLabel class="text-xs font-semibold flex items-center gap-1.5">
              <TerminalIcon class="w-3.5 h-3.5 text-emerald-400" />
              <span>Quick Run CLI Snippets</span>
            </UiLabel>
            <p class="text-[11px] text-muted-foreground">
              Tombol pintas CLI cepat pada header setiap panel terminal
            </p>
          </div>
          <UiButton
            variant="ghost"
            size="sm"
            class="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-2"
            title="Reset to default snippets"
            @click="resetQuickCommands"
          >
            <RotateCcw class="w-3 h-3" />
            <span>Reset</span>
          </UiButton>
        </div>

        <!-- List of existing Quick Commands -->
        <div class="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          <div
            v-for="cmd in (settings.quickCommands || [])"
            :key="cmd.id"
            class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#13141d] border border-border/50 text-xs"
          >
            <div class="flex items-center gap-2 min-w-0 flex-1">
              <span class="font-medium text-foreground truncate w-28 flex-shrink-0">{{ cmd.label }}</span>
              <span class="font-mono text-[11px] text-emerald-400 bg-background/60 px-1.5 py-0.5 rounded border border-border/30 truncate flex-1">{{ cmd.command }}</span>
            </div>
            <button
              class="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
              title="Hapus snippet"
              @click="removeQuickCommand(cmd.id)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Add New Quick Command Form -->
        <div class="flex items-center gap-2 pt-1">
          <UiInput
            v-model="newLabel"
            placeholder="Label (e.g. Test Suite)"
            class="h-8 text-xs flex-1"
            @keydown.enter="handleAddQuickCmd"
          />
          <UiInput
            v-model="newCommand"
            placeholder="Command (e.g. npm run test)"
            class="h-8 text-xs font-mono flex-1"
            @keydown.enter="handleAddQuickCmd"
          />
          <UiButton
            variant="secondary"
            size="sm"
            class="h-8 text-xs gap-1 px-3"
            :disabled="!newLabel.trim() || !newCommand.trim()"
            @click="handleAddQuickCmd"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Tambah</span>
          </UiButton>
        </div>
      </div>

      <!-- Clear Saved Session Data -->
      <div class="pt-3 border-t border-border/40 flex items-center justify-between">
        <span class="text-[11px] text-muted-foreground">Reset data sesi tersimpan</span>
        <UiButton
          variant="outline"
          size="sm"
          class="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
          @click="clearSavedSession"
        >
          Reset Session
        </UiButton>
      </div>
    </div>

    <template #footer>
      <UiButton variant="default" @click="emit('update:open', false)">
        Selesai
      </UiButton>
    </template>
  </UiDialog>
</template>

<script setup lang="ts">
import { TERMINAL_THEMES } from '~/composables/useThemes'
import { Plus, Trash2, RotateCcw, Terminal as TerminalIcon, Cpu, Bell, Keyboard, Sparkles, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-vue-next'
import { DEFAULT_KEYBINDINGS, type KeybindingConfig, type ShellOption } from '~/types/terminal'
import { requestDesktopNotification } from '~/composables/useSettingsStore'
import { useUpdater } from '~/composables/useUpdater'

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
const {
  status: updateStatus,
  statusMessage: updateStatusMessage,
  currentAppVersion,
  newVersion,
  downloadProgress,
  isChecking: isCheckingUpdate,
  isDownloading: isDownloadingUpdate,
  hasUpdate,
  fetchCurrentVersion,
  checkForUpdates,
  downloadAndInstall,
} = useUpdater()

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

const keybindingList: { key: keyof KeybindingConfig; label: string }[] = [
  { key: 'newTab', label: 'Tab Baru' },
  { key: 'closeTab', label: 'Tutup Tab' },
  { key: 'duplicateTab', label: 'Duplikat Tab' },
  { key: 'searchBuffer', label: 'Cari di Buffer' },
  { key: 'commandPalette', label: 'Command Palette' },
  { key: 'splitHorizontal', label: 'Split Horisontal' },
  { key: 'splitVertical', label: 'Split Vertikal' },
  { key: 'grid2x2', label: 'Grid 2x2' },
  { key: 'singleView', label: 'Single View' }
]

const updateKeybinding = (key: keyof KeybindingConfig, val: string) => {
  const current = settings.value.keybindings || { ...DEFAULT_KEYBINDINGS }
  updateSettings({
    keybindings: {
      ...current,
      [key]: val.trim()
    }
  })
}

const resetKeybindings = () => {
  updateSettings({
    keybindings: { ...DEFAULT_KEYBINDINGS }
  })
}

const handleToggleNotification = async (enabled: boolean) => {
  updateSettings({ enableNotifications: enabled })
  if (enabled) {
    await requestDesktopNotification()
  }
}

const fontPresets = [
  { name: 'Cascadia Code', value: 'Cascadia Code, Consolas, monospace' },
  { name: 'Fira Code', value: 'Fira Code, Cascadia Code, monospace' },
  { name: 'JetBrains Mono', value: 'JetBrains Mono, Cascadia Code, monospace' },
  { name: 'Consolas', value: 'Consolas, "Courier New", monospace' },
  { name: 'Source Code Pro', value: 'Source Code Pro, Consolas, monospace' },
  { name: 'MesloLGS NF', value: 'MesloLGS NF, Cascadia Code, monospace' },
  { name: 'Custom Font...', value: 'custom' }
]

const selectedFontPreset = computed(() => {
  const current = (settings.value.fontFamily || '').toLowerCase()
  const found = fontPresets.find(p => p.value !== 'custom' && current.startsWith(p.name.toLowerCase()))
  return found ? found.value : 'custom'
})

const customFontValue = ref(settings.value.fontFamily || '')

const onFontPresetChange = (val: string) => {
  if (val === 'custom') {
    updateSettings({ fontFamily: customFontValue.value || 'Cascadia Code, monospace' })
  } else {
    updateSettings({ fontFamily: val })
  }
}

onMounted(async () => {
  shells.value = await getAvailableShells()
  fetchCurrentVersion()
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
          <p class="text-[11px] text-muted-foreground">Ukuran font teks terminal (bisa juga zoom via <kbd class="px-1 py-0.2 rounded bg-muted/60 text-[9px] font-mono">Ctrl+Scroll</kbd>)</p>
        </div>
        <div class="w-28">
          <UiInput
            type="number"
            min="8"
            max="32"
            :model-value="settings.fontSize"
            @update:model-value="updateSettings({ fontSize: Number($event) })"
          />
        </div>
      </div>

      <!-- Font Family -->
      <div class="flex items-center justify-between gap-4">
        <div class="space-y-0.5">
          <UiLabel class="text-xs font-medium">Font Family</UiLabel>
          <p class="text-[11px] text-muted-foreground">Jenis huruf font monospace terminal</p>
        </div>
        <div class="w-44 space-y-1.5">
          <UiSelect
            :model-value="selectedFontPreset"
            @update:model-value="onFontPresetChange($event as string)"
          >
            <option v-for="font in fontPresets" :key="font.value" :value="font.value">
              {{ font.name }}
            </option>
          </UiSelect>
          <UiInput
            v-if="selectedFontPreset === 'custom'"
            v-model="customFontValue"
            placeholder="Ketik font lokal..."
            class="h-7 text-xs font-mono"
            @change="updateSettings({ fontFamily: customFontValue })"
          />
        </div>
      </div>

      <!-- Font Ligatures -->
      <div class="flex items-center justify-between gap-4">
        <div class="space-y-0.5">
          <UiLabel class="text-xs font-medium">Font Ligatures</UiLabel>
          <p class="text-[11px] text-muted-foreground">Gabungkan simbol kode (misal: =&gt;, !=, ===)</p>
        </div>
        <input
          type="checkbox"
          class="w-4 h-4 rounded border-border accent-primary cursor-pointer"
          :checked="settings.fontLigatures !== false"
          @change="updateSettings({ fontLigatures: ($event.target as HTMLInputElement).checked })"
        />
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
              {{ TERMINAL_THEMES[key]?.name ?? key }}
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

      <!-- Scrollback Buffer -->
      <div class="flex items-center justify-between gap-4">
        <div class="space-y-0.5">
          <UiLabel class="text-xs font-medium">Scrollback Buffer</UiLabel>
          <p class="text-[11px] text-muted-foreground">Batas riwayat baris log terminal (1000 - 50000)</p>
        </div>
        <div class="w-44 flex items-center gap-2">
          <UiInput
            type="number"
            :min="1000"
            :max="50000"
            :step="1000"
            class="h-8 text-xs font-mono"
            :model-value="settings.scrollback || 5000"
            @update:model-value="updateSettings({ scrollback: Math.max(1000, Math.min(50000, Number($event) || 5000)) })"
          />
          <span class="text-[11px] text-muted-foreground">lines</span>
        </div>
      </div>

      <!-- Performance & System Notifications -->
      <div class="pt-3 border-t border-border/40 space-y-3">
        <div class="flex items-center justify-between gap-4">
          <div class="space-y-0.5">
            <UiLabel class="text-xs font-medium flex items-center gap-1.5">
              <Cpu class="w-3.5 h-3.5 text-cyan-400" />
              <span>GPU / WebGL Acceleration</span>
            </UiLabel>
            <p class="text-[11px] text-muted-foreground">Rendering terminal berbasis hardware GPU untuk performa 60 FPS</p>
          </div>
          <input
            type="checkbox"
            class="w-4 h-4 rounded border-border accent-primary cursor-pointer"
            :checked="settings.enableWebgl !== false"
            @change="updateSettings({ enableWebgl: ($event.target as HTMLInputElement).checked })"
          />
        </div>

        <div class="flex items-center justify-between gap-4">
          <div class="space-y-0.5">
            <UiLabel class="text-xs font-medium flex items-center gap-1.5">
              <Bell class="w-3.5 h-3.5 text-amber-400" />
              <span>Desktop OS Notifications</span>
            </UiLabel>
            <p class="text-[11px] text-muted-foreground">Pemberitahuan toast OS saat proses background selesai atau aplikasi di-minimize</p>
          </div>
          <input
            type="checkbox"
            class="w-4 h-4 rounded border-border accent-primary cursor-pointer"
            :checked="settings.enableNotifications !== false"
            @change="handleToggleNotification(($event.target as HTMLInputElement).checked)"
          />
        </div>
      </div>

      <!-- Custom Keybindings Editor -->
      <div class="pt-3 border-t border-border/40 space-y-2.5">
        <div class="flex items-center justify-between">
          <div>
            <UiLabel class="text-xs font-semibold flex items-center gap-1.5">
              <Keyboard class="w-3.5 h-3.5 text-violet-400" />
              <span>Keyboard Shortcuts</span>
            </UiLabel>
            <p class="text-[11px] text-muted-foreground">
              Kustomisasi tombol pintas navigasi dan tindakan terminal
            </p>
          </div>
          <UiButton
            variant="ghost"
            size="sm"
            class="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-1 px-2"
            title="Reset ke default shortcuts"
            @click="resetKeybindings"
          >
            <RotateCcw class="w-3 h-3" />
            <span>Reset</span>
          </UiButton>
        </div>

        <div class="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1 text-xs">
          <div
            v-for="item in keybindingList"
            :key="item.key"
            class="flex items-center justify-between gap-2 p-1.5 rounded-md bg-[#13141d] border border-border/50"
          >
            <span class="text-[11px] text-foreground/90 font-medium truncate">{{ item.label }}</span>
            <input
              type="text"
              class="w-28 h-6 px-1.5 text-[11px] font-mono bg-background border border-border/70 rounded text-right text-primary focus:border-primary outline-none"
              :value="settings.keybindings?.[item.key] || DEFAULT_KEYBINDINGS[item.key]"
              @change="updateKeybinding(item.key, ($event.target as HTMLInputElement).value)"
            />
          </div>
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

      <!-- Application Update Section -->
      <div class="pt-3 border-t border-border/40 space-y-2.5">
        <div class="flex items-center justify-between">
          <div>
            <UiLabel class="text-xs font-semibold flex items-center gap-1.5">
              <Sparkles class="w-3.5 h-3.5 text-blue-400" />
              <span>Pembaruan Aplikasi</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                v{{ currentAppVersion }}
              </span>
            </UiLabel>
            <p class="text-[11px] text-muted-foreground">
              Periksa dan pasang versi terbaru MyTermin secara otomatis
            </p>
          </div>
          <UiButton
            variant="outline"
            size="sm"
            class="h-7 text-xs gap-1.5 px-2.5 border-border/60"
            :disabled="isCheckingUpdate || isDownloadingUpdate"
            @click="checkForUpdates(false)"
          >
            <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': isCheckingUpdate }" />
            <span>{{ isCheckingUpdate ? 'Memeriksa...' : 'Cek Update' }}</span>
          </UiButton>
        </div>

        <div v-if="updateStatus !== 'idle'" class="p-2.5 rounded-md bg-[#13141d] border border-border/50 text-xs space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <CheckCircle2 v-if="updateStatus === 'up-to-date'" class="w-4 h-4 text-emerald-400 shrink-0" />
              <AlertCircle v-else-if="updateStatus === 'error'" class="w-4 h-4 text-destructive shrink-0" />
              <Sparkles v-else-if="hasUpdate" class="w-4 h-4 text-blue-400 shrink-0" />
              <RefreshCw v-else class="w-4 h-4 text-muted-foreground animate-spin shrink-0" />
              <span class="text-[11px] text-foreground font-medium truncate">{{ updateStatusMessage }}</span>
            </div>

            <UiButton
              v-if="updateStatus === 'available'"
              size="sm"
              class="h-7 text-xs gap-1 px-3 bg-blue-600 hover:bg-blue-500 text-white shrink-0"
              :disabled="isDownloadingUpdate"
              @click="downloadAndInstall"
            >
              <span>Pasang Update</span>
            </UiButton>
          </div>

          <div v-if="isDownloadingUpdate" class="space-y-1 pt-1">
            <div class="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
              <div
                class="h-full bg-blue-500 transition-all duration-200"
                :style="{ width: `${downloadProgress}%` }"
              />
            </div>
            <div class="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>Mengunduh payload...</span>
              <span>{{ downloadProgress }}%</span>
            </div>
          </div>
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

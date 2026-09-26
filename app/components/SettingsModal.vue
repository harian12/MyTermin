<script setup lang="ts">
import { TERMINAL_THEMES } from '~/composables/useThemes'
import {
  Plus,
  Trash2,
  RotateCcw,
  Terminal as TerminalIcon,
  Cpu,
  Bell,
  Keyboard,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Palette,
  SlidersHorizontal,
  TriangleAlert,
  Stethoscope,
  FileJson,
  Download,
  Upload,
  Eraser,
  Copy,
  Info,
  Key
} from 'lucide-vue-next'
import { DEFAULT_KEYBINDINGS, type KeybindingConfig, type ShellOption, type CustomTheme } from '~/types/terminal'
import { requestDesktopNotification } from '~/composables/useSettingsStore'
import { useUpdater } from '~/composables/useUpdater'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const { settings, updateSettings, addQuickCommand, removeQuickCommand, resetQuickCommands, addNotificationRule, updateNotificationRule, removeNotificationRule, findKeybindingConflicts, exportSettingsJson, importSettingsJson } = useSettingsStore()
const { clearSavedSession, activeWorkstation } = useWorkspaceStore()
const { getAvailableShells } = useTauriPty()
const { config, configPath, envEntries, saveState, loadConfig, saveConfig, setEnvValue, removeEnvValue, loadEnvFile, checkEnvSecretExposure, reset: resetProjectConfig } = useProjectConfig()
const { entries: logEntries, runtimeErrors, clear: clearLogs, collectDebugInfo } = useDiagnostics()
const { copyToClipboard } = useTauriPty()
const { showAppAlert } = useAppDialog()
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
const themeKeys = [...Object.keys(TERMINAL_THEMES), ...(settings.value.customTheme ? ['custom'] : [])]

type TabKey = 'appearance' | 'session' | 'shortcuts' | 'cli' | 'diagnostics'

const tabs: { key: TabKey; label: string; icon: typeof Palette }[] = [
  { key: 'appearance', label: 'Tampilan', icon: Palette },
  { key: 'session', label: 'Sesi & Env', icon: SlidersHorizontal },
  { key: 'shortcuts', label: 'Pintasan', icon: Keyboard },
  { key: 'cli', label: 'Quick Run', icon: TerminalIcon },
  { key: 'diagnostics', label: 'Diagnostik', icon: Stethoscope }
]

const activeTab = ref<TabKey>('appearance')

// Setara env yang belum tercakup .gitignore — peringatan, bukan pemblokiran.
const exposedSecrets = ref<string[]>([])

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    if (activeWorkstation.value?.folderPath && settings.value.useProjectConfig !== false) {
      await loadConfig(activeWorkstation.value.folderPath)
      exposedSecrets.value = await checkEnvSecretExposure(activeWorkstation.value.folderPath)
    } else {
      resetProjectConfig()
      exposedSecrets.value = []
    }
  }
)

// Form state untuk tambah quick command baru
const newLabel = ref('')
const newCommand = ref('')

const handleAddQuickCmd = () => {
  if (!newLabel.value.trim() || !newCommand.value.trim()) return
  addQuickCommand(newLabel.value, newCommand.value)
  newLabel.value = ''
  newCommand.value = ''
}

const keybindingList: { key: keyof KeybindingConfig; label: string; hint?: string }[] = [
  { key: 'newTab', label: 'Tab Baru' },
  { key: 'closeTab', label: 'Tutup Tab' },
  { key: 'duplicateTab', label: 'Duplikat Tab' },
  { key: 'reopenClosedTab', label: 'Buka Ulang Tab Tertutup' },
  { key: 'searchBuffer', label: 'Cari di Buffer' },
  { key: 'unifiedSearch', label: 'Unified Search', hint: 'Buffer terminal + file project' },
  { key: 'commandPalette', label: 'Command Palette' },
  { key: 'splitHorizontal', label: 'Split Horisontal' },
  { key: 'splitVertical', label: 'Split Vertikal' },
  { key: 'grid2x2', label: 'Grid 2x2' },
  { key: 'singleView', label: 'Single View' },
  { key: 'toggleSidebar', label: 'Toggle Sidebar' },
  { key: 'taskPanel', label: 'Panel Tasks' },
  { key: 'runTask', label: 'Jalankan Task Utama' },
  { key: 'aiPanel', label: 'AI CLI Runner' }
]

const conflicts = findKeybindingConflicts

const isConflict = (combo: string | undefined): boolean => {
  if (!combo) return false
  return Boolean(conflicts.value[normalizeShortcut(combo)])
}

const conflictActions = (combo: string | undefined): string[] => {
  if (!combo) return []
  return conflicts.value[normalizeShortcut(combo)] || []
}

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

const handleAddEnvRow = () => {
  envEntries.value = [...envEntries.value, { key: '', value: '', isSecret: false }]
}

const handleImportEnvFile = async () => {
  const root = activeWorkstation.value?.folderPath
  if (!root) return
  const loaded = (await loadEnvFile(root)) || []
  if (!loaded.length) {
    await showAppAlert('Tidak ditemukan .env, .env.local, atau .env.development di folder project.', 'Env File')
  }
}

const handleSaveProjectConfig = async () => {
  const root = activeWorkstation.value?.folderPath
  if (!root) return
  if (!config.value) {
    config.value = { env: {}, terminals: [] }
  }
  config.value.env = envEntries.value.reduce<Record<string, string>>((acc, entry) => {
    if (entry.key.trim()) acc[entry.key.trim()] = entry.value
    return acc
  }, {})
  const saved = await saveConfig(root)
  if (saved) {
    exposedSecrets.value = await checkEnvSecretExposure(root)
  }
}

const handleCopyDebugInfo = async () => {
  await copyToClipboard(collectDebugInfo())
}

const handleExportSettings = async () => {
  const json = exportSettingsJson()
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `mytermin_settings_${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const importInput = ref<HTMLInputElement | null>(null)

const handleImportClick = () => {
  importInput.value?.click()
}

const handleImportFile = async (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    importSettingsJson(text)
    await showAppAlert('Pengaturan berhasil diimpor dari file.', 'Import Berhasil')
  } catch (err) {
    await showAppAlert(`File tidak valid: ${err instanceof Error ? err.message : String(err)}`, 'Import Gagal')
  } finally {
    input.value = ''
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

const scrollback = computed({
  get: () => settings.value.scrollback || 5000,
  set: (val: number) => updateSettings({ scrollback: Math.max(1000, Math.min(50000, val || 5000)) })
})

onMounted(async () => {
  shells.value = await getAvailableShells()
  fetchCurrentVersion()
})
</script>

<template>
  <UiDialog
    :open="open"
    title="Terminal Settings"
    description="Sesuaikan tampilan, perilaku sesi, pintasan, dan Quick Run CLI."
    class="max-w-2xl"
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-4">
      <!-- Tab Navigation -->
      <div role="tablist" class="flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          role="tab"
          type="button"
          :aria-selected="activeTab === tab.key"
          :class="[
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors cursor-pointer',
            activeTab === tab.key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          ]"
          @click="activeTab = tab.key"
        >
          <component :is="tab.icon" class="h-3.5 w-3.5" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tampilan -->
      <div v-if="activeTab === 'appearance'" class="space-y-3">
        <UiSettingsGroup title="Font" description="Ukuran, jenis, dan Features huruf terminal">
          <UiSettingRow
            label="Font Size"
            hint="Juga bisa diubah cepat lewat Ctrl+Scroll di area terminal"
          >
            <UiInput
              type="number"
              min="8"
              max="32"
              class="h-8 text-xs"
              :model-value="settings.fontSize"
              @update:model-value="updateSettings({ fontSize: Number($event) })"
            />
          </UiSettingRow>

          <UiSettingRow label="Font Family" hint="Jenis huruf monospace yang dipakai terminal">
            <div class="w-full space-y-1.5">
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
                class="h-7 font-mono text-[11px]"
                @change="updateSettings({ fontFamily: customFontValue })"
              />
            </div>
          </UiSettingRow>

          <UiSettingRow label="Font Ligatures" hint="Gabungkan simbol kode (misal: =>, !=, ===)">
            <UiSwitch
              :model-value="settings.fontLigatures !== false"
              @update:model-value="updateSettings({ fontLigatures: $event })"
            />
          </UiSettingRow>
        </UiSettingsGroup>

        <UiSettingsGroup title="Warna & Kursor" description="Skema warna, palet ANSI, dan bentuk kursor">
          <UiSettingRow label="Color Theme" hint="Skema warna dan palet ANSI">
            <UiSelect
              :model-value="settings.theme"
              @update:model-value="updateSettings({ theme: $event as string })"
            >
              <option v-for="key in themeKeys" :key="key" :value="key">
                {{ key === 'custom' ? `${settings.customTheme?.name || 'Custom'} (kustom)` : TERMINAL_THEMES[key]?.name ?? key }}
              </option>
            </UiSelect>
          </UiSettingRow>

          <UiSettingRow label="Cursor Style" hint="Bentuk kursor pengetikan">
            <UiSelect
              :model-value="settings.cursorStyle"
              @update:model-value="updateSettings({ cursorStyle: $event as any })"
            >
              <option value="bar">Bar (Vertical Line)</option>
              <option value="block">Block (Solid)</option>
              <option value="underline">Underline</option>
            </UiSelect>
          </UiSettingRow>

          <UiSettingRow
            label="Shell Integration"
            hint="Status badge exit code/durasi per terminal. Membutuhkan PowerShell atau Git Bash."
          >
            <UiSwitch
              :model-value="settings.shellIntegration !== false"
              @update:model-value="updateSettings({ shellIntegration: $event })"
            />
          </UiSettingRow>
        </UiSettingsGroup>

        <UiSettingsGroup
          title="Theme Editor"
          description="Buat palet ANSI sendiri; hasil langsung dipakai terminal dan bisa diekspor di tab Diagnostik"
        >
          <template #icon><Palette class="h-3.5 w-3.5 text-cyan-400" /></template>
          <div class="p-2.5">
            <ThemeEditor
              :model-value="settings.customTheme"
              @update:model-value="(val: CustomTheme) => updateSettings({ customTheme: val, theme: 'custom' })"
            />
          </div>
        </UiSettingsGroup>
      </div>

      <!-- Sesi -->
      <div v-else-if="activeTab === 'session'" class="space-y-3">
        <UiSettingsGroup title="Sesi Terminal" description="Shell bawaan dan batas riwayat log">
          <UiSettingRow label="Default Shell" hint="Shell yang dipakai saat membuka terminal baru">
            <UiSelect
              :model-value="settings.defaultShell"
              @update:model-value="updateSettings({ defaultShell: $event as string })"
            >
              <option v-for="sh in shells" :key="sh.path" :value="sh.path">
                {{ sh.name }}
              </option>
            </UiSelect>
          </UiSettingRow>

          <UiSettingRow label="Scrollback Buffer" hint="Batas riwayat baris log terminal (1000 - 50000)">
            <div class="flex w-full items-center justify-end gap-2">
              <UiInput
                type="number"
                :min="1000"
                :max="50000"
                :step="1000"
                class="h-8 font-mono text-xs"
                :model-value="scrollback"
                @update:model-value="scrollback = Number($event)"
              />
              <span class="shrink-0 text-[11px] text-muted-foreground">lines</span>
            </div>
          </UiSettingRow>
        </UiSettingsGroup>

        <UiSettingsGroup title="Performa & Sistem" description="Rendering GPU dan notifikasi OS">
          <template #icon><Cpu class="h-3.5 w-3.5 text-cyan-400" /></template>
          <UiSettingRow
            label="GPU / WebGL Acceleration"
            hint="Rendering terminal berbasis hardware GPU untuk performa 60 FPS"
          >
            <UiSwitch
              :model-value="settings.enableWebgl !== false"
              @update:model-value="updateSettings({ enableWebgl: $event })"
            />
          </UiSettingRow>

          <UiSettingRow
            label="Desktop OS Notifications"
            hint="Toast OS saat proses background selesai atau aplikasi di-minimize"
          >
            <template #icon><Bell class="h-3.5 w-3.5 text-amber-400" /></template>
            <UiSwitch
              :model-value="settings.enableNotifications !== false"
              @update:model-value="handleToggleNotification($event)"
            />
          </UiSettingRow>
        </UiSettingsGroup>

        <UiSettingsGroup title="Pembaruan Aplikasi" description="Periksa dan pasang versi terbaru MyTermin">
          <template #icon><Sparkles class="h-3.5 w-3.5 text-blue-400" /></template>
          <template #action>
            <span class="rounded border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 font-mono text-[10px] text-blue-400">
              v{{ currentAppVersion }}
            </span>
            <UiButton
              variant="outline"
              size="sm"
              class="h-7 gap-1.5 border-border/60 text-xs"
              :disabled="isCheckingUpdate || isDownloadingUpdate"
              @click="checkForUpdates(false)"
            >
              <RefreshCw class="h-3 w-3" :class="{ 'animate-spin': isCheckingUpdate }" />
              <span>{{ isCheckingUpdate ? 'Memeriksa...' : 'Cek Update' }}</span>
            </UiButton>
          </template>

          <UiSettingRow
            label="Status Pembaruan"
            :hint="updateStatus === 'idle' ? 'Belum pernah dicek pada sesi ini' : updateStatusMessage"
          >
            <template #icon>
              <RefreshCw
                v-if="updateStatus === 'idle' || updateStatus === 'checking'"
                class="h-3.5 w-3.5 text-muted-foreground"
                :class="{ 'animate-spin': updateStatus === 'checking' }"
              />
              <CheckCircle2 v-else-if="updateStatus === 'up-to-date'" class="h-3.5 w-3.5 text-emerald-400" />
              <AlertCircle v-else-if="updateStatus === 'error'" class="h-3.5 w-3.5 text-destructive" />
              <Sparkles v-else class="h-3.5 w-3.5 text-blue-400" />
            </template>

            <UiButton
              v-if="hasUpdate"
              size="sm"
              class="h-7 shrink-0 gap-1 bg-blue-600 px-3 text-xs text-white hover:bg-blue-500"
              :disabled="isDownloadingUpdate"
              @click="downloadAndInstall"
            >
              <span>Pasang Update</span>
            </UiButton>
            <div v-else-if="isDownloadingUpdate" class="w-full space-y-1">
              <div class="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                <div class="h-full bg-blue-500 transition-all duration-200" :style="{ width: `${downloadProgress}%` }" />
              </div>
              <p class="text-right font-mono text-[10px] text-muted-foreground">{{ downloadProgress }}%</p>
            </div>
            <span v-else-if="newVersion" class="font-mono text-[11px] text-muted-foreground">
              {{ newVersion }}
            </span>
          </UiSettingRow>
        </UiSettingsGroup>

        <UiSettingsGroup
          title="Notification Rules"
          description="Notifikasi OS hanya berbunyi bila aturan ini terpenuhi"
        >
          <template #icon><Bell class="h-3.5 w-3.5 text-amber-400" /></template>
          <template #action>
            <UiButton
              variant="ghost"
              size="sm"
              class="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              @click="addNotificationRule()"
            >
              <Plus class="h-3 w-3" />
              <span>Tambah Rule</span>
            </UiButton>
          </template>

          <div v-if="!(settings.notificationRules || []).length" class="px-3.5 py-4 text-center text-[11px] text-muted-foreground">
            Belum ada rule. Notifikasi hanya relying pada deteksi proses selesai.
          </div>

          <div v-for="rule in (settings.notificationRules || [])" :key="rule.id" class="px-3.5 py-2.5">
            <div class="flex items-center gap-2">
              <UiInput
                :model-value="rule.label"
                class="h-7 flex-1 text-xs"
                @update:model-value="updateNotificationRule(rule.id, { label: $event as string })"
              />
              <UiSwitch
                :model-value="rule.enabled"
                @update:model-value="updateNotificationRule(rule.id, { enabled: $event })"
              />
              <button
                type="button"
                class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Hapus rule"
                @click="removeNotificationRule(rule.id)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>

            <div class="mt-2 flex items-center gap-2">
              <UiSelect
                class="w-40 shrink-0"
                :model-value="rule.kind"
                @update:model-value="updateNotificationRule(rule.id, { kind: $event as any })"
              >
                <option value="keyword">Kata Kunci</option>
                <option value="regex">Regex</option>
                <option value="exit-code">Exit Code</option>
                <option value="terminal-name">Nama Terminal</option>
                <option value="duration">Durasi (detik)</option>
              </UiSelect>

              <UiInput
                v-if="rule.kind !== 'exit-code'"
                :model-value="rule.pattern"
                :placeholder="rule.kind === 'duration' ? 'mis. 45' : rule.kind === 'terminal-name' ? 'mis. API' : 'mis. EADDRINUSE'"
                class="h-7 flex-1 font-mono text-[11px]"
                @update:model-value="updateNotificationRule(rule.id, { pattern: $event as string })"
              />
              <span v-else class="flex-1 text-[11px] text-muted-foreground">
                Berbunyi saat exit code bukan 0
              </span>

              <label class="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <input
                  type="number"
                  min="0"
                  class="h-7 w-14 rounded-md border border-input bg-transparent px-1.5 text-right text-[11px] outline-none focus:ring-1 focus:ring-ring"
                  :value="rule.cooldownSec"
                  title="Cooldown detik agar tidak spam"
                  @change="updateNotificationRule(rule.id, { cooldownSec: Number(($event.target as HTMLInputElement).value) || 0 })"
                >
                <span>s cooldown</span>
              </label>
            </div>
          </div>
        </UiSettingsGroup>

        <UiSettingsGroup
          title="Project Config & Env"
          description="Konfigurasi dan environment variable khusus project ini"
        >
          <template #icon><FileJson class="h-3.5 w-3.5 text-sky-400" /></template>

          <UiSettingRow
            label="Gunakan .mytermin/project.json"
            hint="Env dan config terminal di-commit ke repo agar workspace konsisten antar developer"
          >
            <UiSwitch
              :model-value="settings.useProjectConfig !== false"
              @update:model-value="updateSettings({ useProjectConfig: $event })"
            />
          </UiSettingRow>

          <UiSettingRow
            label="Lokasi config"
            :hint="configPath || (activeWorkstation?.folderPath ? 'Belum ada — simpan untuk membuat file' : 'Buka folder project dulu')"
          >
            <div class="flex w-full items-center justify-end gap-1.5">
              <UiButton
                v-if="activeWorkstation?.folderPath"
                variant="ghost"
                size="sm"
                class="h-7 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                title="Baca ulang dari disk"
                @click="loadConfig(activeWorkstation.folderPath)"
              >
                <RotateCcw class="h-3 w-3" />
              </UiButton>
              <UiButton
                variant="outline"
                size="sm"
                class="h-7 shrink-0 gap-1 px-2.5 text-[11px]"
                :disabled="!activeWorkstation?.folderPath || saveState === 'saving'"
                @click="handleSaveProjectConfig"
              >
                <span>{{ saveState === 'saved' ? 'Tersimpan' : 'Simpan' }}</span>
              </UiButton>
            </div>
          </UiSettingRow>

          <div class="px-3.5 py-2.5">
            <div class="flex items-center justify-between pb-1.5">
              <p class="text-[11px] font-medium text-foreground/90">Environment Variables</p>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Isi dari file .env project"
                  @click="handleImportEnvFile"
                >
                  Isi dari .env
                </button>
                <button
                  type="button"
                  class="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  @click="handleAddEnvRow"
                >
                  + Tambah
                </button>
              </div>
            </div>

            <p
              v-if="exposedSecrets.length > 0"
              class="mb-2 flex items-start gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-300"
            >
              <TriangleAlert class="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Key sensitif berikut belum tercakup .gitignore: {{ exposedSecrets.join(', ') }}.
                Jangan commit nilainya.
              </span>
            </p>

            <div v-if="envEntries.length === 0" class="rounded-md border border-dashed border-border/60 px-2 py-3 text-center text-[10px] text-muted-foreground">
              Belum ada env variable.
            </div>

            <div v-for="(entry, idx) in envEntries" :key="idx" class="flex items-center gap-1.5 pb-1">
              <UiInput
                :model-value="entry.key"
                class="h-7 w-40 shrink-0 font-mono text-[11px]"
                placeholder="KEY"
                @update:model-value="envEntries[idx] = { ...entry, key: $event as string }"
              />
              <UiInput
                :model-value="entry.value"
                class="h-7 flex-1 font-mono text-[11px]"
                :type="entry.isSecret ? 'password' : 'text'"
                placeholder="value"
                @update:model-value="setEnvValue(entry.key, $event as string)"
              />
              <button
                type="button"
                class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                @click="removeEnvValue(entry.key)"
              >
                <Trash2 class="h-3 w-3" />
              </button>
            </div>
          </div>
        </UiSettingsGroup>

        <UiSettingsGroup title="Data Sesi" description="Hapus state sesi terminal yang tersimpan">
          <template #icon><TriangleAlert class="h-3.5 w-3.5 text-amber-400" /></template>
          <UiSettingRow label="Reset Session" hint="Menghapus seluruh data sesi tersimpan, termasuk tab yang dibuka ulang terakhir">
            <UiButton
              variant="outline"
              size="sm"
              class="h-7 shrink-0 border-destructive/30 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              @click="clearSavedSession"
            >
              Reset
            </UiButton>
          </UiSettingRow>
        </UiSettingsGroup>
      </div>

      <!-- Pintasan -->
      <div v-else-if="activeTab === 'shortcuts'" class="space-y-3">
        <UiSettingsGroup
          title="Keyboard Shortcuts"
          description="Klik kolom shortcut lalu tekan kombinasi tombol yang diinginkan (Esc untuk batal)"
        >
          <template #icon><Keyboard class="h-3.5 w-3.5 text-violet-400" /></template>
          <template #action>
            <UiButton
              variant="ghost"
              size="sm"
              class="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              title="Reset ke default shortcuts"
              @click="resetKeybindings"
            >
              <RotateCcw class="h-3 w-3" />
              <span>Reset</span>
            </UiButton>
          </template>

          <div
            v-if="Object.keys(conflicts).length > 0"
            class="flex items-start gap-2 border-b border-border/40 bg-amber-500/5 px-3.5 py-2 text-[11px] text-amber-300"
          >
            <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div class="space-y-0.5">
              <p v-for="(actions, combo) in conflicts" :key="combo">
                <span class="font-mono">{{ combo }}</span> dipakai oleh
                <span class="font-medium">{{ actions.join(', ') }}</span> — hanya yang pertama yang terpakai.
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-1.5 p-2.5 sm:grid-cols-2">
            <div
              v-for="item in keybindingList"
              :key="item.key"
              class="flex items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-2.5 py-1.5"
            >
              <div class="min-w-0">
                <p class="truncate text-[11px] font-medium text-foreground/90">{{ item.label }}</p>
                <p v-if="item.hint" class="truncate text-[10px] text-muted-foreground/70">{{ item.hint }}</p>
              </div>
              <div class="w-40 shrink-0">
                <KeybindingInput
                  :model-value="settings.keybindings?.[item.key] || DEFAULT_KEYBINDINGS[item.key]"
                  :conflict="isConflict(settings.keybindings?.[item.key] || DEFAULT_KEYBINDINGS[item.key])"
                  @update:model-value="updateKeybinding(item.key, $event)"
                />
              </div>
            </div>
          </div>
        </UiSettingsGroup>

        <div class="rounded-lg border border-border/50 bg-muted/10 px-3.5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <p>
            <span class="font-medium text-foreground/90">Merekam:</span> klik kolom shortcut lalu tekan
            kombinasi tombol yang diinginkan (Esc untuk batal). Modifier yang bisa dipakai: Ctrl, Shift, Alt, Win.
          </p>
          <p class="pt-1">
            <span class="font-medium text-foreground/90">Menghapus:</span> klik ikon X. Aksi tanpa shortcut
            tidak lagi punya pintasan keyboard.
          </p>
        </div>
      </div>

      <!-- Quick Run CLI -->
      <div v-else-if="activeTab === 'cli'" class="space-y-3">
        <UiSettingsGroup
          title="Quick Run CLI Snippets"
          description="Tombol pintas CLI cepat pada header setiap panel terminal"
        >
          <template #icon><TerminalIcon class="h-3.5 w-3.5 text-emerald-400" /></template>
          <template #action>
            <UiButton
              variant="ghost"
              size="sm"
              class="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              title="Reset to default snippets"
              @click="resetQuickCommands"
            >
              <RotateCcw class="h-3 w-3" />
              <span>Reset</span>
            </UiButton>
          </template>

          <div class="space-y-1.5 p-2.5">
            <p
              v-if="!(settings.quickCommands || []).length"
              class="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-[11px] text-muted-foreground"
            >
              Belum ada snippet. Tambahkan perintah cepat di bawah.
            </p>

            <div
              v-for="cmd in (settings.quickCommands || [])"
              :key="cmd.id"
              class="flex items-center gap-2 rounded-md border border-border/50 bg-background/60 px-2.5 py-1.5 text-xs"
            >
              <span class="w-24 shrink-0 truncate font-medium text-foreground">{{ cmd.label }}</span>
              <span class="min-w-0 flex-1 truncate rounded border border-border/30 bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-emerald-400">
                {{ cmd.command }}
              </span>
              <button
                type="button"
                class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                title="Hapus snippet"
                @click="removeQuickCommand(cmd.id)"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>

            <div class="flex items-center gap-2 pt-1">
              <UiInput
                v-model="newLabel"
                placeholder="Label (e.g. Test Suite)"
                class="h-8 flex-1 text-xs"
                @keydown.enter="handleAddQuickCmd"
              />
              <UiInput
                v-model="newCommand"
                placeholder="Command (e.g. npm run test)"
                class="h-8 flex-1 font-mono text-xs"
                @keydown.enter="handleAddQuickCmd"
              />
              <UiButton
                variant="secondary"
                size="sm"
                class="h-8 shrink-0 gap-1 px-3 text-xs"
                :disabled="!newLabel.trim() || !newCommand.trim()"
                @click="handleAddQuickCmd"
              >
                <Plus class="h-3.5 w-3.5" />
                <span>Tambah</span>
              </UiButton>
            </div>
          </div>
        </UiSettingsGroup>
      </div>

      <!-- Diagnostik -->
      <div v-else class="space-y-3">
        <UiSettingsGroup
          title="Diagnostics"
          description="Salin info runtime ini saat lapor bug agar masalahnya mudah ditelusuri"
        >
          <template #icon><Stethoscope class="h-3.5 w-3.5 text-rose-400" /></template>
          <UiSettingRow
            label="Error runtime tercatat"
            :hint="`${runtimeErrors} error dalam sesi aplikasi ini`"
          >
            <span
              :class="[
                'rounded border px-2 py-0.5 font-mono text-[11px]',
                runtimeErrors > 0 ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-border/60 text-muted-foreground'
              ]"
            >
              {{ runtimeErrors }}
            </span>
          </UiSettingRow>

          <UiSettingRow label="Backup pengaturan" hint="Ekspor seluruh settings, keybinding, tema, dan rule ke file JSON">
            <div class="flex w-full items-center justify-end gap-1.5">
              <UiButton variant="outline" size="sm" class="h-7 shrink-0 gap-1 px-2 text-[11px]" @click="handleImportClick">
                <Upload class="h-3 w-3" />
                <span>Impor</span>
              </UiButton>
              <UiButton variant="outline" size="sm" class="h-7 shrink-0 gap-1 px-2 text-[11px]" @click="handleExportSettings">
                <Download class="h-3 w-3" />
                <span>Ekspor</span>
              </UiButton>
            </div>
          </UiSettingRow>

          <UiSettingRow label="Copy debug info" hint="Clipboard berisi versi, workstation, terminal, keybinding, dan 50 log terakhir">
            <div class="flex w-full items-center justify-end gap-1.5">
              <UiButton variant="ghost" size="sm" class="h-7 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground" @click="clearLogs">
                <Eraser class="h-3 w-3" />
                <span>Bersihkan Log</span>
              </UiButton>
              <UiButton size="sm" class="h-7 shrink-0 gap-1 px-2.5 text-[11px]" @click="handleCopyDebugInfo">
                <Copy class="h-3 w-3" />
                <span>Copy</span>
              </UiButton>
            </div>
          </UiSettingRow>
          <input ref="importInput" type="file" accept="application/json" class="hidden" @change="handleImportFile">
        </UiSettingsGroup>

        <UiSettingsGroup title="Log Sesi" :description="`${logEntries.length} entri terakhir`">
          <template #icon><Info class="h-3.5 w-3.5 text-muted-foreground" /></template>
          <div class="max-h-64 overflow-y-auto px-3 py-2">
            <p v-if="logEntries.length === 0" class="py-4 text-center text-[11px] text-muted-foreground">
              Belum ada log pada sesi ini.
            </p>
            <ul v-else class="space-y-0.5">
              <li
                v-for="(log, idx) in logEntries.slice().reverse()"
                :key="idx"
                class="flex items-start gap-2 font-mono text-[10px] leading-relaxed"
              >
                <span class="shrink-0 text-muted-foreground/70">
                  {{ new Date(log.at).toLocaleTimeString() }}
                </span>
                <span
                  :class="[
                    'shrink-0 uppercase',
                    log.level === 'error' ? 'text-rose-400' : log.level === 'warn' ? 'text-amber-400' : 'text-sky-400'
                  ]"
                >
                  {{ log.level }}
                </span>
                <span class="shrink-0 text-muted-foreground">{{ log.scope }}</span>
                <span class="min-w-0 flex-1 break-words text-foreground/80">{{ log.message }}</span>
              </li>
            </ul>
          </div>
        </UiSettingsGroup>
      </div>
    </div>

    <template #footer>
      <UiButton variant="default" @click="emit('update:open', false)">
        Selesai
      </UiButton>
    </template>
  </UiDialog>
</template>

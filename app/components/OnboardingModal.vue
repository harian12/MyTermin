<script setup lang="ts">
import { Rocket, FolderOpen, Terminal, ListTodo, Bell, Keyboard, ArrowRight, Check } from 'lucide-vue-next'
import { TERMINAL_THEMES } from '~/composables/useThemes'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const { settings, updateSettings } = useSettingsStore()
const { addTerminal } = useWorkspaceStore()
const { pickFolder, setWorkstationFolder } = useProjectExplorer()
const { getAvailableShells } = useTauriPty()
const { requestDesktopNotification } = useSettingsStore()

const shells = ref<{ name: string; path: string }[]>([])
const selectedTheme = ref(settings.value.theme)
const selectedShell = ref(settings.value.defaultShell)
const enableShellIntegration = ref(settings.value.shellIntegration !== false)
const enableNotifications = ref(settings.value.enableNotifications !== false)
const chosenFolder = ref('')

onMounted(async () => {
  shells.value = await getAvailableShells()
})

const pickProject = async () => {
  const folder = await pickFolder()
  if (folder) chosenFolder.value = folder
}

const finish = async () => {
  updateSettings({
    theme: selectedTheme.value,
    defaultShell: selectedShell.value,
    shellIntegration: enableShellIntegration.value,
    enableNotifications: enableNotifications.value,
    firstRunDone: true
  })

  if (chosenFolder.value) {
    await setWorkstationFolder(chosenFolder.value)
    addTerminal({ cwd: chosenFolder.value })
  } else {
    addTerminal()
  }

  if (enableNotifications.value) {
    await requestDesktopNotification()
  }

  emit('update:open', false)
}

const FEATURES = [
  { icon: FolderOpen, title: 'Multi-workstation', desc: 'Bekerja di beberapa project terisolasi dalam satu jendela.' },
  { icon: Terminal, title: 'Terminal + Editor', desc: 'xterm.js dan Monaco dalam layout split yang bisa diatur.' },
  { icon: ListTodo, title: 'Task Runner', desc: 'Deteksi task dari package.json, Makefile, atau justfile lalu jalankan sekali klik.' },
  { icon: Bell, title: 'Notification rules', desc: 'Diberi tahu hanya saat terminal selesai atau output berisi error.' },
  { icon: Keyboard, title: 'Shortcut bisa direkam', desc: 'Tekan kombinasi tombol untuk mengubahnya, bukan mengetik manual.' }
]
</script>

<template>
  <UiDialog
    :open="open"
    title="Selamat datang di MyTermin"
    description="Tiga langkah singkat, lalu workspace Anda siap dipakai."
    class="max-w-2xl"
    @update:open="emit('update:open', false)"
  >
    <div class="space-y-4">
      <div class="grid gap-2 sm:grid-cols-2">
        <div
          v-for="feature in FEATURES"
          :key="feature.title"
          class="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/10 px-3 py-2.5"
        >
          <component :is="feature.icon" class="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div class="min-w-0">
            <p class="text-[12px] font-medium text-foreground">{{ feature.title }}</p>
            <p class="text-[11px] leading-relaxed text-muted-foreground">{{ feature.desc }}</p>
          </div>
        </div>
      </div>

      <div class="space-y-2.5 rounded-lg border border-border/50 bg-muted/10 p-3">
        <div class="flex items-center gap-2">
          <label class="w-32 shrink-0 text-[11px] text-muted-foreground">Folder Project</label>
          <button
            class="flex h-8 flex-1 items-center gap-2 rounded-md border border-dashed border-border/60 px-2.5 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            @click="pickProject"
          >
            <FolderOpen class="h-3.5 w-3.5 shrink-0" />
            <span class="truncate">{{ chosenFolder || 'Pilih folder project (opsional, bisa nanti)' }}</span>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <label class="w-32 shrink-0 text-[11px] text-muted-foreground">Tema</label>
          <UiSelect v-model="selectedTheme">
            <option v-for="key in Object.keys(TERMINAL_THEMES)" :key="key" :value="key">
              {{ TERMINAL_THEMES[key]?.name ?? key }}
            </option>
          </UiSelect>
        </div>

        <div class="flex items-center gap-2">
          <label class="w-32 shrink-0 text-[11px] text-muted-foreground">Default Shell</label>
          <UiSelect v-model="selectedShell">
            <option v-for="sh in shells" :key="sh.path" :value="sh.path">{{ sh.name }}</option>
          </UiSelect>
        </div>

        <div class="flex items-center justify-between gap-2">
          <label class="w-32 shrink-0 text-[11px] text-muted-foreground">Shell Integration</label>
          <UiSwitch v-model="enableShellIntegration" />
        </div>

        <div class="flex items-center justify-between gap-2">
          <label class="w-32 shrink-0 text-[11px] text-muted-foreground">Notifikasi OS</label>
          <UiSwitch v-model="enableNotifications" />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <p class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Check class="h-3 w-3" />
          Bisa diubah kapan saja di Pengaturan
        </p>
        <div class="flex items-center gap-2">
          <UiButton
            variant="ghost"
            size="sm"
            class="h-8 text-xs text-muted-foreground"
            @click="() => { updateSettings({ firstRunDone: true }); emit('update:open', false) }"
          >
            Lewati
          </UiButton>
          <UiButton size="sm" class="h-8 gap-1.5 text-xs" @click="finish">
            <span>Mulai Sekarang</span>
            <ArrowRight class="h-3.5 w-3.5" />
          </UiButton>
        </div>
      </div>
    </template>
  </UiDialog>
</template>

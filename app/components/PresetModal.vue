<script setup lang="ts">
import {
  Sparkles,
  Bot,
  LayoutGrid,
  Code,
  Server,
  Terminal,
  Plus,
  Trash2,
  BookmarkPlus,
  Check,
  Folder,
  Pencil,
  Power
} from 'lucide-vue-next'
import type { WorkspacePreset, LayoutType } from '~/types/terminal'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const {
  presets,
  terminals,
  currentLayout,
  applyPreset,
  saveCurrentAsPreset,
  updatePreset,
  deletePreset
} = useWorkspaceStore()

const { settings, updateSettings } = useSettingsStore()

const showCreateForm = ref(false)
const presetName = ref('')
const presetDesc = ref('')
const selectedIcon = ref('sparkles')

// State untuk Edit Preset
const editingPresetId = ref<string | null>(null)
const editForm = ref<{
  id: string
  name: string
  description: string
  icon: string
  layout: LayoutType
  terminals: { title: string; cwd?: string; command?: string }[]
} | null>(null)

// Command per tab yang tampil saat ini, disimpan dalam preset baru.
const tabCommands = ref<Record<string, string>>({})

const iconOptions = [
  { id: 'sparkles', label: 'AI Sparkle', icon: Sparkles },
  { id: 'bot', label: 'Bot Assistant', icon: Bot },
  { id: 'layout-grid', label: 'Grid Matrix', icon: LayoutGrid },
  { id: 'code', label: 'Coding', icon: Code },
  { id: 'server', label: 'Server Dev', icon: Server },
  { id: 'terminal', label: 'CLI Console', icon: Terminal }
]

// Isi command default dari initialCommand tiap tab saat form create dibuka
watch(() => showCreateForm.value, (open) => {
  if (open) {
    editingPresetId.value = null
    editForm.value = null
    const map: Record<string, string> = {}
    for (const t of terminals.value) {
      if (t.initialCommand) map[t.id] = t.initialCommand
    }
    tabCommands.value = map
  }
})

const handleSelectPreset = (preset: WorkspacePreset) => {
  applyPreset(preset)
  emit('update:open', false)
}

const handleCreatePreset = () => {
  if (!presetName.value.trim()) return
  const tabs = terminals.value.map(t => ({
    title: t.title,
    command: (tabCommands.value[t.id] || '').trim() || t.initialCommand,
    shell: t.shell,
    cwd: t.cwd
  }))
  saveCurrentAsPreset(presetName.value, presetDesc.value, selectedIcon.value, tabs)
  presetName.value = ''
  presetDesc.value = ''
  tabCommands.value = {}
  showCreateForm.value = false
}

// Mulai edit preset
const handleStartEdit = (e: MouseEvent, preset: WorkspacePreset) => {
  e.stopPropagation()
  showCreateForm.value = false
  editingPresetId.value = preset.id
  editForm.value = {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    icon: preset.icon || 'sparkles',
    layout: preset.layout,
    terminals: preset.terminals.map(t => ({
      title: t.title,
      cwd: t.cwd || '',
      command: t.command || ''
    }))
  }
}

const handleCancelEdit = () => {
  editingPresetId.value = null
  editForm.value = null
}

const handleAddEditTab = () => {
  if (!editForm.value) return
  editForm.value.terminals.push({
    title: `Terminal ${editForm.value.terminals.length + 1}`,
    cwd: '',
    command: ''
  })
}

const handleRemoveEditTab = (index: number) => {
  if (!editForm.value) return
  editForm.value.terminals.splice(index, 1)
}

const handleSaveEdit = () => {
  if (!editForm.value || !editForm.value.name.trim()) return
  const updated: WorkspacePreset = {
    id: editForm.value.id,
    name: editForm.value.name.trim(),
    description: editForm.value.description.trim(),
    icon: editForm.value.icon,
    layout: editForm.value.layout,
    terminals: editForm.value.terminals.map(t => ({
      title: t.title.trim() || 'Terminal',
      cwd: t.cwd?.trim() || undefined,
      command: t.command?.trim() || undefined
    }))
  }
  updatePreset(updated)
  editingPresetId.value = null
  editForm.value = null
}

const handleDeletePreset = (e: MouseEvent, presetId: string) => {
  e.stopPropagation()
  deletePreset(presetId)
  if (editingPresetId.value === presetId) {
    handleCancelEdit()
  }
}

// Toggle auto run on startup
const isStartupPreset = (presetId: string) => {
  return (settings.value.startupPresetIds || []).includes(presetId)
}

const toggleStartupPreset = (e: Event, presetId: string) => {
  e.stopPropagation()
  const current = settings.value.startupPresetIds || []
  const exists = current.includes(presetId)
  const next = exists
    ? current.filter(id => id !== presetId)
    : [...current, presetId]
  updateSettings({ startupPresetIds: next })
}
</script>

<template>
  <UiDialog
    :open="open"
    title="Workspace Presets"
    description="Pilih preset, atur auto-run saat aplikasi dinyalakan, atau sesuaikan konfigurasi tab & command."
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-3 py-1 max-h-[74vh] overflow-y-auto pr-1">
      <!-- Create Custom Preset Toggle / Banner -->
      <div class="flex items-center justify-between p-3 rounded-lg border border-border/70 bg-[#13141e]">
        <div class="flex items-center gap-2.5">
          <div class="p-2 rounded-lg bg-white/10 text-white">
            <BookmarkPlus class="w-4 h-4" />
          </div>
          <div>
            <h4 class="text-xs font-semibold text-foreground">Simpan State Saat Ini Jadi Preset</h4>
            <p class="text-[11px] text-muted-foreground">
              {{ terminals.length }} Terminal terdeteksi (Layout: {{ currentLayout }})
            </p>
          </div>
        </div>

        <UiButton
          variant="secondary"
          size="sm"
          class="h-7 text-xs gap-1.5"
          @click="showCreateForm = !showCreateForm"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>{{ showCreateForm ? 'Batal' : 'Buat Preset' }}</span>
        </UiButton>
      </div>

      <!-- Create Preset Form -->
      <div
        v-if="showCreateForm"
        class="p-3.5 rounded-lg border border-primary/40 bg-[#161826] space-y-3 animate-in fade-in zoom-in-95"
      >
        <div class="space-y-1">
          <UiLabel class="text-xs font-medium">Nama Preset</UiLabel>
          <UiInput
            v-model="presetName"
            placeholder="Contoh: LMS Frontend + Backend API"
            class="h-8 text-xs bg-background/80"
          />
        </div>

        <div class="space-y-1">
          <UiLabel class="text-xs font-medium">Deskripsi Singkat (Opsional)</UiLabel>
          <UiInput
            v-model="presetDesc"
            placeholder="Contoh: 2 Tab Vite dev server & 1 Tab Go API"
            class="h-8 text-xs bg-background/80"
          />
        </div>

        <!-- Icon Picker -->
        <div class="space-y-1.5">
          <UiLabel class="text-xs font-medium">Pilih Ikon Preset</UiLabel>
          <div class="flex items-center gap-2">
            <button
              v-for="opt in iconOptions"
              :key="opt.id"
              type="button"
              :class="[
                'p-2 rounded-md border text-xs flex items-center justify-center transition-all cursor-pointer',
                selectedIcon === opt.id
                  ? 'bg-primary/20 border-primary text-white shadow-sm'
                  : 'border-border/60 bg-background/40 text-muted-foreground hover:text-foreground'
              ]"
              :title="opt.label"
              @click="selectedIcon = opt.id"
            >
              <component :is="opt.icon" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Terminal tabs editor: custom tabs + command yang akan dijalankan -->
        <div class="pt-2 border-t border-border/40 text-[11px] text-muted-foreground space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-medium text-foreground/80">Tab yang akan disimpan & Command-nya:</span>
          </div>

          <div class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            <div
              v-for="t in terminals"
              :key="t.id"
              class="flex items-center gap-1.5"
            >
              <div class="px-2 py-1 rounded bg-background/60 border border-border/30 truncate flex-shrink-0 min-w-0 flex-1">
                <span class="font-medium text-white/90 truncate block">{{ t.title }}</span>
                <span v-if="t.cwd" class="text-[9px] text-muted-foreground truncate flex items-center gap-1">
                  <Folder class="w-2.5 h-2.5 flex-shrink-0" />
                  <span class="truncate">{{ t.cwd }}</span>
                </span>
              </div>
              <UiInput
                :model-value="tabCommands[t.id] ?? t.initialCommand ?? ''"
                placeholder="Command (contoh: opencode)"
                class="h-7 text-[11px] flex-1 font-mono bg-background/80"
                @update:model-value="tabCommands[t.id] = $event"
              />
            </div>

            <p v-if="!terminals.length" class="px-1 text-[11px] text-muted-foreground/80">
              Tidak ada tab aktif. Buka tab dulu sebelum menyimpan preset.
            </p>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-1">
          <UiButton variant="ghost" size="sm" class="h-7 text-xs" @click="showCreateForm = false">
            Batal
          </UiButton>
          <UiButton
            variant="default"
            size="sm"
            class="h-7 text-xs gap-1"
            :disabled="!presetName.trim()"
            @click="handleCreatePreset"
          >
            <Check class="w-3.5 h-3.5" />
            <span>Simpan Preset Kustom</span>
          </UiButton>
        </div>
      </div>

      <!-- Edit Preset Form Modal / Panel -->
      <div
        v-if="editForm"
        class="p-3.5 rounded-lg border border-indigo-500/50 bg-[#171929] space-y-3 animate-in fade-in zoom-in-95 shadow-md"
      >
        <div class="flex items-center justify-between pb-1 border-b border-border/40">
          <span class="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
            <Pencil class="w-3.5 h-3.5 text-indigo-400" />
            <span>Edit Preset: {{ editForm.name }}</span>
          </span>
          <UiBadge variant="outline" class="text-[10px] uppercase font-mono">
            Layout: {{ editForm.layout }}
          </UiBadge>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1">
            <UiLabel class="text-xs font-medium">Nama Preset</UiLabel>
            <UiInput
              v-model="editForm.name"
              placeholder="Nama Preset"
              class="h-8 text-xs bg-background/80"
            />
          </div>
          <div class="space-y-1">
            <UiLabel class="text-xs font-medium">Deskripsi</UiLabel>
            <UiInput
              v-model="editForm.description"
              placeholder="Deskripsi Singkat"
              class="h-8 text-xs bg-background/80"
            />
          </div>
        </div>

        <!-- Layout selector in Edit mode -->
        <div class="flex items-center justify-between gap-2">
          <UiLabel class="text-xs font-medium">Layout Matrix</UiLabel>
          <select
            v-model="editForm.layout"
            class="h-7 text-xs rounded border border-border/60 bg-background/80 px-2 text-foreground font-mono focus:outline-none focus:border-primary"
          >
            <option value="single">Single (1 Tab Utama)</option>
            <option value="split-h">Split Horizontal (2 Kolom)</option>
            <option value="split-v">Split Vertical (2 Baris)</option>
            <option value="grid-2x2">Grid 2x2 (4 Kuadran)</option>
          </select>
        </div>

        <!-- Terminal tabs in Edit mode -->
        <div class="pt-2 border-t border-border/40 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-foreground/90">Daftar Tab Terminal & Command</span>
            <UiButton
              variant="outline"
              size="sm"
              class="h-6 text-[10px] gap-1 px-2"
              @click="handleAddEditTab"
            >
              <Plus class="w-3 h-3" />
              <span>Tambah Tab</span>
            </UiButton>
          </div>

          <div class="space-y-2 max-h-44 overflow-y-auto pr-1">
            <div
              v-for="(tab, idx) in editForm.terminals"
              :key="idx"
              class="p-2 rounded bg-background/60 border border-border/40 space-y-1.5"
            >
              <div class="flex items-center gap-1.5">
                <UiInput
                  v-model="tab.title"
                  placeholder="Judul Tab (e.g. Server)"
                  class="h-7 text-[11px] flex-1 bg-background/90"
                />
                <button
                  class="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors flex-shrink-0"
                  title="Hapus Tab Ini"
                  @click="handleRemoveEditTab(idx)"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
              <div class="grid grid-cols-2 gap-1.5">
                <UiInput
                  v-model="tab.cwd"
                  placeholder="Folder CWD (Opsional)"
                  class="h-6 text-[10px] bg-background/90"
                />
                <UiInput
                  v-model="tab.command"
                  placeholder="Command Auto-run (Opsional)"
                  class="h-6 text-[10px] font-mono text-emerald-400 bg-background/90"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-1 border-t border-border/40">
          <UiButton variant="ghost" size="sm" class="h-7 text-xs" @click="handleCancelEdit">
            Batal
          </UiButton>
          <UiButton
            variant="default"
            size="sm"
            class="h-7 text-xs gap-1 bg-indigo-600 hover:bg-indigo-500 text-white"
            :disabled="!editForm.name.trim()"
            @click="handleSaveEdit"
          >
            <Check class="w-3.5 h-3.5" />
            <span>Simpan Perubahan</span>
          </UiButton>
        </div>
      </div>

      <!-- Presets List -->
      <div class="space-y-2 pt-1">
        <div
          v-for="preset in presets"
          :key="preset.id"
          :class="[
            'group relative flex flex-col p-3.5 rounded-lg border transition-all cursor-pointer shadow-sm',
            isStartupPreset(preset.id)
              ? 'border-indigo-500/50 bg-[#191a2a] hover:border-indigo-400'
              : 'border-border bg-[#171822] hover:border-primary hover:bg-[#1c1d2b]'
          ]"
          @click="handleSelectPreset(preset)"
        >
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="p-2 rounded-md bg-white/5 text-white border border-border/50 flex-shrink-0">
                <Bot v-if="preset.icon === 'bot'" class="w-4 h-4" />
                <LayoutGrid v-else-if="preset.icon === 'layout-grid'" class="w-4 h-4" />
                <Code v-else-if="preset.icon === 'code'" class="w-4 h-4" />
                <Server v-else-if="preset.icon === 'server'" class="w-4 h-4" />
                <Terminal v-else-if="preset.icon === 'terminal'" class="w-4 h-4" />
                <Sparkles v-else class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-xs font-semibold text-foreground truncate">{{ preset.name }}</h3>
                  <UiBadge
                    v-if="preset.isCustom"
                    variant="outline"
                    class="text-[9px] px-1 py-0 bg-primary/15 text-primary border-primary/40 font-mono"
                  >
                    Custom
                  </UiBadge>
                  <UiBadge
                    v-if="isStartupPreset(preset.id)"
                    variant="secondary"
                    class="text-[9px] px-1 py-0 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono flex items-center gap-1"
                  >
                    <Power class="w-2.5 h-2.5" />
                    <span>Auto-Startup</span>
                  </UiBadge>
                </div>
                <p class="text-[11px] text-muted-foreground truncate">{{ preset.description }}</p>
              </div>
            </div>

            <div class="flex items-center gap-1.5 flex-shrink-0">
              <!-- Auto Run on Startup Toggle Checkbox/Button -->
              <button
                type="button"
                :class="[
                  'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors cursor-pointer',
                  isStartupPreset(preset.id)
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-background/40 text-muted-foreground border-border/40 hover:text-foreground hover:bg-white/5'
                ]"
                title="Buka otomatis preset ini saat aplikasi dinyalakan"
                @click="toggleStartupPreset($event, preset.id)"
              >
                <Power class="w-3 h-3" />
                <span class="hidden sm:inline">{{ isStartupPreset(preset.id) ? 'Startup ON' : 'Startup OFF' }}</span>
              </button>

              <UiBadge variant="secondary" class="text-[10px] uppercase font-mono bg-muted/60 text-muted-foreground">
                {{ preset.layout }}
              </UiBadge>

              <!-- Edit Button -->
              <button
                class="p-1 rounded text-muted-foreground hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                title="Edit Preset"
                @click="handleStartEdit($event, preset)"
              >
                <Pencil class="w-3.5 h-3.5" />
              </button>

              <!-- Delete Button -->
              <button
                class="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Hapus Preset"
                @click="handleDeletePreset($event, preset.id)"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Terminals preview -->
          <div class="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-border/30 text-[11px] text-muted-foreground">
            <div
              v-for="(term, idx) in preset.terminals"
              :key="idx"
              class="bg-background/40 px-2 py-1 rounded border border-border/20 flex flex-col justify-center min-w-0"
            >
              <div class="flex items-center justify-between gap-1">
                <span class="truncate font-medium text-foreground/90">{{ term.title }}</span>
                <span v-if="term.command" class="text-[9px] text-emerald-400 font-mono flex-shrink-0">
                  auto-run
                </span>
              </div>
              <span v-if="term.cwd" class="text-[9px] text-muted-foreground/70 truncate flex items-center gap-1 mt-0.5">
                <Folder class="w-2.5 h-2.5 flex-shrink-0" />
                <span class="truncate">{{ term.cwd }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <UiButton variant="outline" @click="emit('update:open', false)">
        Tutup
      </UiButton>
    </template>
  </UiDialog>
</template>

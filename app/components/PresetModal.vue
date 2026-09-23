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
  FolderOpen,
  FolderPlus,
  Pencil,
  X,
  Layers,
  Square,
  Columns2,
  Rows2,
  Play,
  Monitor,
  RotateCcw
} from 'lucide-vue-next'
import type { WorkspacePreset, LayoutType, PresetWorkstationConfig } from '~/types/terminal'
import { useProjectExplorer } from '~/composables/useProjectExplorer'
import { useAppDialog } from '~/composables/useAppDialog'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const {
  presets,
  workstations,
  terminals,
  activeWorkstation,
  currentLayout,
  applyPreset,
  saveCustomPreset,
  updatePreset,
  deletePreset
} = useWorkspaceStore()

const { pickFolder } = useProjectExplorer()
const { showAppAlert, showAppConfirm } = useAppDialog()

const showCreateForm = ref(false)
const presetName = ref('')
const presetDesc = ref('')
const selectedIcon = ref('sparkles')

// Dynamic Workstation Cards Builder State
interface WorkstationFormItem {
  id: string
  name: string
  folderPath: string
  layout: LayoutType
  terminals: { title: string; command: string; shell?: string; cwd?: string }[]
}

const workstationCards = ref<WorkstationFormItem[]>([])

// State untuk Edit Preset
const editingPresetId = ref<string | null>(null)
const editForm = ref<{
  id: string
  name: string
  description: string
  icon: string
  workstations: WorkstationFormItem[]
} | null>(null)

const iconOptions = [
  { id: 'sparkles', label: 'AI Sparkle', icon: Sparkles },
  { id: 'layout-grid', label: 'Workspace Matrix', icon: LayoutGrid },
  { id: 'code', label: 'Coding', icon: Code },
  { id: 'server', label: 'Server Dev', icon: Server },
  { id: 'bot', label: 'Bot Assistant', icon: Bot },
  { id: 'terminal', label: 'CLI Console', icon: Terminal }
]

const getIconComponent = (iconId: string) => {
  const match = iconOptions.find(i => i.id === iconId)
  return match ? match.icon : Sparkles
}

const loadActiveWorkstationsIntoCards = () => {
  workstationCards.value = workstations.value.map((ws, idx) => ({
    id: `card-${Date.now()}-${idx + 1}`,
    name: ws.name || `Workstation ${idx + 1}`,
    folderPath: ws.folderPath || '',
    layout: ws.layout || 'grid-2x2',
    terminals: ws.terminals.map((t, tIdx) => ({
      title: t.title || `Terminal ${tIdx + 1}`,
      command: t.initialCommand || '',
      shell: t.shell,
      cwd: t.cwd || ws.folderPath
    }))
  }))
}

// Inisialisasi form create dengan workstation yang sedang aktif
watch(() => showCreateForm.value, (open) => {
  if (open) {
    editingPresetId.value = null
    editForm.value = null
    presetName.value = workstations.value.length > 1 ? `Workspace Dev Multi-Service` : `${activeWorkstation.value.name} Template`
    presetDesc.value = `Template dengan ${workstations.value.length} Workstation`
    selectedIcon.value = workstations.value.length > 1 ? 'layout-grid' : 'sparkles'
    loadActiveWorkstationsIntoCards()
  }
})

const addBlankWorkstationCard = () => {
  const num = workstationCards.value.length + 1
  workstationCards.value.push({
    id: `card-${Date.now()}-${num}`,
    name: `Workstation ${num}`,
    folderPath: '',
    layout: 'grid-2x2',
    terminals: [
      { title: 'Terminal 1', command: '', cwd: '' }
    ]
  })
}

const removeWorkstationCard = (idx: number) => {
  if (workstationCards.value.length <= 1) {
    showAppAlert('Preset harus memiliki minimal 1 Workstation card.', 'Peringatan')
    return
  }
  workstationCards.value.splice(idx, 1)
}

const addTerminalToCard = (card: WorkstationFormItem) => {
  const tNum = card.terminals.length + 1
  card.terminals.push({
    title: `Terminal ${tNum}`,
    command: '',
    cwd: card.folderPath || ''
  })
}

const removeTerminalFromCard = (card: WorkstationFormItem, tIdx: number) => {
  card.terminals.splice(tIdx, 1)
}

const handlePickFolderForCard = async (card: WorkstationFormItem) => {
  const folder = await pickFolder()
  if (folder) {
    card.folderPath = folder
    if (!card.name || card.name.startsWith('Workstation')) {
      card.name = folder.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || card.name
    }
  }
}

const handleSelectPreset = (preset: WorkspacePreset, asNewWorkstation = true) => {
  applyPreset(preset, asNewWorkstation)
  emit('update:open', false)
}

const handleCreatePreset = () => {
  if (!presetName.value.trim() || workstationCards.value.length === 0) return

  saveCustomPreset(
    presetName.value,
    presetDesc.value,
    selectedIcon.value,
    workstationCards.value.map(w => ({
      name: w.name,
      folderPath: w.folderPath,
      layout: w.layout,
      terminals: w.terminals
    }))
  )

  presetName.value = ''
  presetDesc.value = ''
  workstationCards.value = []
  showCreateForm.value = false
}

// Mulai edit preset
const handleStartEdit = (e: MouseEvent, preset: WorkspacePreset) => {
  e.stopPropagation()
  showCreateForm.value = false
  editingPresetId.value = preset.id

  const wsList: WorkstationFormItem[] = (preset.workstations && preset.workstations.length > 0)
    ? preset.workstations.map((w, idx) => ({
        id: `edit-ws-${idx + 1}`,
        name: w.name,
        folderPath: w.folderPath || '',
        layout: w.layout,
        terminals: w.terminals.map(t => ({
          title: t.title,
          command: t.command || '',
          shell: t.shell,
          cwd: t.cwd || ''
        }))
      }))
    : [
        {
          id: 'edit-ws-1',
          name: preset.name,
          folderPath: preset.folderPath || '',
          layout: preset.layout,
          terminals: (preset.terminals || []).map(t => ({
            title: t.title,
            command: t.command || '',
            shell: t.shell,
            cwd: t.cwd || ''
          }))
        }
      ]

  editForm.value = {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    icon: preset.icon || 'sparkles',
    workstations: wsList
  }
}

const handleCancelEdit = () => {
  editingPresetId.value = null
  editForm.value = null
}

const handleSaveEdit = () => {
  if (!editForm.value || !editForm.value.name.trim() || editForm.value.workstations.length === 0) return

  const firstWs = editForm.value.workstations[0]
  updatePreset({
    id: editForm.value.id,
    name: editForm.value.name.trim(),
    description: editForm.value.description.trim(),
    icon: editForm.value.icon,
    layout: firstWs.layout,
    folderPath: firstWs.folderPath,
    workstations: editForm.value.workstations.map(w => ({
      id: w.id,
      name: w.name,
      folderPath: w.folderPath,
      layout: w.layout,
      terminals: w.terminals
    })),
    terminals: firstWs.terminals
  })
  handleCancelEdit()
}

const handleDelete = async (e: MouseEvent, presetId: string) => {
  e.stopPropagation()
  const confirmed = await showAppConfirm('Hapus preset ini secara permanen?', 'Hapus Preset', 'destructive', 'Hapus')
  if (confirmed) {
    deletePreset(presetId)
    if (editingPresetId.value === presetId) {
      handleCancelEdit()
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      @click="emit('update:open', false)"
    >
      <div
        class="bg-[#12131a] border border-border w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-100"
        @click.stop
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-border bg-[#181924]">
          <div class="flex items-center gap-2.5">
            <div class="p-1.5 rounded-lg bg-primary/20 text-primary">
              <Sparkles class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-foreground">Workspace Presets & Workstation Templates</h3>
              <p class="text-[11px] text-muted-foreground">Kustomisasi dan buat template multi-workstation lengkap dengan terminal dan folder project.</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              v-if="!showCreateForm && !editingPresetId"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary text-xs font-semibold transition-colors border border-primary/30"
              @click="showCreateForm = true"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Buat Preset Baru</span>
            </button>

            <button
              class="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              @click="emit('update:open', false)"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Modal Content Body -->
        <div class="p-5 overflow-y-auto flex-1 space-y-4">
          <!-- CREATE FORM WITH DYNAMIC WORKSTATION CARDS -->
          <div
            v-if="showCreateForm"
            class="bg-[#161722] border border-primary/40 rounded-xl p-4 space-y-4 animate-in fade-in"
          >
            <div class="flex items-center justify-between border-b border-border/50 pb-2.5">
              <span class="text-xs font-bold text-foreground flex items-center gap-1.5">
                <BookmarkPlus class="w-4 h-4 text-primary" />
                <span>Buat Preset Multi-Workstation</span>
              </span>

              <div class="flex items-center gap-2">
                <button
                  class="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                  title="Muat ulang dari Workstation yang sedang aktif di aplikasi"
                  @click="loadActiveWorkstationsIntoCards"
                >
                  <RotateCcw class="w-3 h-3" />
                  <span>Muat Sesi Aktif</span>
                </button>
                <span class="text-border">|</span>
                <button class="text-xs text-muted-foreground hover:text-foreground" @click="showCreateForm = false">Batal</button>
              </div>
            </div>

            <!-- Preset Meta Fields -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="text-[11px] text-muted-foreground block mb-1">Nama Preset</label>
                <input
                  v-model="presetName"
                  type="text"
                  placeholder="Contoh: Microservices Dev, Fullstack Project..."
                  class="w-full bg-[#0d0e14] border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label class="text-[11px] text-muted-foreground block mb-1">Deskripsi Singkat</label>
                <input
                  v-model="presetDesc"
                  type="text"
                  placeholder="Keterangan template workspace ini..."
                  class="w-full bg-[#0d0e14] border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>

            <!-- DYNAMIC WORKSTATION CARDS CONTAINER -->
            <div class="space-y-3 pt-1">
              <div class="flex items-center justify-between">
                <div class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Monitor class="w-3.5 h-3.5 text-primary" />
                  <span>Daftar Workstation Cards ({{ workstationCards.length }})</span>
                </div>

                <button
                  class="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/20 hover:bg-primary/30 text-primary text-xs font-semibold transition-colors"
                  @click="addBlankWorkstationCard"
                >
                  <Plus class="w-3.5 h-3.5" />
                  <span>Tambah Workstation Card</span>
                </button>
              </div>

              <!-- List of Workstation Cards -->
              <div class="space-y-3 max-h-80 overflow-y-auto pr-0.5">
                <div
                  v-for="(card, wIdx) in workstationCards"
                  :key="card.id"
                  class="p-3.5 rounded-xl bg-[#0e0f16] border border-border/70 hover:border-primary/40 transition-all space-y-3"
                >
                  <!-- Card Header -->
                  <div class="flex items-center justify-between border-b border-border/40 pb-2">
                    <div class="flex items-center gap-2 flex-1 min-w-0 pr-2">
                      <span class="w-5 h-5 rounded-full bg-primary/20 text-primary text-[11px] font-mono font-bold flex items-center justify-center flex-shrink-0">
                        {{ wIdx + 1 }}
                      </span>
                      <input
                        v-model="card.name"
                        type="text"
                        placeholder="Nama Workstation..."
                        class="bg-transparent border-b border-transparent focus:border-primary text-xs font-bold text-foreground outline-none px-1 py-0.5 w-40"
                      />
                    </div>

                    <div class="flex items-center gap-2 flex-shrink-0">
                      <!-- Layout Selector for Card -->
                      <select
                        v-model="card.layout"
                        class="bg-[#181924] border border-border/60 text-[10px] font-mono rounded px-2 py-1 text-muted-foreground outline-none"
                      >
                        <option value="single">Single (1)</option>
                        <option value="split-h">2-Split H</option>
                        <option value="split-v">2-Split V</option>
                        <option value="grid-2x2">Grid 2x2</option>
                      </select>

                      <!-- Delete Workstation Card -->
                      <button
                        class="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                        title="Hapus Workstation Card Ini"
                        @click="removeWorkstationCard(wIdx)"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <!-- Folder Path Input -->
                  <div class="flex items-center gap-1.5">
                    <label class="text-[10px] text-muted-foreground font-mono w-20 flex-shrink-0">Project Path:</label>
                    <input
                      v-model="card.folderPath"
                      type="text"
                      placeholder="Direktori project (contoh: D:\Projects\Frontend)..."
                      class="flex-1 bg-[#161722] border border-border/60 rounded-lg px-2.5 py-1 text-xs text-foreground font-mono outline-none focus:border-primary"
                    />
                    <button
                      class="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs flex-shrink-0"
                      title="Pilih Folder"
                      @click="handlePickFolderForCard(card)"
                    >
                      <FolderOpen class="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <!-- Terminals List inside Card -->
                  <div class="space-y-1.5 pt-1">
                    <div class="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Terminals ({{ card.terminals.length }})</span>
                      <button
                        class="text-primary hover:underline flex items-center gap-0.5 text-[10px] font-medium"
                        @click="addTerminalToCard(card)"
                      >
                        <Plus class="w-3 h-3" />
                        <span>Tambah Terminal</span>
                      </button>
                    </div>

                    <div class="space-y-1">
                      <div
                        v-for="(t, tIdx) in card.terminals"
                        :key="tIdx"
                        class="flex items-center gap-2 bg-[#141520] p-1.5 rounded-lg border border-border/40 text-xs"
                      >
                        <Terminal class="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        <input
                          v-model="t.title"
                          type="text"
                          placeholder="Judul Tab"
                          class="w-28 bg-[#0d0e14] border border-border/60 rounded px-1.5 py-0.5 text-[11px] text-foreground font-mono outline-none"
                        />
                        <input
                          v-model="t.command"
                          type="text"
                          placeholder="Perintah awal (misal: npm run dev, cargo watch, python app.py)..."
                          class="flex-1 bg-[#0d0e14] border border-border/60 rounded px-2 py-0.5 text-[11px] text-foreground font-mono outline-none"
                        />
                        <button
                          class="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex-shrink-0"
                          title="Hapus Terminal"
                          @click="removeTerminalFromCard(card, tIdx)"
                        >
                          <Trash2 class="w-3 h-3" />
                        </button>
                      </div>

                      <div v-if="card.terminals.length === 0" class="text-[10px] text-muted-foreground/60 italic p-1">
                        Tidak ada terminal. Klik "+ Tambah Terminal" untuk menambahkan tab.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Submit Buttons -->
            <div class="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
              <button
                class="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs hover:bg-muted/80"
                @click="showCreateForm = false"
              >
                Batal
              </button>
              <button
                :disabled="!presetName.trim() || workstationCards.length === 0"
                class="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold disabled:opacity-40 shadow-sm"
                @click="handleCreatePreset"
              >
                Simpan Preset ({{ workstationCards.length }} Workstation)
              </button>
            </div>
          </div>

          <!-- EDIT FORM WITH DYNAMIC WORKSTATION CARDS -->
          <div
            v-else-if="editingPresetId && editForm"
            class="bg-[#161722] border border-amber-500/40 rounded-xl p-4 space-y-4 animate-in fade-in"
          >
            <div class="flex items-center justify-between border-b border-border/50 pb-2.5">
              <span class="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Pencil class="w-4 h-4 text-amber-400" />
                <span>Edit Preset: {{ editForm.name }}</span>
              </span>
              <button class="text-xs text-muted-foreground hover:text-foreground" @click="handleCancelEdit">Batal</button>
            </div>

            <!-- Preset Meta Fields -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="text-[11px] text-muted-foreground block mb-1">Nama Preset</label>
                <input
                  v-model="editForm.name"
                  type="text"
                  class="w-full bg-[#0d0e14] border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>

              <div>
                <label class="text-[11px] text-muted-foreground block mb-1">Deskripsi</label>
                <input
                  v-model="editForm.description"
                  type="text"
                  class="w-full bg-[#0d0e14] border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>

            <!-- Dynamic Workstation Cards in Edit -->
            <div class="space-y-3 pt-1">
              <div class="flex items-center justify-between">
                <div class="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Monitor class="w-3.5 h-3.5 text-amber-400" />
                  <span>Workstation Cards ({{ editForm.workstations.length }})</span>
                </div>

                <button
                  class="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold transition-colors"
                  @click="editForm.workstations.push({
                    id: `edit-card-${Date.now()}`,
                    name: `Workstation ${editForm.workstations.length + 1}`,
                    folderPath: '',
                    layout: 'grid-2x2',
                    terminals: [{ title: 'Terminal 1', command: '', cwd: '' }]
                  })"
                >
                  <Plus class="w-3.5 h-3.5" />
                  <span>Tambah Workstation</span>
                </button>
              </div>

              <div class="space-y-3 max-h-80 overflow-y-auto pr-0.5">
                <div
                  v-for="(card, wIdx) in editForm.workstations"
                  :key="card.id"
                  class="p-3.5 rounded-xl bg-[#0e0f16] border border-border/70 space-y-3"
                >
                  <div class="flex items-center justify-between border-b border-border/40 pb-2">
                    <div class="flex items-center gap-2 flex-1 min-w-0 pr-2">
                      <span class="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 text-[11px] font-mono font-bold flex items-center justify-center flex-shrink-0">
                        {{ wIdx + 1 }}
                      </span>
                      <input
                        v-model="card.name"
                        type="text"
                        placeholder="Nama Workstation..."
                        class="bg-transparent border-b border-transparent focus:border-amber-400 text-xs font-bold text-foreground outline-none px-1 py-0.5 w-40"
                      />
                    </div>

                    <div class="flex items-center gap-2 flex-shrink-0">
                      <select
                        v-model="card.layout"
                        class="bg-[#181924] border border-border/60 text-[10px] font-mono rounded px-2 py-1 text-muted-foreground outline-none"
                      >
                        <option value="single">Single (1)</option>
                        <option value="split-h">2-Split H</option>
                        <option value="split-v">2-Split V</option>
                        <option value="grid-2x2">Grid 2x2</option>
                      </select>

                      <button
                        class="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                        title="Hapus Card"
                        @click="editForm.workstations.splice(wIdx, 1)"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <!-- Folder Path Input -->
                  <div class="flex items-center gap-1.5">
                    <label class="text-[10px] text-muted-foreground font-mono w-20 flex-shrink-0">Project Path:</label>
                    <input
                      v-model="card.folderPath"
                      type="text"
                      placeholder="Direktori project..."
                      class="flex-1 bg-[#161722] border border-border/60 rounded-lg px-2.5 py-1 text-xs text-foreground font-mono outline-none focus:border-amber-400"
                    />
                    <button
                      class="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs flex-shrink-0"
                      title="Pilih Folder"
                      @click="handlePickFolderForCard(card)"
                    >
                      <FolderOpen class="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <!-- Terminals List -->
                  <div class="space-y-1.5 pt-1">
                    <div class="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Terminals ({{ card.terminals.length }})</span>
                      <button
                        class="text-amber-400 hover:underline flex items-center gap-0.5 text-[10px] font-medium"
                        @click="addTerminalToCard(card)"
                      >
                        <Plus class="w-3 h-3" />
                        <span>Tambah Terminal</span>
                      </button>
                    </div>

                    <div class="space-y-1">
                      <div
                        v-for="(t, tIdx) in card.terminals"
                        :key="tIdx"
                        class="flex items-center gap-2 bg-[#141520] p-1.5 rounded-lg border border-border/40 text-xs"
                      >
                        <Terminal class="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <input
                          v-model="t.title"
                          type="text"
                          placeholder="Judul Tab"
                          class="w-28 bg-[#0d0e14] border border-border/60 rounded px-1.5 py-0.5 text-[11px] text-foreground font-mono outline-none"
                        />
                        <input
                          v-model="t.command"
                          type="text"
                          placeholder="Perintah awal..."
                          class="flex-1 bg-[#0d0e14] border border-border/60 rounded px-2 py-0.5 text-[11px] text-foreground font-mono outline-none"
                        />
                        <button
                          class="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex-shrink-0"
                          title="Hapus Terminal"
                          @click="removeTerminalFromCard(card, tIdx)"
                        >
                          <Trash2 class="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Edit Buttons -->
            <div class="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
              <button
                class="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs hover:bg-muted/80"
                @click="handleCancelEdit"
              >
                Batal
              </button>
              <button
                :disabled="!editForm.name.trim() || editForm.workstations.length === 0"
                class="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold disabled:opacity-40 shadow-sm"
                @click="handleSaveEdit"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>

          <!-- PRESETS CARDS GRID VIEW -->
          <div v-if="presets.length === 0 && !showCreateForm && !editingPresetId" class="p-10 text-center space-y-3 bg-[#161722] rounded-xl border border-dashed border-border/80">
            <div class="p-3 rounded-full bg-primary/10 text-primary w-fit mx-auto">
              <Sparkles class="w-6 h-6" />
            </div>
            <div>
              <h4 class="text-sm font-bold text-foreground">Belum Ada Preset Kustom</h4>
              <p class="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                Buat template workstation kustom Anda sendiri lengkap dengan folder project dan sesi terminal.
              </p>
            </div>
            <button
              class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-sm transition-colors"
              @click="showCreateForm = true"
            >
              <Plus class="w-4 h-4" />
              <span>Buat Preset Pertama Anda</span>
            </button>
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div
              v-for="preset in presets"
              :key="preset.id"
              class="group flex flex-col justify-between p-4 rounded-xl bg-[#151622] hover:bg-[#1b1c2b] border border-border/60 hover:border-primary/50 transition-all shadow-md relative overflow-hidden"
            >
              <!-- Card Header -->
              <div class="space-y-2.5">
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <div class="p-2 rounded-lg bg-[#0d0e14] border border-border/50 text-primary flex-shrink-0">
                      <component :is="getIconComponent(preset.icon)" class="w-4 h-4" />
                    </div>
                    <div class="min-w-0">
                      <div class="flex items-center gap-1.5">
                        <h4 class="text-xs font-bold text-foreground truncate">{{ preset.name }}</h4>
                        <span
                          v-if="preset.workstations && preset.workstations.length > 1"
                          class="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 text-[9px] font-mono font-bold flex-shrink-0"
                        >
                          {{ preset.workstations.length }} Workstations
                        </span>
                      </div>
                      <p class="text-[11px] text-muted-foreground/80 line-clamp-1 mt-0.5">{{ preset.description }}</p>
                    </div>
                  </div>

                  <!-- Edit / Delete for custom presets -->
                  <div v-if="preset.isCustom" class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      class="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground"
                      title="Edit Preset"
                      @click="handleStartEdit($event, preset)"
                    >
                      <Pencil class="w-3 h-3" />
                    </button>
                    <button
                      class="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                      title="Hapus Preset"
                      @click="handleDelete($event, preset.id)"
                    >
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <!-- Sub-Cards / Workstations Inside Preset -->
                <div v-if="preset.workstations && preset.workstations.length > 0" class="space-y-1.5 pt-1">
                  <div
                    v-for="(wsConfig, wIdx) in preset.workstations"
                    :key="wsConfig.id || wIdx"
                    class="p-2 rounded-lg bg-[#0e0f17] border border-border/40 text-[11px] font-mono flex items-center justify-between"
                  >
                    <div class="flex items-center gap-2 min-w-0 flex-1 pr-2">
                      <Monitor class="w-3.5 h-3.5 text-primary flex-shrink-0" />
                      <span class="font-semibold text-foreground truncate">{{ wsConfig.name }}</span>
                      <span v-if="wsConfig.folderPath" class="text-[10px] text-muted-foreground/60 truncate" :title="wsConfig.folderPath">
                        ({{ wsConfig.folderPath.split(/[\\/]/).pop() }})
                      </span>
                    </div>

                    <div class="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-shrink-0">
                      <span>{{ wsConfig.terminals.length }} Term</span>
                      <span class="opacity-40">•</span>
                      <span class="uppercase">{{ wsConfig.layout }}</span>
                    </div>
                  </div>
                </div>

                <!-- Fallback badges if single preset -->
                <div v-else class="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] font-mono">
                  <span class="px-2 py-0.5 rounded-md bg-[#0d0e14] text-muted-foreground border border-border/40 flex items-center gap-1">
                    <Terminal class="w-3 h-3 text-primary" />
                    <span>{{ preset.terminals.length }} Terminal</span>
                  </span>
                  <span class="px-2 py-0.5 rounded-md bg-[#0d0e14] text-muted-foreground border border-border/40 uppercase">
                    {{ preset.layout }}
                  </span>
                  <span
                    v-if="preset.folderPath"
                    class="px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 flex items-center gap-1 truncate max-w-[170px]"
                    :title="preset.folderPath"
                  >
                    <FolderOpen class="w-3 h-3 flex-shrink-0" />
                    <span class="truncate">{{ preset.folderPath.split(/[\\/]/).pop() }}</span>
                  </span>
                </div>
              </div>

              <!-- Card Action Buttons -->
              <div class="flex items-center gap-2 pt-3.5 mt-2 border-t border-border/30">
                <button
                  class="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold transition-colors shadow-sm"
                  :title="preset.workstations && preset.workstations.length > 1 ? 'Buka semua workstation sebagai tab baru' : 'Buka sebagai tab workstation baru'"
                  @click="handleSelectPreset(preset, true)"
                >
                  <FolderPlus class="w-3.5 h-3.5" />
                  <span>{{ preset.workstations && preset.workstations.length > 1 ? `Buka (${preset.workstations.length} Workstation)` : 'Buka di Workstation Baru' }}</span>
                </button>

                <button
                  class="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-colors"
                  title="Terapkan ke workspace saat ini"
                  @click="handleSelectPreset(preset, false)"
                >
                  <Check class="w-3.5 h-3.5 text-muted-foreground" />
                  <span class="hidden sm:inline">Terapkan</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="flex items-center justify-between px-5 py-2.5 bg-[#0e0f14] border-t border-border/50 text-[11px] text-muted-foreground font-mono">
          <span>{{ presets.length }} template workspace tersedia</span>
          <div class="flex items-center gap-2">
            <span><kbd class="bg-muted px-1.5 py-0.5 rounded text-[10px]">Ctrl + K</kbd> untuk buka cepat via Palette</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

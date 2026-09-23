<script setup lang="ts">
import {
  X,
  Save,
  Copy,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Image,
  Columns2,
  Rows2,
  Maximize2,
  Minimize2,
  Check,
  Sparkles,
  AlertTriangle,
  GitBranch,
  FolderOpen,
  WrapText
} from 'lucide-vue-next'
import { useEditorStore, type OpenFileItem } from '~/composables/useEditorStore'
import { useProjectExplorer } from '~/composables/useProjectExplorer'
import { formatCode } from '~/utils/formatter'
import MonacoEditor from './MonacoEditor.vue'
import MonacoDiffEditor from './MonacoDiffEditor.vue'

const {
  openFiles,
  activeFileId,
  secondaryFileId,
  activeFile,
  secondaryFile,
  isEditorPaneSplit,
  splitEditorRatio,
  viewportMode,
  splitOrientation,
  isAutoSave,
  isWordWrap,
  isEditorVisible,
  editorNotification,
  unsavedConfirmFile,
  saveFile,
  saveAll,
  updateContent,
  toggleEditorPaneSplit,
  closeFile,
  reopenClosedTab,
  discardAndClose,
  saveAndClose,
  closeOtherTabs,
  closeTabsToTheRight,
  closeAllTabs,
  copyRelativePath,
  reloadOpenFilesFromDisk
} = useEditorStore()

const { gitBranch, revealInExplorer } = useProjectExplorer()

const isCopied = ref(false)
const isFormatting = ref(false)
const monacoRef = ref<InstanceType<typeof MonacoEditor> | null>(null)
const secondaryMonacoRef = ref<InstanceType<typeof MonacoEditor> | null>(null)

// Draggable Split for 2 Editors
const isDraggingPaneSplit = ref(false)

const startPaneSplitDrag = (e: MouseEvent) => {
  e.preventDefault()
  isDraggingPaneSplit.value = true

  const onMouseMove = (moveEvt: MouseEvent) => {
    if (!isDraggingPaneSplit.value) return
    const container = document.getElementById('split-editor-container')
    if (!container) return
    const rect = container.getBoundingClientRect()
    const relX = moveEvt.clientX - rect.left
    const percent = Math.min(Math.max((relX / rect.width) * 100, 20), 80)
    splitEditorRatio.value = Math.round(percent)
  }

  const onMouseUp = () => {
    isDraggingPaneSplit.value = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

// Tab Context Menu State
const tabContextMenu = ref<{
  visible: boolean
  x: number
  y: number
  file: OpenFileItem | null
}>({
  visible: false,
  x: 0,
  y: 0,
  file: null
})

const handleTabContextMenu = (e: MouseEvent, file: OpenFileItem) => {
  e.preventDefault()
  tabContextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    file
  }
}

const closeTabContextMenu = () => {
  tabContextMenu.value.visible = false
}

const onWindowFocus = () => {
  reloadOpenFilesFromDisk()
}

onMounted(() => {
  window.addEventListener('click', closeTabContextMenu)
  window.addEventListener('focus', onWindowFocus)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeTabContextMenu)
  window.removeEventListener('focus', onWindowFocus)
})

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return { icon: FileCode, color: 'text-amber-400' }
  if (['vue', 'svelte'].includes(ext)) return { icon: FileCode, color: 'text-emerald-400' }
  if (['rs'].includes(ext)) return { icon: FileCode, color: 'text-orange-400' }
  if (['py'].includes(ext)) return { icon: FileCode, color: 'text-yellow-300' }
  if (['go'].includes(ext)) return { icon: FileCode, color: 'text-cyan-400' }
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return { icon: FileJson, color: 'text-yellow-400' }
  if (['md', 'txt', 'log'].includes(ext)) return { icon: FileText, color: 'text-sky-400' }
  if (['png', 'jpg', 'jpeg', 'svg', 'ico', 'webp'].includes(ext)) return { icon: Image, color: 'text-pink-400' }
  if (['css', 'scss', 'less'].includes(ext)) return { icon: FileSpreadsheet, color: 'text-blue-400' }
  return { icon: File, color: 'text-muted-foreground' }
}

const lineCount = computed(() => {
  if (!activeFile.value?.content) return 1
  return activeFile.value.content.split('\n').length
})

const copyAllCode = async () => {
  if (!activeFile.value?.content) return
  await navigator.clipboard.writeText(activeFile.value.content)
  isCopied.value = true
  setTimeout(() => {
    isCopied.value = false
  }, 1500)
}

const handleFormat = async () => {
  if (!activeFile.value || isFormatting.value) return
  isFormatting.value = true

  try {
    const res = await formatCode(activeFile.value.content, activeFile.value.path)
    if (res.success && res.formatted !== undefined) {
      updateContent(activeFile.value.id, res.formatted)
      editorNotification.value = 'Kode diformat dengan Prettier'
    } else {
      monacoRef.value?.format()
      editorNotification.value = res.error ? `Format: ${res.error}` : 'Format dengan Monaco'
    }
  } catch (err: any) {
    monacoRef.value?.format()
  } finally {
    isFormatting.value = false
    setTimeout(() => {
      editorNotification.value = null
    }, 2500)
  }
}

const toggleFullscreenEditor = () => {
  if (viewportMode.value === 'editor-full') {
    viewportMode.value = 'split'
  } else {
    viewportMode.value = 'editor-full'
  }
}
</script>

<template>
  <div v-if="isEditorVisible" class="flex flex-col h-full w-full bg-[#12131a] border-r border-border/80 select-none overflow-hidden relative">
    <!-- Top Tabs Bar for Open Files -->
    <div class="flex items-center justify-between h-9 bg-[#0d0e14] border-b border-border px-1 overflow-x-auto no-scrollbar">
      <div class="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
        <div
          v-for="file in openFiles"
          :key="file.id"
          :class="[
            'group flex items-center gap-1.5 px-3 py-1 text-xs rounded-t font-mono cursor-pointer border-t-2 transition-all select-none',
            activeFileId === file.id
              ? 'bg-[#181924] text-foreground border-primary font-medium shadow-sm'
              : 'text-muted-foreground hover:bg-[#14151f] hover:text-foreground border-transparent'
          ]"
          :title="file.path"
          @click="activeFileId = file.id"
          @contextmenu="handleTabContextMenu($event, file)"
        >
          <component
            :is="getFileIcon(file.name).icon"
            :class="['w-3.5 h-3.5 flex-shrink-0', getFileIcon(file.name).color]"
          />
          <span class="truncate max-w-[140px]">{{ file.name }}</span>

          <!-- Dirty State Dot -->
          <span v-if="file.isDirty" class="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 animate-pulse" title="Ada perubahan belum disimpan" />

          <!-- Close File Tab -->
          <button
            class="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors ml-0.5"
            title="Tutup File"
            @click.stop="closeFile(file.id)"
          >
            <X class="w-3 h-3" />
          </button>
        </div>

        <div v-if="openFiles.length === 0" class="text-[11px] text-muted-foreground/60 px-2 italic font-mono">
          No open files
        </div>
      </div>

      <!-- Editor Actions Right -->
      <div v-if="activeFile" class="flex items-center gap-1 pl-2 flex-shrink-0">
        <!-- Toggle Word Wrap Button (Alt+Z) -->
        <button
          :class="[
            'p-1 rounded transition-colors',
            isWordWrap ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          ]"
          :title="`Word Wrap (${isWordWrap ? 'Aktif' : 'Nonaktif'}) - Alt+Z`"
          @click="isWordWrap = !isWordWrap"
        >
          <WrapText class="w-3.5 h-3.5" />
        </button>

        <!-- Toggle Auto Save Button -->
        <button
          :class="[
            'px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors',
            isAutoSave ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          ]"
          :title="`Auto-Save (${isAutoSave ? 'Aktif' : 'Nonaktif'})`"
          @click="isAutoSave = !isAutoSave"
        >
          AutoSave
        </button>

        <!-- Split Editor Side-by-Side (2 Files) Button -->
        <button
          :class="[
            'p-1 rounded transition-colors',
            isEditorPaneSplit ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          ]"
          title="Split Editor Kiri/Kanan (2 File Berdampingan)"
          @click="toggleEditorPaneSplit"
        >
          <Columns2 class="w-3.5 h-3.5" />
        </button>

        <!-- Prettier Format Button -->
        <button
          class="flex items-center gap-1 px-2 py-0.5 rounded bg-secondary/80 hover:bg-secondary text-foreground text-xs transition-colors font-medium"
          title="Format Dokumen (Prettier / Shift+Alt+F)"
          :disabled="isFormatting"
          @click="handleFormat"
        >
          <Sparkles class="w-3 h-3 text-amber-400" />
          <span class="hidden sm:inline text-[11px]">Format</span>
        </button>

        <!-- Save Button -->
        <button
          v-if="activeFile.isDirty && !isAutoSave"
          class="flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-all font-medium"
          title="Simpan File (Ctrl+S)"
          @click="saveFile()"
        >
          <Save class="w-3 h-3" />
          <span>Save</span>
        </button>

        <button
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Salin Isi File"
          @click="copyAllCode"
        >
          <Check v-if="isCopied" class="w-3.5 h-3.5 text-emerald-400" />
          <Copy v-else class="w-3.5 h-3.5" />
        </button>

        <!-- Maximize / Restore Editor Button -->
        <button
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          :title="viewportMode === 'editor-full' ? 'Kembalikan Tampilan Split' : 'Fullscreen Editor'"
          @click="toggleFullscreenEditor"
        >
          <Minimize2 v-if="viewportMode === 'editor-full'" class="w-3.5 h-3.5" />
          <Maximize2 v-else class="w-3.5 h-3.5" />
        </button>
      </div>

      <!-- Maximize / Restore Editor Button when no active file -->
      <div v-else class="flex items-center gap-1 pl-2 flex-shrink-0">
        <button
          class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          :title="viewportMode === 'editor-full' ? 'Kembalikan Tampilan Split' : 'Fullscreen Editor'"
          @click="toggleFullscreenEditor"
        >
          <Minimize2 v-if="viewportMode === 'editor-full'" class="w-3.5 h-3.5" />
          <Maximize2 v-else class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Notification Toast -->
    <div
      v-if="editorNotification"
      class="absolute right-4 top-11 px-3 py-1 rounded bg-secondary text-foreground border border-border text-xs shadow-lg z-30 animate-in fade-in"
    >
      {{ editorNotification }}
    </div>

    <!-- Empty State when no file open -->
    <div
      v-if="!activeFile"
      class="flex-1 w-full h-full flex flex-col items-center justify-center p-6 text-center text-muted-foreground bg-[#0d0e14] select-none"
    >
      <FileCode class="w-10 h-10 mb-3 text-muted-foreground/30" />
      <h3 class="text-sm font-semibold text-foreground/80 mb-1">Editor Kode</h3>
      <p class="text-xs text-muted-foreground/60 max-w-xs mb-4">
        Pilih file dari sidebar explorer atau gunakan shortcut untuk membuka file.
      </p>
      <div class="flex flex-col gap-1.5 text-xs text-muted-foreground/80 font-mono w-48">
        <div class="flex items-center gap-2 justify-between">
          <span>Quick Open</span>
          <kbd class="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] text-foreground">Ctrl + P</kbd>
        </div>
        <div class="flex items-center gap-2 justify-between">
          <span>Cari di File</span>
          <kbd class="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] text-foreground">Ctrl + Shift + F</kbd>
        </div>
        <div class="flex items-center gap-2 justify-between">
          <span>Palette</span>
          <kbd class="px-1.5 py-0.5 rounded bg-muted/60 text-[10px] text-foreground">Ctrl + K</kbd>
        </div>
      </div>
    </div>

    <!-- Monaco Code Editor Main Area (Single or Split 2-Pane) -->
    <template v-else>
      <div id="split-editor-container" class="flex-1 w-full h-full overflow-hidden bg-[#0d0e14] flex flex-row relative">
        <!-- Left / Primary Editor Pane -->
        <div
          :style="{ width: isEditorPaneSplit && secondaryFile ? `${splitEditorRatio}%` : '100%' }"
          class="h-full overflow-hidden relative transition-none flex-shrink-0"
        >
          <!-- Monaco Diff Editor Mode -->
          <MonacoDiffEditor
            v-if="activeFile.isDiff"
            :original-value="activeFile.diffOriginalContent || ''"
            :modified-value="activeFile.content"
            :filename="activeFile.name"
            @update:modified-value="updateContent(activeFile.id, $event)"
            @save="saveFile"
          />

          <!-- Regular Monaco Editor Mode -->
          <MonacoEditor
            v-else
            ref="monacoRef"
            :model-value="activeFile.content"
            :filename="activeFile.name"
            :word-wrap="isWordWrap"
            @update:model-value="updateContent(activeFile.id, $event)"
            @save="saveFile"
            @format="handleFormat"
            @toggle-word-wrap="isWordWrap = !isWordWrap"
          />
        </div>

        <!-- Draggable Resizer between Left & Right Editor Panes -->
        <div
          v-if="isEditorPaneSplit && secondaryFile"
          class="w-1.5 h-full bg-border hover:bg-primary cursor-col-resize flex-shrink-0 transition-colors z-10 select-none flex items-center justify-center group"
          @mousedown="startPaneSplitDrag"
        >
          <div class="w-0.5 h-6 bg-muted-foreground/30 group-hover:bg-primary-foreground rounded-full" />
        </div>

        <!-- Right / Secondary Editor Pane (Split Editor 2 Files) -->
        <template v-if="isEditorPaneSplit && secondaryFile">
          <div class="flex-1 h-full overflow-hidden flex flex-col relative bg-[#0b0c10] min-w-0">
            <!-- Secondary Pane Subheader / Selector -->
            <div class="flex items-center justify-between h-7 px-2 bg-[#090a0f] border-b border-border/60 text-xs">
              <select
                :value="secondaryFileId"
                class="bg-transparent border-none text-[11px] font-mono text-muted-foreground hover:text-foreground outline-none cursor-pointer max-w-[160px]"
                @change="secondaryFileId = ($event.target as HTMLSelectElement).value"
              >
                <option
                  v-for="f in openFiles"
                  :key="f.id"
                  :value="f.id"
                  class="bg-[#12131a] text-foreground"
                >
                  {{ f.name }}
                </option>
              </select>
              <button
                class="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground text-[10px]"
                title="Tutup Pane Kanan"
                @click="isEditorPaneSplit = false"
              >
                <X class="w-3 h-3" />
              </button>
            </div>
            <div class="flex-1 w-full h-full overflow-hidden relative">
              <MonacoEditor
                ref="secondaryMonacoRef"
                :model-value="secondaryFile.content"
                :filename="secondaryFile.name"
                :word-wrap="isWordWrap"
                @update:model-value="updateContent(secondaryFile.id, $event)"
                @save="saveFile(secondaryFile.id)"
                @toggle-word-wrap="isWordWrap = !isWordWrap"
              />
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Tab Right Click Context Menu -->
    <Teleport to="body">
      <div
        v-if="tabContextMenu.visible && tabContextMenu.file"
        class="fixed z-[100] min-w-[190px] bg-[#14151f] border border-border/80 rounded-md shadow-2xl p-1 text-xs font-sans text-foreground animate-in fade-in"
        :style="{ left: `${tabContextMenu.x}px`, top: `${tabContextMenu.y}px` }"
        @click.stop
      >
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
          @click="saveFile(tabContextMenu.file?.id); closeTabContextMenu()"
        >
          <Save class="w-3.5 h-3.5 text-primary" />
          <span>Save (Ctrl+S)</span>
        </button>
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
          @click="revealInExplorer(tabContextMenu.file?.path || ''); closeTabContextMenu()"
        >
          <FolderOpen class="w-3.5 h-3.5 text-muted-foreground" />
          <span>Buka di File Explorer</span>
        </button>
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
          @click="copyRelativePath(tabContextMenu.file?.path || ''); closeTabContextMenu()"
        >
          <Copy class="w-3.5 h-3.5 text-muted-foreground" />
          <span>Salin Path Relatif</span>
        </button>
        <div class="my-1 border-t border-border/50" />
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
          @click="closeFile(tabContextMenu.file?.id); closeTabContextMenu()"
        >
          <X class="w-3.5 h-3.5 text-muted-foreground" />
          <span>Tutup</span>
        </button>
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
          @click="closeTabsToTheRight(tabContextMenu.file?.id || ''); closeTabContextMenu()"
        >
          <span>Tutup Tab ke Kanan</span>
        </button>
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
          @click="closeOtherTabs(tabContextMenu.file?.id); closeTabContextMenu()"
        >
          <span>Tutup Tab Lainnya</span>
        </button>
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-accent text-left transition-colors"
          @click="reopenClosedTab(); closeTabContextMenu()"
        >
          <span>Buka Kembali Tab Ditutup</span>
        </button>
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-destructive/20 text-destructive text-left transition-colors"
          @click="closeAllTabs(); closeTabContextMenu()"
        >
          <span>Tutup Semua Tab</span>
        </button>
      </div>
    </Teleport>

    <!-- Unsaved Changes Modal Confirmation -->
    <Teleport to="body">
      <div
        v-if="unsavedConfirmFile"
        class="fixed inset-0 z-[100] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      >
        <div class="bg-[#181924] border border-border rounded-lg p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in zoom-in-95">
          <div class="flex items-start gap-3">
            <AlertTriangle class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 class="text-sm font-semibold text-foreground">Simpan Perubahan?</h4>
              <p class="text-xs text-muted-foreground mt-1">
                File <span class="text-foreground font-mono font-medium">{{ unsavedConfirmFile.name }}</span> memiliki perubahan yang belum disimpan.
              </p>
            </div>
          </div>

          <div class="flex items-center justify-end gap-2 pt-2">
            <button
              class="px-3 py-1.5 rounded text-xs bg-muted hover:bg-muted/80 text-foreground transition-colors"
              @click="unsavedConfirmFile = null"
            >
              Batal
            </button>
            <button
              class="px-3 py-1.5 rounded text-xs bg-destructive/80 hover:bg-destructive text-destructive-foreground transition-colors"
              @click="discardAndClose"
            >
              Jangan Simpan
            </button>
            <button
              class="px-3 py-1.5 rounded text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
              @click="saveAndClose"
            >
              Simpan
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>

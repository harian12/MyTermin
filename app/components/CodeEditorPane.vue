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
  GitCompare,
  GitMerge,
  FolderOpen,
  WrapText,
  AlignJustify,
  Eye,
  Plus,
  FileEdit,
  ChevronRight,
  Folder,
  ExternalLink,
  Pilcrow
} from 'lucide-vue-next'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'
import { useEditorStore, type OpenFileItem } from '~/composables/useEditorStore'
import { useSettingsStore } from '~/composables/useSettingsStore'
import { useProjectExplorer } from '~/composables/useProjectExplorer'
import { formatCode } from '~/utils/formatter'
import { detectConflicts, resolveAllConflicts } from '~/utils/mergeConflict'
import { parseMarkdown } from '~/utils/markdownParser'
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
  lastFocusedPane,
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
  createScratchpadFile,
  moveFileTab,
  copyRelativePath,
  reloadOpenFilesFromDisk,
  handleFocusLoss
} = useEditorStore()

const { gitBranch, revealInExplorer, openPathDefault } = useProjectExplorer()
const { settings, updateSettings } = useSettingsStore()
const { activeWorkstation } = useWorkspaceStore()

// Breadcrumb Logic
const breadcrumbPopover = ref<{
  path: string
  entries: any[]
  top: number
  left: number
} | null>(null)

const breadcrumbSegments = computed(() => {
  if (!activeFile.value || !activeFile.value.path) return []
  let basePath = activeWorkstation.value?.folderPath || ''
  
  let fullPath = activeFile.value.path.replace(/\\/g, '/')
  basePath = basePath.replace(/\\/g, '/')

  let relativePath = fullPath
  if (basePath && fullPath.startsWith(basePath)) {
    relativePath = fullPath.substring(basePath.length)
    if (relativePath.startsWith('/')) relativePath = relativePath.substring(1)
  }

  const parts = relativePath.split('/')
  const segments = []
  
  const rootName = basePath ? basePath.split('/').pop() || 'Project' : 'Project'
  segments.push({
    name: rootName,
    isFolder: true,
    fullPath: basePath
  })

  let currentPath = basePath
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    currentPath += `/${part}`
    const isFolder = i < parts.length - 1
    segments.push({
      name: part,
      isFolder,
      fullPath: currentPath,
      isLast: i === parts.length - 1
    })
  }

  return segments
})

const showBreadcrumbMenu = async (e: MouseEvent, segment: any) => {
  e.stopPropagation()
  if (!segment.isFolder || !segment.fullPath) return
  
  try {
    const { readDirectory } = useProjectExplorer()
    const entries = await readDirectory(segment.fullPath)
    entries.sort((a: any, b: any) => {
      if (a.is_dir && !b.is_dir) return -1
      if (!a.is_dir && b.is_dir) return 1
      return a.name.localeCompare(b.name)
    })
    
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    
    breadcrumbPopover.value = {
      path: segment.fullPath,
      entries,
      top: rect.bottom + 4,
      left: rect.left
    }
  } catch (err) {
    console.error('Failed to read directory:', err)
  }
}

const closeBreadcrumbMenu = () => {
  breadcrumbPopover.value = null
}

const handleBreadcrumbItemClick = async (entry: any) => {
  if (!entry.is_dir) {
    const { openFile } = useEditorStore()
    await openFile(entry.path)
    closeBreadcrumbMenu()
  }
}

const isCopied = ref(false)
const isFormatting = ref(false)
const renderDiffSideBySide = ref(true)
const tabStripRef = ref<HTMLElement | null>(null)

// Drag Editor Tab Reorder Logic
const isDraggingTab = ref(false)
const dragStartIndex = ref<number | null>(null)
const currentDragIndex = ref<number | null>(null)
const startX = ref(0)
const hasMoved = ref(false)

const handleTabPointerDown = (e: PointerEvent, index: number, fileId: string) => {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('button')) return

  dragStartIndex.value = index
  currentDragIndex.value = index
  startX.value = e.clientX
  hasMoved.value = false

  const handlePointerMove = (moveEvt: PointerEvent) => {
    const deltaX = Math.abs(moveEvt.clientX - startX.value)
    if (deltaX > 4) {
      hasMoved.value = true
      isDraggingTab.value = true
    }

    if (!isDraggingTab.value) return

    const tabElements = document.querySelectorAll<HTMLElement>('[data-editor-tab-index]')
    tabElements.forEach((el) => {
      const rect = el.getBoundingClientRect()
      const idx = Number(el.getAttribute('data-editor-tab-index'))
      if (moveEvt.clientX >= rect.left && moveEvt.clientX <= rect.right) {
        if (currentDragIndex.value !== null && currentDragIndex.value !== idx) {
          moveFileTab(currentDragIndex.value, idx)
          currentDragIndex.value = idx
        }
      }
    })
  }

  const handlePointerUp = () => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    setTimeout(() => {
      isDraggingTab.value = false
      dragStartIndex.value = null
      currentDragIndex.value = null
      hasMoved.value = false
    }, 50)
  }

  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

// Strip tab hanya bisa digeser horizontal, tapi wheel mouse mengirim deltaY.
// Tanpa ini wheel vertikal tidak melakukan apa-apa saat kursor di atas tab bar.
const onTabStripWheel = (e: WheelEvent) => {
  const strip = tabStripRef.value
  if (!strip) return
  if (strip.scrollWidth <= strip.clientWidth) return
  if (e.deltaY === 0) return
  e.preventDefault()
  strip.scrollLeft += e.deltaY
}

// Tab aktif harus tetap terlihat saat strip tab digeser (bisa banyak tab).
// scrollIntoView dengan inline:'nearest' hanya menggeser seperlunya.
watch(activeFileId, async () => {
  await nextTick()
  const strip = tabStripRef.value
  if (!strip) return
  const active = strip.querySelector<HTMLElement>('[data-editor-tab-active="true"]')
  if (!active) return
  const stripRect = strip.getBoundingClientRect()
  const tabRect = active.getBoundingClientRect()
  if (tabRect.left < stripRect.left || tabRect.right > stripRect.right) {
    active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }
})
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

const tabContextMenuStyle = computed(() => {
  const menuWidth = 195
  const menuHeight = 270
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800

  let posX = tabContextMenu.value.x
  let posY = tabContextMenu.value.y

  if (posX + menuWidth > winWidth) {
    posX = Math.max(8, winWidth - menuWidth - 8)
  }
  if (posY + menuHeight > winHeight) {
    posY = Math.max(8, winHeight - menuHeight - 8)
  }

  return {
    left: `${Math.max(8, posX)}px`,
    top: `${Math.max(8, posY)}px`
  }
})

const handleTabContextMenu = (e: MouseEvent, file: OpenFileItem) => {
  e.preventDefault()
  e.stopPropagation()
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

const onWindowBlur = () => {
  handleFocusLoss()
}

onMounted(() => {
  window.addEventListener('click', closeTabContextMenu)
  window.addEventListener('click', closeBreadcrumbMenu)
  window.addEventListener('focus', onWindowFocus)
  window.addEventListener('blur', onWindowBlur)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeTabContextMenu)
  window.removeEventListener('click', closeBreadcrumbMenu)
  window.removeEventListener('focus', onWindowFocus)
  window.removeEventListener('blur', onWindowBlur)
})

const getFileIcon = (filename: string) => {
  if (filename.startsWith('Draft-')) return { icon: FileEdit, color: 'text-purple-400' }
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

const activeFileConflicts = computed(() => {
  if (!activeFile.value || activeFile.value.isDiff) return []
  return detectConflicts(activeFile.value.content)
})

const handleResolveConflicts = (choice: 'current' | 'incoming' | 'both') => {
  if (!activeFile.value) return
  const resolved = resolveAllConflicts(activeFile.value.content, choice)
  updateContent(activeFile.value.id, resolved)
  const label = choice === 'current' ? 'Accept Current' : choice === 'incoming' ? 'Accept Incoming' : 'Accept Both'
  editorNotification.value = `Konflik merge diselesaikan (${label})`
  setTimeout(() => {
    editorNotification.value = null
  }, 2500)
}

const isMarkdownPreviewOpen = ref(false)
const isMarkdownFile = computed(() => Boolean(activeFile.value && !activeFile.value.isDiff && /\.(md|markdown)$/i.test(activeFile.value.name)))
const renderedMarkdown = computed(() => isMarkdownFile.value && activeFile.value ? parseMarkdown(activeFile.value.content) : '')

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
  <div
    v-if="isEditorVisible"
    id="code-editor-pane"
    class="flex flex-col h-full w-full bg-[#12131a] border-r border-border/80 select-none overflow-hidden relative"
    @click="lastFocusedPane = 'editor'"
    @focusin="lastFocusedPane = 'editor'"
  >
    <!-- Top Tabs Bar for Open Files -->
    <div class="flex items-center justify-between h-9 bg-[#0d0e14] border-b border-border px-1">
      <div
        ref="tabStripRef"
        class="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0"
        @wheel="onTabStripWheel"
      >
        <UiTooltip
          v-for="(file, index) in openFiles"
          :key="file.id"
          :text="file.path"
          side="bottom"
          class="contents"
        >
          <div
            :data-editor-tab-index="index"
            :data-editor-tab-active="activeFileId === file.id ? 'true' : undefined"
            :class="[
              'group flex shrink-0 items-center gap-1.5 px-3 py-1 text-xs rounded-t font-mono cursor-pointer border-t-2 transition-all select-none relative touch-none',
              activeFileId === file.id
                ? 'bg-[#181924] text-foreground border-primary font-medium shadow-sm'
                : 'text-muted-foreground hover:bg-[#14151f] hover:text-foreground border-transparent',
              isDraggingTab && currentDragIndex === index
                ? 'ring-2 ring-primary bg-primary/20 scale-[1.02] z-20 shadow-md shadow-black/50'
                : ''
            ]"
            @pointerdown="handleTabPointerDown($event, index, file.id)"
            @click="!hasMoved && (activeFileId = file.id)"
            @contextmenu="handleTabContextMenu($event, file)"
          >
            <component
              :is="getFileIcon(file.name).icon"
              :class="['w-3.5 h-3.5 flex-shrink-0', getFileIcon(file.name).color]"
            />
            <span class="truncate max-w-[140px]">{{ file.name }}</span>
            <span v-if="file.isScratchpad" class="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 font-sans font-semibold flex-shrink-0">Draf</span>

            <!-- Dirty State Dot -->
            <UiTooltip v-if="file.isDirty" text="Ada perubahan belum disimpan" side="bottom" class="contents">
              <span class="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 animate-pulse" />
            </UiTooltip>

            <!-- Close File Tab -->
            <UiTooltip text="Tutup File" side="bottom" class="flex-shrink-0">
              <button
                class="p-0.5 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors ml-0.5"
                @click.stop="closeFile(file.id)"
              >
                <X class="w-3 h-3" />
              </button>
            </UiTooltip>
          </div>
        </UiTooltip>

        <!-- New Draft File Button -->
        <UiTooltip text="File Draf / Scratchpad Baru (Ctrl+N)" side="bottom">
          <button
            class="p-1 rounded hover:bg-[#181924] text-muted-foreground hover:text-foreground transition-colors ml-0.5 flex-shrink-0"
            @click="createScratchpadFile()"
          >
            <Plus class="w-3.5 h-3.5" />
          </button>
        </UiTooltip>

        <div v-if="openFiles.length === 0" class="text-[11px] text-muted-foreground/60 px-2 italic font-mono">
          No open files
        </div>
      </div>

      <!-- Editor Actions Right -->
      <div v-if="activeFile" class="flex items-center gap-1 pl-2 flex-shrink-0">
        <!-- Diff Toggle (Side-by-Side vs Inline) -->
        <UiTooltip
          v-if="activeFile.isDiff"
          :text="renderDiffSideBySide ? 'Beralih ke Tampilan Diff Inline' : 'Beralih ke Tampilan Diff Berdampingan (Side-by-Side)'"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            :class="[
              'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
              renderDiffSideBySide ? 'bg-primary/20 text-primary' : 'bg-secondary text-foreground'
            ]"
            @click="renderDiffSideBySide = !renderDiffSideBySide"
          >
            <GitCompare class="w-3 h-3 text-emerald-400" />
            <span>{{ renderDiffSideBySide ? 'Side-by-Side' : 'Inline' }}</span>
          </button>
        </UiTooltip>

        <!-- Toggle Word Wrap Button (Alt+Z) -->
        <UiTooltip
          v-if="!activeFile.isDiff"
          :text="`Word Wrap (${isWordWrap ? 'Aktif' : 'Nonaktif'}) - Alt+Z`"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            :class="[
              'p-1 rounded transition-colors',
              isWordWrap ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            ]"
            @click="isWordWrap = !isWordWrap"
          >
            <WrapText class="w-3.5 h-3.5" />
          </button>
        </UiTooltip>

        <!-- Toggle Minimap Button -->
        <UiTooltip
          v-if="!activeFile.isDiff"
          :text="`Minimap Editor (${settings.editorMinimap !== false ? 'Aktif' : 'Nonaktif'})`"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            :class="[
              'p-1 rounded transition-colors',
              settings.editorMinimap !== false ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            ]"
            @click="updateSettings({ editorMinimap: settings.editorMinimap === false ? true : false })"
          >
            <AlignJustify class="w-3.5 h-3.5" />
          </button>
        </UiTooltip>

        <!-- Toggle Whitespace Characters -->
        <UiTooltip
          v-if="!activeFile.isDiff"
          :text="`Tampilkan Whitespace (${settings.editorRenderWhitespace === 'all' ? 'Aktif (All)' : 'Nonaktif/Selection'})`"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            :class="[
              'p-1 rounded transition-colors',
              settings.editorRenderWhitespace === 'all' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            ]"
            @click="updateSettings({ editorRenderWhitespace: settings.editorRenderWhitespace === 'all' ? 'selection' : 'all' })"
          >
            <Pilcrow class="w-3.5 h-3.5" />
          </button>
        </UiTooltip>

        <!-- Markdown Live Preview Toggle -->
        <UiTooltip
          v-if="isMarkdownFile"
          :text="`Markdown Live Preview (${isMarkdownPreviewOpen ? 'Tutup Preview' : 'Buka Preview'})`"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            :class="[
              'p-1 rounded transition-colors',
              isMarkdownPreviewOpen ? 'bg-primary text-primary-foreground font-semibold shadow-xs' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            ]"
            @click="isMarkdownPreviewOpen = !isMarkdownPreviewOpen"
          >
            <Eye class="w-3.5 h-3.5" />
          </button>
        </UiTooltip>

        <!-- Toggle Auto Save Button -->
        <UiTooltip
          :text="`Auto-Save (${isAutoSave ? 'Aktif' : 'Nonaktif'})`"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            :class="[
              'px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors',
              isAutoSave ? 'bg-primary text-primary-foreground font-semibold' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            ]"
            @click="isAutoSave = !isAutoSave"
          >
            AutoSave
          </button>
        </UiTooltip>

        <!-- Split Editor Side-by-Side (2 Files) Button -->
        <UiTooltip
          text="Split Editor Kiri/Kanan (2 File Berdampingan)"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            :class="[
              'p-1 rounded transition-colors',
              isEditorPaneSplit ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            ]"
            @click="toggleEditorPaneSplit"
          >
            <Columns2 class="w-3.5 h-3.5" />
          </button>
        </UiTooltip>

        <!-- Prettier Format Button -->
        <UiTooltip
          text="Format Dokumen (Prettier / Shift+Alt+F)"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            class="flex items-center gap-1 px-2 py-0.5 rounded bg-secondary/80 hover:bg-secondary text-foreground text-xs transition-colors font-medium"
            :disabled="isFormatting"
            @click="handleFormat"
          >
            <Sparkles class="w-3 h-3 text-amber-400" />
            <span class="hidden sm:inline text-[11px]">Format</span>
          </button>
        </UiTooltip>

        <!-- Save Button -->
        <UiTooltip
          v-if="activeFile.isDirty && !isAutoSave"
          text="Simpan File (Ctrl+S)"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            class="flex items-center gap-1 px-2 py-0.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-all font-medium"
            @click="saveFile()"
          >
            <Save class="w-3 h-3" />
            <span>Save</span>
          </button>
        </UiTooltip>

        <UiTooltip
          text="Salin Isi File"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            @click="copyAllCode"
          >
            <Check v-if="isCopied" class="w-3.5 h-3.5 text-emerald-400" />
            <Copy v-else class="w-3.5 h-3.5" />
          </button>
        </UiTooltip>

        <!-- Maximize / Restore Editor Button -->
        <UiTooltip
          :text="viewportMode === 'editor-full' ? 'Kembalikan Tampilan Split' : 'Fullscreen Editor'"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            @click="toggleFullscreenEditor"
          >
            <Minimize2 v-if="viewportMode === 'editor-full'" class="w-3.5 h-3.5" />
            <Maximize2 v-else class="w-3.5 h-3.5" />
          </button>
        </UiTooltip>
      </div>

      <!-- Maximize / Restore Editor Button when no active file -->
      <div v-else class="flex items-center gap-1 pl-2 flex-shrink-0">
        <UiTooltip
          :text="viewportMode === 'editor-full' ? 'Kembalikan Tampilan Split' : 'Fullscreen Editor'"
          side="bottom"
          class="flex-shrink-0"
        >
          <button
            class="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            @click="toggleFullscreenEditor"
          >
            <Minimize2 v-if="viewportMode === 'editor-full'" class="w-3.5 h-3.5" />
            <Maximize2 v-else class="w-3.5 h-3.5" />
          </button>
        </UiTooltip>
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

      <button
        class="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary/20 hover:bg-primary/30 text-primary font-medium text-xs transition-colors cursor-pointer"
        @click="createScratchpadFile()"
      >
        <Plus class="w-3.5 h-3.5" />
        <span>Buka File Draf / Catatan Baru (Ctrl+N)</span>
      </button>
    </div>

    <!-- Monaco Code Editor Main Area (Single or Split 2-Pane) -->
    <template v-else>
      <!-- Breadcrumbs -->
      <div
        v-if="activeFile && !activeFile.isDiff"
        class="flex items-center h-[26px] px-3 bg-[#0f1017] border-b border-border/40 text-[11px] font-mono text-muted-foreground select-none overflow-x-auto no-scrollbar shrink-0 gap-0.5"
      >
        <template v-for="(segment, idx) in breadcrumbSegments" :key="idx">
          <div
            v-if="segment.isFolder"
            class="flex items-center gap-1 hover:text-foreground hover:bg-white/5 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
            @click="showBreadcrumbMenu($event, segment)"
          >
            <Folder class="w-3 h-3 text-muted-foreground/70" />
            <span>{{ segment.name }}</span>
          </div>
          <div
            v-else
            class="flex items-center gap-1 px-1.5 py-0.5 text-foreground font-medium"
          >
            <component
              :is="getFileIcon(segment.name).icon"
              :class="['w-3 h-3', getFileIcon(segment.name).color]"
            />
            <span>{{ segment.name }}</span>
          </div>

          <ChevronRight v-if="idx < breadcrumbSegments.length - 1" class="w-3 h-3 text-muted-foreground/50 flex-shrink-0 mx-0.5" />
        </template>
      </div>

      <!-- Git Merge Conflict Quick Action Banner -->
      <div
        v-if="activeFileConflicts.length > 0"
        class="bg-amber-950/80 border-b border-amber-600/60 px-3 py-1.5 flex items-center justify-between text-xs select-none backdrop-blur-md animate-in fade-in z-20 flex-shrink-0"
      >
        <div class="flex items-center gap-2 text-amber-300 font-medium">
          <GitMerge class="w-4 h-4 text-amber-400 animate-pulse flex-shrink-0" />
          <span>Terdeteksi {{ activeFileConflicts.length }} blok konflik merge git</span>
        </div>
        <div class="flex items-center gap-1.5 font-sans">
          <button
            class="px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white font-medium text-[11px] transition-colors cursor-pointer"
            @click="handleResolveConflicts('current')"
          >
            Accept Current (HEAD)
          </button>
          <button
            class="px-2 py-0.5 rounded bg-sky-600/80 hover:bg-sky-500 text-white font-medium text-[11px] transition-colors cursor-pointer"
            @click="handleResolveConflicts('incoming')"
          >
            Accept Incoming ({{ activeFileConflicts[0]?.incomingBranch || 'Branch' }})
          </button>
          <button
            class="px-2 py-0.5 rounded bg-purple-600/80 hover:bg-purple-500 text-white font-medium text-[11px] transition-colors cursor-pointer"
            @click="handleResolveConflicts('both')"
          >
            Accept Both
          </button>
        </div>
      </div>

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
            :render-side-by-side="renderDiffSideBySide"
            @update:modified-value="updateContent(activeFile.id, $event)"
            @save="saveFile"
          />

          <!-- Regular Monaco Editor Mode (with optional Markdown Live Preview) -->
          <div v-else class="flex flex-row h-full w-full overflow-hidden">
            <div :class="[isMarkdownPreviewOpen && isMarkdownFile ? 'w-1/2 border-r border-border' : 'w-full', 'h-full overflow-hidden relative']">
              <MonacoEditor
                ref="monacoRef"
                :model-value="activeFile.content"
                :filename="activeFile.name"
                :file-path="activeFile.path"
                :word-wrap="isWordWrap"
                @update:model-value="updateContent(activeFile.id, $event)"
                @save="saveFile"
                @format="handleFormat"
                @toggle-word-wrap="isWordWrap = !isWordWrap"
                @blur="handleFocusLoss"
              />
            </div>
            <div
              v-if="isMarkdownPreviewOpen && isMarkdownFile"
              class="w-1/2 h-full overflow-y-auto bg-[#0e0f17] p-5 prose prose-invert max-w-none text-foreground select-text"
              v-html="renderedMarkdown"
            />
          </div>
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
              <UiTooltip text="Tutup Pane Kanan" side="bottom" class="flex-shrink-0">
                <button
                  class="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground text-[10px]"
                  @click="isEditorPaneSplit = false"
                >
                  <X class="w-3 h-3" />
                </button>
              </UiTooltip>
            </div>
            <div class="flex-1 w-full h-full overflow-hidden relative">
              <MonacoEditor
                ref="secondaryMonacoRef"
                :model-value="secondaryFile.content"
                :filename="secondaryFile.name"
                :file-path="secondaryFile.path"
                :word-wrap="isWordWrap"
                @update:model-value="updateContent(secondaryFile.id, $event)"
                @save="saveFile(secondaryFile.id)"
                @toggle-word-wrap="isWordWrap = !isWordWrap"
                @blur="handleFocusLoss"
              />
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Breadcrumb Popover -->
    <Teleport to="body">
      <div
        v-if="breadcrumbPopover"
        class="fixed z-[100] min-w-[200px] max-w-[300px] max-h-[300px] overflow-y-auto overflow-x-hidden bg-[#14151f] border border-border/80 rounded shadow-xl p-1 text-[11px] font-mono text-foreground animate-in fade-in zoom-in-95 duration-100"
        :style="{ top: `${breadcrumbPopover.top}px`, left: `${breadcrumbPopover.left}px` }"
        @click.stop
      >
        <div v-if="breadcrumbPopover.entries.length === 0" class="px-2 py-1.5 text-muted-foreground italic">
          (Empty folder)
        </div>
        <button
          v-for="entry in breadcrumbPopover.entries"
          :key="entry.path"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-left transition-colors truncate"
          @click="handleBreadcrumbItemClick(entry)"
        >
          <template v-if="entry.is_dir">
            <Folder class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <span class="truncate">{{ entry.name }}</span>
          </template>
          <template v-else>
            <component
              :is="getFileIcon(entry.name).icon"
              :class="['w-3.5 h-3.5 flex-shrink-0', getFileIcon(entry.name).color]"
            />
            <span class="truncate">{{ entry.name }}</span>
          </template>
        </button>
      </div>
    </Teleport>

    <!-- Tab Right Click Context Menu -->
    <Teleport to="body">
      <div
        v-if="tabContextMenu.visible && tabContextMenu.file"
        class="fixed z-[100] min-w-[190px] bg-[#14151f] border border-border/80 rounded-lg shadow-2xl p-1 text-xs font-sans text-foreground animate-in fade-in zoom-in-95 duration-100"
        :style="tabContextMenuStyle"
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
          @click="openPathDefault(tabContextMenu.file?.path || ''); closeTabContextMenu()"
        >
          <ExternalLink class="w-3.5 h-3.5 text-sky-400" />
          <span>Buka dengan Aplikasi Bawaan</span>
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

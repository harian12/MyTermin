<script setup lang="ts">
import {
  Copy,
  ClipboardPaste,
  Trash2,
  Plus,
  X,
  CopyPlus,
  LayoutGrid,
  Columns2,
  Rows2,
  Square,
  Sparkles
} from 'lucide-vue-next'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  hasSelection: boolean
  targetPaneId?: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'action', action: string): void
}>()

const menuRef = ref<HTMLElement | null>(null)

// Adjust position to stay inside viewport
const stylePosition = computed(() => {
  const menuWidth = 210
  const menuHeight = 310
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 800

  let posX = props.x
  let posY = props.y

  if (posX + menuWidth > winWidth) {
    posX = winWidth - menuWidth - 8
  }
  if (posY + menuHeight > winHeight) {
    posY = winHeight - menuHeight - 8
  }

  return {
    left: `${Math.max(8, posX)}px`,
    top: `${Math.max(8, posY)}px`
  }
})

const handleAction = (action: string) => {
  emit('action', action)
  emit('close')
}

// Click outside handler
const handleClickOutside = (e: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('click', handleClickOutside)
  window.addEventListener('blur', () => emit('close'))
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    v-if="visible"
    ref="menuRef"
    :style="stylePosition"
    class="fixed z-50 w-52 rounded-lg border border-border/80 bg-[#151622]/95 backdrop-blur-md p-1 shadow-2xl text-popover-foreground animate-in fade-in zoom-in-95 select-none"
    @contextmenu.prevent
  >
    <!-- Terminal Clipboard Section -->
    <button
      :disabled="!hasSelection"
      :class="[
        'w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md transition-colors cursor-pointer',
        hasSelection ? 'hover:bg-accent hover:text-foreground text-foreground/90' : 'text-muted-foreground/40 cursor-not-allowed'
      ]"
      @click="hasSelection && handleAction('copy')"
    >
      <div class="flex items-center gap-2">
        <Copy class="w-3.5 h-3.5 text-indigo-400" />
        <span>Copy Selection</span>
      </div>
      <kbd class="text-[10px] text-muted-foreground font-mono">Ctrl+C</kbd>
    </button>

    <button
      class="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md hover:bg-accent hover:text-foreground text-foreground/90 transition-colors cursor-pointer"
      @click="handleAction('paste')"
    >
      <div class="flex items-center gap-2">
        <ClipboardPaste class="w-3.5 h-3.5 text-emerald-400" />
        <span>Paste</span>
      </div>
      <kbd class="text-[10px] text-muted-foreground font-mono">Ctrl+V</kbd>
    </button>

    <button
      class="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md hover:bg-accent hover:text-foreground text-foreground/90 transition-colors cursor-pointer"
      @click="handleAction('clear')"
    >
      <div class="flex items-center gap-2">
        <Trash2 class="w-3.5 h-3.5 text-amber-400" />
        <span>Clear Screen</span>
      </div>
    </button>

    <div class="h-px bg-border/50 my-1" />

    <!-- Tab & Session Operations -->
    <button
      class="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md hover:bg-accent hover:text-foreground text-foreground/90 transition-colors cursor-pointer"
      @click="handleAction('command-palette')"
    >
      <div class="flex items-center gap-2">
        <Sparkles class="w-3.5 h-3.5 text-white" />
        <span>Command Palette</span>
      </div>
      <kbd class="text-[10px] text-muted-foreground font-mono">Ctrl+K</kbd>
    </button>

    <button
      class="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md hover:bg-accent hover:text-foreground text-foreground/90 transition-colors cursor-pointer"
      @click="handleAction('new-tab')"
    >
      <div class="flex items-center gap-2">
        <Plus class="w-3.5 h-3.5 text-blue-400" />
        <span>Tab Baru</span>
      </div>
      <kbd class="text-[10px] text-muted-foreground font-mono">Ctrl+T</kbd>
    </button>

    <button
      class="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md hover:bg-accent hover:text-foreground text-foreground/90 transition-colors cursor-pointer"
      @click="handleAction('duplicate')"
    >
      <div class="flex items-center gap-2">
        <CopyPlus class="w-3.5 h-3.5 text-purple-400" />
        <span>Duplikat Tab</span>
      </div>
      <kbd class="text-[10px] text-muted-foreground font-mono">Ctrl+Shift+D</kbd>
    </button>

    <button
      class="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md hover:bg-accent hover:text-foreground text-foreground/90 transition-colors cursor-pointer"
      @click="handleAction('close-tab')"
    >
      <div class="flex items-center gap-2">
        <X class="w-3.5 h-3.5 text-red-400" />
        <span>Tutup Tab</span>
      </div>
      <kbd class="text-[10px] text-muted-foreground font-mono">Ctrl+W</kbd>
    </button>

    <div class="h-px bg-border/50 my-1" />

    <!-- Layout Switch Quick Pick -->
    <div class="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
      Layout View
    </div>

    <div class="grid grid-cols-4 gap-1 px-1 py-0.5">
      <button
        class="flex flex-col items-center justify-center p-1.5 rounded-md hover:bg-accent hover:text-foreground text-muted-foreground transition-colors cursor-pointer"
        title="Single View (Ctrl+Shift+S)"
        @click="handleAction('layout-single')"
      >
        <Square class="w-3.5 h-3.5" />
        <span class="text-[9px] mt-0.5">1x1</span>
      </button>

      <button
        class="flex flex-col items-center justify-center p-1.5 rounded-md hover:bg-accent hover:text-foreground text-muted-foreground transition-colors cursor-pointer"
        title="Split Horizontal (Ctrl+Shift+E)"
        @click="handleAction('layout-split-h')"
      >
        <Columns2 class="w-3.5 h-3.5" />
        <span class="text-[9px] mt-0.5">2-Col</span>
      </button>

      <button
        class="flex flex-col items-center justify-center p-1.5 rounded-md hover:bg-accent hover:text-foreground text-muted-foreground transition-colors cursor-pointer"
        title="Split Vertical (Ctrl+Shift+O)"
        @click="handleAction('layout-split-v')"
      >
        <Rows2 class="w-3.5 h-3.5" />
        <span class="text-[9px] mt-0.5">2-Row</span>
      </button>

      <button
        class="flex flex-col items-center justify-center p-1.5 rounded-md hover:bg-accent hover:text-foreground text-muted-foreground transition-colors cursor-pointer"
        title="4-Grid (Ctrl+Shift+G)"
        @click="handleAction('layout-grid-2x2')"
      >
        <LayoutGrid class="w-3.5 h-3.5 text-primary" />
        <span class="text-[9px] mt-0.5 text-primary">4-Grid</span>
      </button>
    </div>
  </div>
</template>

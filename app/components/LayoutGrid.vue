<script setup lang="ts">
import { Plus, Sparkles, Command } from 'lucide-vue-next'
import type { LayoutType, TerminalTab } from '~/types/terminal'

const { terminals, activeTerminalId, currentLayout, addTerminal } = useWorkspaceStore()

const emit = defineEmits<{
  (e: 'focus', termId: string): void
  (e: 'close', termId: string): void
  (e: 'open-presets'): void
  (e: 'contextmenu', payload: { x: number; y: number; hasSelection: boolean; paneId: string }): void
}>()

// Kapasitas layout dinamis: single=1, split=2, grid-2x2=4
const layoutCapacity = computed(() => {
  if (currentLayout.value === 'single') return 1
  if (currentLayout.value === 'split-h' || currentLayout.value === 'split-v') return 2
  if (currentLayout.value === 'grid-2x2') return 4
  return 1
})

// Index awal sliding window untuk tab yang tampil di grid
const windowStartIndex = ref(0)

const updateWindow = () => {
  const count = terminals.value.length
  const cap = layoutCapacity.value
  if (count <= cap) {
    windowStartIndex.value = 0
    return
  }
  const activeIdx = terminals.value.findIndex(t => t.id === activeTerminalId.value)
  if (activeIdx === -1) return

  if (activeIdx < windowStartIndex.value) {
    windowStartIndex.value = activeIdx
  } else if (activeIdx >= windowStartIndex.value + cap) {
    windowStartIndex.value = activeIdx - cap + 1
  }

  const maxStart = Math.max(0, count - cap)
  if (windowStartIndex.value > maxStart) {
    windowStartIndex.value = maxStart
  }
  if (windowStartIndex.value < 0) {
    windowStartIndex.value = 0
  }
}

watch(
  [activeTerminalId, currentLayout, () => terminals.value.map(t => t.id).join(',')],
  updateWindow,
  { immediate: true }
)

// Menentukan terminal mana saja yang aktif tampil di viewport grid
const isTerminalVisible = (termId: string): boolean => {
  if (terminals.value.length === 0) return false

  if (currentLayout.value === 'single') {
    return activeTerminalId.value === termId
  }

  const idx = terminals.value.findIndex(t => t.id === termId)
  if (idx === -1) return false

  return idx >= windowStartIndex.value && idx < windowStartIndex.value + layoutCapacity.value
}

// Menghitung terminal yang sedang tampil di grid
const visibleTerminals = computed(() => {
  return terminals.value.filter(t => isTerminalVisible(t.id))
})

const visibleCount = computed(() => visibleTerminals.value.length)

// CSS Grid class dinamis berdasarkan jumlah tab yang terlihat
const gridClass = computed(() => {
  const count = visibleCount.value

  if (currentLayout.value === 'single' || count <= 1) {
    return 'grid grid-cols-1 grid-rows-1'
  }

  if (currentLayout.value === 'split-h') {
    return 'grid grid-cols-2 grid-rows-1'
  }

  if (currentLayout.value === 'split-v') {
    return 'grid grid-cols-1 grid-rows-2'
  }

  if (currentLayout.value === 'grid-2x2') {
    if (count === 2) return 'grid grid-cols-2 grid-rows-1'
    if (count === 3) return 'grid grid-cols-2 grid-rows-2'
    return 'grid grid-cols-2 grid-rows-2'
  }

  return 'grid grid-cols-1 grid-rows-1'
})
</script>

<template>
  <div class="w-full h-full p-2 bg-background relative flex flex-col min-h-0 min-w-0">
    <!-- Empty State saat tidak ada terminal yang terbuka -->
    <div
      v-if="terminals.length === 0"
      class="w-full h-full flex flex-col items-center justify-center border border-dashed border-border/60 rounded-xl bg-[#12131a]/60 p-6 text-center animate-in fade-in zoom-in-95"
    >
      <div class="mb-5 flex items-center justify-center">
        <div class="p-3.5 rounded-2xl bg-[#18181b] border border-white/20 shadow-2xl shadow-white/5">
          <svg width="72" height="72" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="20" y="20" width="472" height="472" rx="100" fill="#18181b" stroke="#ffffff" stroke-opacity="0.3" stroke-width="16" />
            <!-- Top-Left -->
            <rect x="52" y="52" width="180" height="180" rx="36" fill="#27272a" stroke="#ffffff" stroke-opacity="0.8" stroke-width="12" />
            <path d="M 90 115 L 132 142 L 90 169" fill="none" stroke="#ffffff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
            <line x1="150" y1="169" x2="194" y2="169" stroke="#ffffff" stroke-width="18" stroke-linecap="round" />
            <!-- Top-Right -->
            <rect x="280" y="52" width="180" height="180" rx="36" fill="#27272a" stroke="#ffffff" stroke-opacity="0.8" stroke-width="12" />
            <path d="M 370 85 Q 370 142 425 142 Q 370 142 370 199 Q 370 142 315 142 Q 370 142 370 85 Z" fill="#ffffff" />
            <circle cx="370" cy="142" r="10" fill="#18181b" />
            <!-- Bottom-Left -->
            <rect x="52" y="280" width="180" height="180" rx="36" fill="#27272a" stroke="#ffffff" stroke-opacity="0.8" stroke-width="12" />
            <path d="M 100 342 L 76 370 L 100 398" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M 184 342 L 208 370 L 184 398" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
            <line x1="156" y1="334" x2="128" y2="406" stroke="#ffffff" stroke-width="14" stroke-linecap="round" />
            <!-- Bottom-Right -->
            <rect x="280" y="280" width="180" height="180" rx="36" fill="#27272a" stroke="#ffffff" stroke-opacity="0.8" stroke-width="12" />
            <path d="M 390 322 L 340 376 L 372 376 L 356 428 L 412 366 L 378 366 Z" fill="#ffffff" />
            <!-- Central Badge -->
            <circle cx="256" cy="256" r="42" fill="#18181b" stroke="#ffffff" stroke-width="12" />
            <circle cx="256" cy="256" r="18" fill="#ffffff" />
          </svg>
        </div>
      </div>

      <h2 class="text-lg font-bold text-foreground tracking-tight">Tidak Ada Terminal Terbuka</h2>
      <p class="text-xs text-muted-foreground max-w-sm mt-1 mb-6">
        Semua sesi terminal telah ditutup. Buka tab terminal baru atau jalankan preset workspace favorit Anda.
      </p>

      <div class="flex items-center gap-3">
        <UiButton
          variant="default"
          size="default"
          class="gap-2 font-semibold shadow-md"
          @click="addTerminal()"
        >
          <Plus class="w-4 h-4" />
          <span>Buka Terminal Baru</span>
          <UiBadge variant="secondary" class="ml-1 text-[10px] bg-white/20 text-white">Ctrl+T</UiBadge>
        </UiButton>

        <UiButton
          variant="outline"
          size="default"
          class="gap-2 border-border/60 hover:bg-accent"
          @click="emit('open-presets')"
        >
          <Sparkles class="w-4 h-4 text-indigo-400" />
          <span>Buka Presets</span>
        </UiButton>
      </div>

      <!-- Shortcut helper pills -->
      <div class="flex flex-wrap items-center justify-center gap-3 mt-8 pt-6 border-t border-border/30 text-[11px] text-muted-foreground">
        <div class="flex items-center gap-1.5 bg-background/50 px-2.5 py-1 rounded-md border border-border/30">
          <kbd class="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground">Ctrl + K</kbd>
          <span>Command Palette</span>
        </div>
        <div class="flex items-center gap-1.5 bg-background/50 px-2.5 py-1 rounded-md border border-border/30">
          <kbd class="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground">Ctrl + T</kbd>
          <span>Tab Baru</span>
        </div>
        <div class="flex items-center gap-1.5 bg-background/50 px-2.5 py-1 rounded-md border border-border/30">
          <kbd class="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground">Ctrl + W</kbd>
          <span>Tutup Tab</span>
        </div>
        <div class="flex items-center gap-1.5 bg-background/50 px-2.5 py-1 rounded-md border border-border/30">
          <kbd class="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground">Ctrl + Tab</kbd>
          <span>Pindah Tab</span>
        </div>
        <div class="flex items-center gap-1.5 bg-background/50 px-2.5 py-1 rounded-md border border-border/30">
          <kbd class="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground">Ctrl + Shift + D</kbd>
          <span>Duplikat</span>
        </div>
        <div class="flex items-center gap-1.5 bg-background/50 px-2.5 py-1 rounded-md border border-border/30">
          <kbd class="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono text-foreground">Ctrl + Shift + G</kbd>
          <span>4-Grid</span>
        </div>
      </div>
    </div>

    <!-- Persistent Dynamic Grid Container (Semua Tab tetap hidup di DOM agar PTY tidak mati) -->
    <div
      v-else
      :class="[
        'w-full h-full gap-2 transition-all duration-200 min-h-0 min-w-0',
        gridClass
      ]"
    >
      <template v-for="(term, idx) in terminals" :key="term.id">
        <div
          v-show="isTerminalVisible(term.id)"
          :class="[
            'w-full h-full min-h-0 min-w-0 overflow-hidden',
            // Jika 3 terminal pada layout 2x2, buat terminal ke-3 melebar (span-2) di baris bawah
            currentLayout === 'grid-2x2' && visibleCount === 3 && term.id === visibleTerminals[2]?.id ? 'col-span-2' : ''
          ]"
        >
          <TerminalPane
            :pane-id="term.id"
            :title="term.title"
            :shell="term.shell"
            :cwd="term.cwd"
            :initial-command="term.initialCommand"
            :last-command="term.lastCommand"
            :is-active="activeTerminalId === term.id"
            :is-tab-active="isTerminalVisible(term.id)"
            @focus="activeTerminalId = $event"
            @close="emit('close', $event)"
            @contextmenu="emit('contextmenu', $event)"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { Keyboard, Search, X } from 'lucide-vue-next'
import { useSettingsStore } from '~/composables/useSettingsStore'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const { settings } = useSettingsStore()

const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (val) => {
    if (val) {
      query.value = ''
      nextTick(() => inputRef.value?.focus())
    }
  }
)

interface ShortcutItem {
  keys: string[]
  label: string
}

interface ShortcutGroup {
  title: string
  items: ShortcutItem[]
}

const kb = (key: string, fallback: string) => {
  const map = settings.value.keybindings as Record<string, string> | undefined
  return map?.[key] || fallback
}

const groups = computed<ShortcutGroup[]>(() => [
  {
    title: 'Global',
    items: [
      { keys: [kb('commandPalette', 'Ctrl+K')], label: 'Command Palette' },
      { keys: ['Ctrl+P'], label: 'Quick Open File' },
      { keys: ['Ctrl+Shift+F'], label: 'Cari & Ganti di Semua File' },
      { keys: ['Ctrl+B'], label: 'Toggle Sidebar' },
      { keys: ['F1', 'Ctrl+/'], label: 'Buka Cheatsheet Shortcut Ini' },
      { keys: ['Ctrl+Shift+P'], label: 'Buka Presets Workspace' }
    ]
  },
  {
    title: 'Editor Kode',
    items: [
      { keys: ['Ctrl+S'], label: 'Simpan File' },
      { keys: ['Ctrl+Shift+S'], label: 'Simpan Semua File' },
      { keys: ['Ctrl+Shift+T'], label: 'Buka Kembali Tab yang Ditutup' },
      { keys: ['Shift+Alt+F'], label: 'Format Dokumen (Prettier)' },
      { keys: ['Alt+Z'], label: 'Toggle Word Wrap' },
      { keys: ['Ctrl+F'], label: 'Cari di File' },
      { keys: ['Ctrl+H'], label: 'Cari & Ganti di File' },
      { keys: ['Ctrl+W'], label: 'Tutup Tab File' }
    ]
  },
  {
    title: 'Terminal',
    items: [
      { keys: [kb('newTab', 'Ctrl+T')], label: 'Terminal Baru' },
      { keys: [kb('closeTab', 'Ctrl+W')], label: 'Tutup Terminal' },
      { keys: [kb('duplicateTab', 'Ctrl+Shift+D')], label: 'Duplikat Terminal' },
      { keys: [kb('searchBuffer', 'Ctrl+F')], label: 'Cari di Buffer Terminal' },
      { keys: ['Ctrl+C'], label: 'Copy seleksi (atau SIGINT)' },
      { keys: ['Ctrl+V'], label: 'Paste teks / gambar / path file' },
      { keys: ['Ctrl+='], label: 'Perbesar Font Terminal' },
      { keys: ['Ctrl+-'], label: 'Perkecil Font Terminal' },
      { keys: ['Ctrl+0'], label: 'Reset Ukuran Font Terminal' },
      { keys: ['Ctrl+Wheel'], label: 'Zoom Font Terminal' }
    ]
  },
  {
    title: 'Layout & Workstation',
    items: [
      { keys: ['Ctrl+Tab'], label: 'Terminal Berikutnya' },
      { keys: ['Ctrl+Shift+Tab'], label: 'Workstation Berikutnya' },
      { keys: [kb('splitHorizontal', 'Ctrl+Shift+E')], label: 'Layout Split Horizontal' },
      { keys: [kb('splitVertical', 'Ctrl+Shift+O')], label: 'Layout Split Vertikal' },
      { keys: [kb('grid2x2', 'Ctrl+Shift+G')], label: 'Layout Grid 2x2' },
      { keys: [kb('singleView', 'Ctrl+Shift+L')], label: 'Layout Terminal Tunggal' },
      { keys: ['Ctrl+Shift+←/→'], label: 'Geser Urutan Tab Terminal' },
      { keys: ['Ctrl+Shift+W'], label: 'Tutup Workstation Aktif' }
    ]
  }
])

const filteredGroups = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return groups.value
  return groups.value
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => i.label.toLowerCase().includes(q) || i.keys.some((k) => k.toLowerCase().includes(q))
      )
    }))
    .filter((g) => g.items.length > 0)
})

const totalCount = computed(() =>
  filteredGroups.value.reduce((acc, g) => acc + g.items.length, 0)
)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[105] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none"
      @click="emit('update:open', false)"
    >
      <div
        class="bg-[#12131a] border border-border w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-100"
        @click.stop
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-border bg-[#181924]">
          <div class="flex items-center gap-2.5">
            <div class="p-1.5 rounded-lg bg-primary/20 text-primary">
              <Keyboard class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-foreground">Keyboard Shortcuts</h3>
              <p class="text-[11px] text-muted-foreground">Daftar pintasan keyboard MyTermin (default, dapat diubah di Settings).</p>
            </div>
          </div>
          <button
            class="p-1.5 hover:bg-white/10 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            @click="emit('update:open', false)"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Search -->
        <div class="px-5 py-2.5 border-b border-border/60 bg-[#0d0e14]">
          <div class="flex items-center gap-2 bg-[#181924] border border-border/60 focus-within:border-primary px-2.5 py-1.5 rounded-lg">
            <Search class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              placeholder="Cari shortcut atau aksi..."
              class="flex-1 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <!-- Groups -->
        <div class="p-5 overflow-y-auto flex-1 space-y-5">
          <div v-for="group in filteredGroups" :key="group.title" class="space-y-1.5">
            <h4 class="text-[10px] font-bold uppercase tracking-wider text-primary/90">{{ group.title }}</h4>
            <div class="space-y-0.5">
              <div
                v-for="item in group.items"
                :key="group.title + item.label"
                class="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg hover:bg-[#181924] transition-colors"
              >
                <span class="text-xs text-foreground/90 min-w-0 truncate">{{ item.label }}</span>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <kbd
                    v-for="k in item.keys"
                    :key="k"
                    class="px-2 py-0.5 rounded-md bg-[#0d0e14] border border-border/70 text-[10px] font-mono text-muted-foreground whitespace-nowrap"
                  >
                    {{ k }}
                  </kbd>
                </div>
              </div>
            </div>
          </div>

          <div v-if="totalCount === 0" class="p-8 text-center text-xs text-muted-foreground">
            Tidak ada shortcut yang cocok dengan "{{ query }}"
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between px-5 py-2.5 bg-[#0e0f14] border-t border-border/50 text-[11px] text-muted-foreground font-mono">
          <span>{{ totalCount }} pintasan</span>
          <span>Ubah di <kbd class="bg-muted px-1.5 py-0.5 rounded text-[10px]">Settings → Keybindings</kbd></span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

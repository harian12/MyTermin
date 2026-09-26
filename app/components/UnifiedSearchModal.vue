<script setup lang="ts">
import { Search, Terminal as TerminalIcon, FileCode2, Loader2, CornerDownLeft } from 'lucide-vue-next'
import type { SearchResultItem } from '~/composables/useProjectExplorer'

interface TerminalHit {
  termId: string
  title: string
  line: number
  text: string
}

interface Props {
  open: boolean
  /** Provider pencarian buffer terminal (disediakan LayoutGrid yang memegang ref xterm). */
  searcher?: (query: string, caseSensitive: boolean) => TerminalHit[]
  onJump?: (termId: string, line: number) => void
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const query = ref('')
const matchCase = ref(false)
const includeFiles = ref(true)
const isSearching = ref(false)
const terminalHits = ref<TerminalHit[]>([])
const fileHits = ref<SearchResultItem[]>([])
const hasSearched = ref(false)

const { activeWorkstation } = useWorkspaceStore()
const { searchInFiles } = useProjectExplorer()
const { openFileAtPosition } = useEditorStore()
const { isTauri } = useTauriPty()

const totalHits = computed(() => terminalHits.value.length + fileHits.value.length)

const runSearch = async () => {
  const q = query.value.trim()
  if (!q) {
    terminalHits.value = []
    fileHits.value = []
    hasSearched.value = false
    return
  }

  isSearching.value = true
  try {
    terminalHits.value = props.searcher ? props.searcher(q, matchCase.value) : []
    if (includeFiles.value && activeWorkstation.value.folderPath) {
      fileHits.value = await searchInFiles(q, matchCase.value, 120)
    } else {
      fileHits.value = []
    }
    hasSearched.value = true
  } finally {
    isSearching.value = false
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null
watch(query, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(runSearch, 220)
})

watch(matchCase, runSearch)
watch(includeFiles, runSearch)

watch(
  () => props.open,
  (open) => {
    if (open) {
      nextTick(() => {
        const el = document.getElementById('unified-search-input') as HTMLInputElement | null
        el?.focus()
        el?.select()
      })
    } else {
      query.value = ''
      terminalHits.value = []
      fileHits.value = []
      hasSearched.value = false
    }
  }
)

const jumpTerminal = (hit: TerminalHit) => {
  props.onJump?.(hit.termId, hit.line)
  emit('update:open', false)
}

const openFileHit = async (hit: SearchResultItem) => {
  try {
    // Buka file di baris yang match supaya konteksnya langsung kelihatan.
    await openFileAtPosition(hit.file_path, hit.line_number, hit.col_start + 1)
    emit('update:open', false)
  } catch (e) {
    console.error('Gagal membuka file dari unified search:', e)
  }
}

const relName = (rel: string) => rel.split(/[\\/]/).pop() || rel
</script>

<template>
  <UiDialog
    :open="open"
    title="Unified Search"
    description="Cari teks di seluruh buffer terminal dan file project sekaligus."
    class="max-w-3xl"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <div class="relative flex-1">
          <Search class="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            id="unified-search-input"
            v-model="query"
            type="text"
            placeholder="Cari di terminal & file…"
            class="h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            @keydown.enter.prevent="runSearch"
            @keydown.esc="emit('update:open', false)"
          >
        </div>
        <label class="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <input v-model="matchCase" type="checkbox" class="h-3.5 w-3.5 accent-primary" >
          <span>Match case</span>
        </label>
        <label class="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <input v-model="includeFiles" type="checkbox" class="h-3.5 w-3.5 accent-primary" >
          <span>File</span>
        </label>
      </div>

      <div class="max-h-[55vh] overflow-y-auto">
        <p v-if="isSearching" class="flex items-center gap-2 px-1 py-4 text-[11px] text-muted-foreground">
          <Loader2 class="h-3.5 w-3.5 animate-spin" />
          Mencari…
        </p>

        <p v-else-if="hasSearched && totalHits === 0" class="px-1 py-6 text-center text-[11px] text-muted-foreground">
          Tidak ada hasil untuk “{{ query }}”.
        </p>

        <p v-else-if="!hasSearched" class="px-1 py-6 text-center text-[11px] text-muted-foreground">
          Ketik untuk mencari. Hasil terminal diambil dari scrollback yang masih tersimpan.
        </p>

        <div v-else class="space-y-4">
          <section v-if="terminalHits.length">
            <h3 class="flex items-center gap-1.5 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <TerminalIcon class="h-3 w-3" />
              Terminal ({{ terminalHits.length }})
            </h3>
            <div class="space-y-0.5">
              <button
                v-for="hit in terminalHits"
                :key="`${hit.termId}-${hit.line}`"
                class="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted"
                @click="jumpTerminal(hit)"
              >
                <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {{ hit.title }}:{{ hit.line }}
                </span>
                <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
                  {{ hit.text.trim() }}
                </span>
                <CornerDownLeft class="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
              </button>
            </div>
          </section>

          <section v-if="fileHits.length">
            <h3 class="flex items-center gap-1.5 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FileCode2 class="h-3 w-3" />
              File ({{ fileHits.length }})
            </h3>
            <div class="space-y-0.5">
              <button
                v-for="(hit, idx) in fileHits"
                :key="`${hit.file_path}-${hit.line_number}-${idx}`"
                class="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-muted"
                @click="openFileHit(hit)"
              >
                <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {{ relName(hit.rel_path) }}:{{ hit.line_number }}
                </span>
                <span class="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
                  {{ hit.line_content.trim() }}
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>

      <p v-if="isTauri === false" class="text-[10px] text-muted-foreground">
        Mode web: pencarian file project tidak tersedia.
      </p>
    </div>
  </UiDialog>
</template>

<script setup lang="ts">
import { Archive, GitBranch, ArrowDownToLine, Upload, Trash2, Eye, Plus, Loader2 } from 'lucide-vue-next'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const { stashList, isBusy, refreshStashList, stashSave, stashApply, stashDrop, stashShow, createTag, refreshTags, tagList } = useGitExtras()
const { showAppPrompt } = useAppDialog()
const { copyToClipboard } = useTauriPty()

const activeTab = ref<'stash' | 'tag'>('stash')
const preview = ref<{ selector: string; patch: string } | null>(null)
const newTag = ref('')

watch(
  () => props.open,
  (open) => {
    if (open) {
      refreshStashList()
      refreshTags()
    } else {
      preview.value = null
    }
  }
)

const handleStashSave = async () => {
  const message = await showAppPrompt('Pesan untuk stash (opsional):', 'Simpan Perubahan')
  if (message === null) return
  await stashSave(message || undefined)
}

const handlePreview = async (selector: string) => {
  if (preview.value?.selector === selector) {
    preview.value = null
    return
  }
  const patch = await stashShow(selector)
  preview.value = { selector, patch }
}

const handleCreateTag = async () => {
  const name = newTag.value.trim()
  if (!name) return
  await createTag(name)
  newTag.value = ''
}
</script>

<template>
  <UiDialog
    :open="open"
    title="Git Stash & Tag"
    description="Simpan perubahan sementara, dan kelola tag repository."
    class="max-w-2xl"
    @update:open="emit('update:open', $event)"
  >
    <div class="space-y-3">
      <div class="flex gap-1 rounded-lg border border-border/50 bg-muted/30 p-1">
        <button
          v-for="tab in [{ key: 'stash', label: 'Stash' }, { key: 'tag', label: 'Tag' }]"
          :key="tab.key"
          :class="[
            'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
            activeTab === tab.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          ]"
          @click="activeTab = tab.key as 'stash' | 'tag'"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- STASH -->
      <div v-if="activeTab === 'stash'" class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-[11px] text-muted-foreground">
            {{ stashList.length }} stash tersimpan
          </p>
          <UiButton size="sm" class="h-7 gap-1.5 text-xs" :disabled="isBusy" @click="handleStashSave">
            <Plus class="h-3.5 w-3.5" />
            <span>Stash Perubahan</span>
          </UiButton>
        </div>

        <p v-if="stashList.length === 0" class="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-[11px] text-muted-foreground">
          Belum ada stash.
        </p>

        <div v-else class="max-h-80 space-y-1.5 overflow-y-auto">
          <div
            v-for="entry in stashList"
            :key="entry.selector"
            class="rounded-md border border-border/50 bg-muted/10"
          >
            <div class="flex items-center gap-2 px-2.5 py-2">
              <Archive class="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-[11px] font-medium text-foreground/90">{{ entry.message }}</p>
                <p class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span v-if="entry.branch" class="flex items-center gap-1">
                    <GitBranch class="h-2.5 w-2.5" />{{ entry.branch }}
                  </span>
                  <span>{{ entry.date }}</span>
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-0.5">
                <button
                  class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Lihat patch"
                  @click="handlePreview(entry.selector)"
                >
                  <Eye class="h-3.5 w-3.5" />
                </button>
                <button
                  class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Apply (pertahankan stash)"
                  :disabled="isBusy"
                  @click="stashApply(entry.selector, false)"
                >
                  <ArrowDownToLine class="h-3.5 w-3.5" />
                </button>
                <button
                  class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Pop (hapus setelah apply)"
                  :disabled="isBusy"
                  @click="stashApply(entry.selector, true)"
                >
                  <Upload class="h-3.5 w-3.5" />
                </button>
                <button
                  class="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  title="Hapus stash"
                  :disabled="isBusy"
                  @click="stashDrop(entry.selector)"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div v-if="preview?.selector === entry.selector" class="border-t border-border/40">
              <div class="flex items-center justify-between px-2.5 py-1">
                <span class="font-mono text-[10px] text-muted-foreground">{{ entry.selector }}</span>
                <button
                  class="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  @click="copyToClipboard(preview.patch)"
                >
                  Salin patch
                </button>
              </div>
              <pre class="max-h-52 overflow-auto border-t border-border/40 bg-black/30 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-foreground/80">{{ preview.patch || '(patch kosong)' }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- TAG -->
      <div v-else class="space-y-2">
        <div class="flex items-center gap-2">
          <UiInput
            v-model="newTag"
            placeholder="Nama tag, mis. v0.3.0"
            class="h-8 flex-1 font-mono text-xs"
            @keydown.enter="handleCreateTag"
          />
          <UiButton size="sm" class="h-8 shrink-0 gap-1.5 text-xs" :disabled="!newTag.trim() || isBusy" @click="handleCreateTag">
            <Plus class="h-3.5 w-3.5" />
            <span>Buat Tag</span>
          </UiButton>
        </div>

        <p v-if="tagList.length === 0" class="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-[11px] text-muted-foreground">
          Belum ada tag.
        </p>

        <div v-else class="flex max-h-72 flex-wrap gap-1.5 overflow-y-auto">
          <span
            v-for="tag in tagList"
            :key="tag"
            class="rounded border border-border/50 bg-muted/20 px-2 py-1 font-mono text-[11px] text-foreground/90"
          >
            {{ tag }}
          </span>
        </div>
      </div>

      <p v-if="isBusy" class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 class="h-3 w-3 animate-spin" />
        Menjalankan operasi git…
      </p>
    </div>
  </UiDialog>
</template>

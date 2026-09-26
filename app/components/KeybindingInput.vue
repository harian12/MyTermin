<script setup lang="ts">
import { X, Pencil } from 'lucide-vue-next'
import { normalizeShortcut, shortcutFromEvent } from '~/composables/useSettingsStore'

interface Props {
  modelValue?: string
  conflict?: boolean
  placeholder?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const isRecording = ref(false)
const rootEl = ref<HTMLElement | null>(null)

const display = computed(() => (props.modelValue ? normalizeShortcut(props.modelValue) : 'Tidak ada'))

const startRecording = () => {
  isRecording.value = true
  nextTick(() => rootEl.value?.focus())
}

const cancelRecording = () => {
  isRecording.value = false
}

const clear = () => {
  emit('update:modelValue', '')
}

const onKeydown = (e: KeyboardEvent) => {
  if (!isRecording.value) return
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    isRecording.value = false
    return
  }

  const combo = shortcutFromEvent(e)
  if (combo) {
    emit('update:modelValue', combo)
    isRecording.value = false
  }
}
</script>

<template>
  <div class="flex w-full items-center gap-1.5">
    <div
      ref="rootEl"
      tabindex="0"
      role="button"
      :title="isRecording ? 'Tekan kombinasi tombol, Esc untuk batal' : 'Klik untuk rekam shortcut'"
      :class="[
        'flex h-7 min-w-0 flex-1 items-center justify-between gap-1 rounded border px-2 font-mono text-[11px] transition-colors outline-none focus:ring-1 focus:ring-ring',
        isRecording
          ? 'border-primary bg-primary/10 text-foreground'
          : conflict
          ? 'border-amber-500/60 bg-amber-500/5 text-foreground'
          : 'border-border/70 bg-background text-primary'
      ]"
      @click="startRecording"
      @keydown="onKeydown"
      @blur="cancelRecording"
    >
      <span v-if="isRecording" class="animate-pulse text-foreground">Tekan tombol…</span>
      <span v-else class="truncate">{{ display }}</span>
      <Pencil v-if="!isRecording && props.modelValue" class="h-3 w-3 shrink-0 opacity-40" />
    </div>

    <button
      type="button"
      class="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      :title="props.modelValue ? 'Hapus shortcut' : 'Belum ada shortcut'"
      @click="clear"
    >
      <X class="h-3 w-3" />
    </button>
  </div>
</template>

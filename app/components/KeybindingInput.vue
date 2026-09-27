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
    <UiTooltip
      :text="isRecording ? 'Tekan kombinasi tombol, Esc untuk batal' : 'Klik untuk rekam shortcut'"
      class="flex-1 min-w-0"
    >
      <div
        ref="rootEl"
        tabindex="0"
        role="button"
        :class="[
          'flex h-7 w-full items-center justify-between gap-1 rounded border px-2 font-mono text-[11px] transition-colors outline-none focus:ring-1 focus:ring-ring',
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
    </UiTooltip>

    <UiTooltip
      :text="props.modelValue ? 'Hapus shortcut' : 'Belum ada shortcut'"
      class="shrink-0"
    >
      <button
        type="button"
        class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        @click="clear"
      >
        <X class="h-3 w-3" />
      </button>
    </UiTooltip>
  </div>
</template>

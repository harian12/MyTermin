<script setup lang="ts">
import { Palette, RotateCcw } from 'lucide-vue-next'
import { TERMINAL_THEMES } from '~/composables/useThemes'
import type { CustomTheme } from '~/types/terminal'

const props = defineProps<{
  modelValue?: CustomTheme | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: CustomTheme): void
}>()

const ANSI_KEYS: { key: keyof CustomTheme['theme']; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'selectionBackground', label: 'Selection' },
  { key: 'black', label: 'Black' },
  { key: 'red', label: 'Red' },
  { key: 'green', label: 'Green' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'blue', label: 'Blue' },
  { key: 'magenta', label: 'Magenta' },
  { key: 'cyan', label: 'Cyan' },
  { key: 'white', label: 'White' },
  { key: 'brightBlack', label: 'Bright Black' },
  { key: 'brightRed', label: 'Bright Red' },
  { key: 'brightGreen', label: 'Bright Green' },
  { key: 'brightYellow', label: 'Bright Yellow' },
  { key: 'brightBlue', label: 'Bright Blue' },
  { key: 'brightMagenta', label: 'Bright Magenta' },
  { key: 'brightCyan', label: 'Bright Cyan' },
  { key: 'brightWhite', label: 'Bright White' }
]

const theme = computed<CustomTheme>(() => {
  if (props.modelValue) return props.modelValue
  const base = TERMINAL_THEMES.tokyoNight?.theme || {}
  return {
    key: 'custom',
    name: 'Custom Theme',
    theme: {
      background: base.background || '#1a1b26',
      foreground: base.foreground || '#c0caf5',
      cursor: base.cursor || '#c0caf5',
      cursorAccent: base.cursorAccent || '#1a1b26',
      selectionBackground: base.selectionBackground || '#33467c',
      black: base.black || '#15161e',
      red: base.red || '#f7768e',
      green: base.green || '#9ece6a',
      yellow: base.yellow || '#e0af68',
      blue: base.blue || '#7aa2f7',
      magenta: base.magenta || '#bb9af7',
      cyan: base.cyan || '#7dcfff',
      white: base.white || '#a9b1d6',
      brightBlack: base.brightBlack || '#414868',
      brightRed: base.brightRed || '#f7768e',
      brightGreen: base.brightGreen || '#9ece6a',
      brightYellow: base.brightYellow || '#e0af68',
      brightBlue: base.brightBlue || '#7aa2f7',
      brightMagenta: base.brightMagenta || '#bb9af7',
      brightCyan: base.brightCyan || '#7dcfff',
      brightWhite: base.brightWhite || '#c0caf5'
    }
  }
})

const patch = (key: keyof CustomTheme['theme'], value: string) => {
  emit('update:modelValue', {
    ...theme.value,
    theme: { ...theme.value.theme, [key]: value }
  })
}

const patchName = (name: string) => {
  emit('update:modelValue', { ...theme.value, name })
}

const resetToTokyoNight = () => {
  emit('update:modelValue', { ...theme.value, key: 'custom', name: 'Custom Theme' })
}

// Kontras teks vs background dipakai sebagai peringatan keterbacaan,
// bukan hard error: tema gelap extreme tetap mungkin disengaja.
const contrastInfo = computed(() => {
  const hex = theme.value.theme.background.replace('#', '')
  const bg = hex.length === 6 ? parseInt(hex, 16) : 0
  const r = (bg >> 16) & 255
  const g = (bg >> 8) & 255
  const b = bg & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.2 ? 'gelap' : luminance > 0.8 ? 'terang' : 'sedang'
})
</script>

<template>
  <div class="space-y-2.5">
    <div class="flex items-center gap-2">
      <UiInput
        :model-value="theme.name"
        class="h-8 flex-1 text-xs"
        placeholder="Nama tema"
        @update:model-value="patchName($event as string)"
      />
      <UiButton
        variant="ghost"
        size="sm"
        class="h-8 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        title="Kembalikan ke Tokyo Night"
        @click="resetToTokyoNight"
      >
        <RotateCcw class="h-3 w-3" />
        <span>Reset</span>
      </UiButton>
    </div>

    <!-- Preview -->
    <div
      class="rounded-md border border-border/50 p-2.5 font-mono text-[11px]"
      :style="{ background: theme.theme.background, color: theme.theme.foreground }"
    >
      <p class="mb-1 opacity-60">Preview — background {{ contrastInfo }}</p>
      <p>
        <span :style="{ color: theme.theme.red }">error</span>
        <span :style="{ color: theme.theme.green }">success</span>
        <span :style="{ color: theme.theme.yellow }">warning</span>
        <span :style="{ color: theme.theme.blue }">info</span>
      </p>
      <p class="mt-1">
        <span :style="{ color: theme.theme.magenta }">fn</span>
        <span> main</span>
        <span :style="{ color: theme.theme.cyan }">() {'{'}</span>
        <span :style="{ color: theme.theme.brightWhite }"> println</span>
        <span :style="{ color: theme.theme.brightBlack }">("</span>
        <span :style="{ color: theme.theme.brightGreen }">"hello"</span>
        <span :style="{ color: theme.theme.brightBlack }">);</span>
        <span :style="{ color: theme.theme.cyan }"> {'}'}</span>
      </p>
      <p class="mt-1" :style="{ background: theme.theme.selectionBackground, padding: '0 4px', display: 'inline-block' }">
        selection
      </p>
    </div>

    <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      <label
        v-for="item in ANSI_KEYS"
        :key="item.key"
        class="flex items-center gap-1.5 rounded border border-border/50 bg-muted/10 px-1.5 py-1"
      >
        <input
          type="color"
          class="h-5 w-5 shrink-0 cursor-pointer rounded border border-border/50 bg-transparent p-0"
          :value="theme.theme[item.key]"
          @input="patch(item.key, ($event.target as HTMLInputElement).value)"
        >
        <span class="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{{ item.label }}</span>
        <span class="shrink-0 font-mono text-[9px] text-foreground/50">{{ theme.theme[item.key] }}</span>
      </label>
    </div>

    <p class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <Palette class="h-3 w-3" />
      Tema ini tersimpan lokal di browser dan bisa diekspor lewat tab Diagnostik.
    </p>
  </div>
</template>

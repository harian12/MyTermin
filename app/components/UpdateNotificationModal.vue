<script setup lang="ts">
import { Sparkles, Download, RefreshCw, X, AlertCircle } from 'lucide-vue-next'
import { useUpdater } from '~/composables/useUpdater'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const {
  status: updateStatus,
  statusMessage,
  currentAppVersion,
  newVersion,
  releaseNotes,
  downloadProgress,
  isDownloading,
  downloadAndInstall,
} = useUpdater()

const handleClose = () => {
  if (isDownloading.value) return
  emit('update:open', false)
}
</script>

<template>
  <UiDialog
    :open="open"
    title="Pembaruan Tersedia"
    description="Versi terbaru MyTermin telah dirilis dan siap untuk dipasang."
    @update:open="handleClose"
  >
    <div class="space-y-4 py-2">
      <!-- Version Banner -->
      <div class="flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <div class="flex items-center gap-3">
          <div class="p-2 rounded-md bg-blue-500/20 text-blue-400">
            <Sparkles class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center gap-2 font-medium text-sm text-foreground">
              <span>MyTermin v{{ newVersion }}</span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                Baru
              </span>
            </div>
            <p class="text-[11px] text-muted-foreground">
              Versi saat ini: <span class="font-mono">v{{ currentAppVersion }}</span>
            </p>
          </div>
        </div>
      </div>

      <!-- Release Notes -->
      <div v-if="releaseNotes" class="space-y-1.5">
        <UiLabel class="text-xs font-semibold text-foreground/90">Catatan Rilis</UiLabel>
        <div class="p-3 rounded-md bg-[#13141d] border border-border/60 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
          {{ releaseNotes }}
        </div>
      </div>

      <!-- Download Progress Bar -->
      <div v-if="isDownloading || updateStatus === 'downloaded'" class="space-y-2 pt-1">
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted-foreground">{{ statusMessage }}</span>
          <span class="font-mono text-blue-400 font-medium">{{ downloadProgress }}%</span>
        </div>
        <div class="w-full h-2 bg-muted/40 rounded-full overflow-hidden">
          <div
            class="h-full bg-blue-500 transition-all duration-200"
            :style="{ width: `${downloadProgress}%` }"
          />
        </div>
      </div>

      <!-- Error message -->
      <div v-if="updateStatus === 'error'" class="flex items-center gap-2 p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
        <AlertCircle class="w-4 h-4 shrink-0" />
        <span class="truncate">{{ statusMessage }}</span>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2 w-full">
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="isDownloading"
          @click="handleClose"
        >
          Nanti Saja
        </UiButton>
        <UiButton
          variant="default"
          size="sm"
          class="gap-1.5 bg-blue-600 hover:bg-blue-500 text-white"
          :disabled="isDownloading"
          @click="downloadAndInstall"
        >
          <RefreshCw v-if="isDownloading" class="w-3.5 h-3.5 animate-spin" />
          <Download v-else class="w-3.5 h-3.5" />
          <span>{{ isDownloading ? 'Mengunduh...' : 'Update & Restart' }}</span>
        </UiButton>
      </div>
    </template>
  </UiDialog>
</template>

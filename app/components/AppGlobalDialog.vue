<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { AlertCircle, HelpCircle, Info, Edit3, X } from 'lucide-vue-next'
import { useAppDialog } from '~/composables/useAppDialog'

const { dialog } = useAppDialog()
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => dialog.value.isOpen,
  (open) => {
    if (open && dialog.value.type === 'prompt') {
      nextTick(() => {
        inputRef.value?.focus()
        inputRef.value?.select()
      })
    }
  }
)

const handleConfirm = () => {
  if (dialog.value.type === 'prompt') {
    dialog.value.resolve(dialog.value.promptValue.trim())
  } else if (dialog.value.type === 'confirm') {
    dialog.value.resolve(true)
  } else {
    dialog.value.resolve(undefined)
  }
}

const handleCancel = () => {
  if (dialog.value.type === 'prompt') {
    dialog.value.resolve(null)
  } else if (dialog.value.type === 'confirm') {
    dialog.value.resolve(false)
  } else {
    dialog.value.resolve(undefined)
  }
}

const handleKeydown = (e: KeyboardEvent) => {
  if (!dialog.value.isOpen) return
  if (e.key === 'Escape') {
    e.preventDefault()
    handleCancel()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    handleConfirm()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="dialog.isOpen"
      class="fixed inset-0 z-[200] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none"
      @click="handleCancel"
    >
      <div
        class="bg-[#181924] border border-border/90 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-100"
        @click.stop
        @keydown="handleKeydown"
      >
        <!-- Dialog Header -->
        <div class="flex items-start gap-3">
          <div
            :class="[
              'p-2 rounded-lg flex-shrink-0 mt-0.5',
              dialog.variant === 'destructive' ? 'bg-rose-500/20 text-rose-400' :
              dialog.variant === 'warning' ? 'bg-amber-500/20 text-amber-400' : 'bg-primary/20 text-primary'
            ]"
          >
            <AlertCircle v-if="dialog.variant === 'destructive'" class="w-5 h-5" />
            <HelpCircle v-else-if="dialog.type === 'confirm'" class="w-5 h-5" />
            <Edit3 v-else-if="dialog.type === 'prompt'" class="w-5 h-5" />
            <Info v-else class="w-5 h-5" />
          </div>

          <div class="flex-1 min-w-0 pr-1">
            <h4 class="text-sm font-semibold text-foreground tracking-tight">{{ dialog.title }}</h4>
            <p class="text-xs text-muted-foreground mt-1 whitespace-pre-wrap leading-relaxed">
              {{ dialog.message }}
            </p>
          </div>

          <button
            class="p-1 hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            @click="handleCancel"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Prompt Input Field -->
        <div v-if="dialog.type === 'prompt'" class="pt-1">
          <input
            ref="inputRef"
            v-model="dialog.promptValue"
            type="text"
            :placeholder="dialog.promptPlaceholder"
            class="w-full bg-[#0d0e14] border border-border/80 focus:border-primary rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono transition-colors"
            @keydown.enter.prevent="handleConfirm"
          />
        </div>

        <!-- Dialog Action Buttons -->
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
          <button
            v-if="dialog.type !== 'alert'"
            class="px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
            @click="handleCancel"
          >
            {{ dialog.cancelText || 'Batal' }}
          </button>

          <button
            :class="[
              'px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm',
              dialog.variant === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            ]"
            @click="handleConfirm"
          >
            {{ dialog.confirmText || 'OK' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

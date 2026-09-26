<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

interface Props {
  open: boolean
  title?: string
  description?: string
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const close = () => {
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in"
        @click="close"
      />
      <!-- Modal Content -->
      <div
        :class="cn(
          'relative z-50 flex flex-col w-full max-w-lg max-h-[85vh] overflow-hidden gap-4 border border-border bg-background p-6 shadow-lg sm:rounded-lg animate-in fade-in zoom-in-95',
          props.class
        )"
      >
        <div v-if="title || description" class="flex flex-col space-y-1.5 text-center sm:text-left shrink-0">
          <h2 v-if="title" class="text-lg font-semibold leading-none tracking-tight">
            {{ title }}
          </h2>
          <p v-if="description" class="text-sm text-muted-foreground">
            {{ description }}
          </p>
        </div>
        <div class="overflow-y-auto min-h-0">
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 shrink-0">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
interface Props {
  open: boolean
  title?: string
  description?: string
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
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Backdrop -->
      <div
        class="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in"
        @click="close"
      />
      <!-- Modal Content -->
      <div
        class="relative z-50 grid w-full max-w-lg gap-4 border border-border bg-background p-6 shadow-lg sm:rounded-lg animate-in fade-in zoom-in-95"
      >
        <div v-if="title || description" class="flex flex-col space-y-1.5 text-center sm:text-left">
          <h2 v-if="title" class="text-lg font-semibold leading-none tracking-tight">
            {{ title }}
          </h2>
          <p v-if="description" class="text-sm text-muted-foreground">
            {{ description }}
          </p>
        </div>
        <div>
          <slot />
        </div>
        <div v-if="$slots.footer" class="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

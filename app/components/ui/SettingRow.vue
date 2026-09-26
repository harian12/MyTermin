<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

interface Props {
  label: string
  hint?: string
  class?: HTMLAttributes['class']
}

const props = defineProps<Props>()
</script>

<template>
  <div :class="cn('flex items-center justify-between gap-4 px-3.5 py-2.5', props.class)">
    <div class="min-w-0 space-y-1">
      <div class="flex items-center gap-1.5 text-[13px] font-medium leading-tight">
        <slot name="icon" />
        <span class="truncate">{{ props.label }}</span>
      </div>
      <p v-if="props.hint" class="text-[11px] leading-relaxed text-muted-foreground">
        {{ props.hint }}
      </p>
    </div>
    <div class="flex w-44 shrink-0 items-center justify-end gap-2">
      <slot />
    </div>
  </div>
</template>

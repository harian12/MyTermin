<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { cn } from '~/lib/utils'

interface Props {
  title: string
  description?: string
  class?: HTMLAttributes['class']
  bodyClass?: HTMLAttributes['class']
}

const props = defineProps<Props>()
</script>

<template>
  <section :class="cn('overflow-hidden rounded-lg border border-border/50 bg-muted/10', props.class)">
    <header class="flex items-start justify-between gap-3 border-b border-border/40 px-3.5 py-2.5">
      <div class="min-w-0 space-y-1">
        <h3 class="flex items-center gap-1.5 text-xs font-semibold leading-tight">
          <slot name="icon" />
          <span>{{ props.title }}</span>
        </h3>
        <p v-if="props.description" class="text-[11px] leading-relaxed text-muted-foreground">
          {{ props.description }}
        </p>
      </div>
      <div v-if="$slots.action" class="flex shrink-0 items-center gap-1.5">
        <slot name="action" />
      </div>
    </header>
    <div :class="cn('divide-y divide-border/40', props.bodyClass)">
      <slot />
    </div>
  </section>
</template>

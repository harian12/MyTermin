<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { cn } from '~/lib/utils'

interface Props {
  modelValue?: string | number
  disabled?: boolean
  class?: HTMLAttributes['class']
  id?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', payload: string): void
}>()

const handleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement
  emit('update:modelValue', target.value)
}
</script>

<template>
  <div class="relative w-full">
    <select
      :id="id"
      :value="modelValue"
      :disabled="disabled"
      :class="cn(
        'flex h-9 w-full appearance-none items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground cursor-pointer pr-8',
        props.class
      )"
      @change="handleChange"
    >
      <slot />
    </select>
    <ChevronDown class="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 opacity-50 text-foreground" />
  </div>
</template>

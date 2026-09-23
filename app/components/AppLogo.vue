<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    size?: number | string
    class?: string
  }>(),
  {
    size: 16,
    class: ''
  }
)
</script>

<template>
  <img
    src="/logo.svg"
    :width="size"
    :height="size"
    :class="props.class"
    alt="MyTermin Logo"
  />
</template>

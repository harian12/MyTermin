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
  <svg
    :width="size"
    :height="size"
    :class="props.class"
    viewBox="0 0 512 512"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- Outer Rounded Container -->
    <rect x="20" y="20" width="472" height="472" rx="100" fill="#18181b" stroke="#ffffff" stroke-opacity="0.3" stroke-width="16" />

    <!-- Top-Left: CLI Terminal Tile -->
    <rect x="52" y="52" width="180" height="180" rx="36" fill="#27272a" stroke="#ffffff" stroke-opacity="0.8" stroke-width="12" />
    <!-- Prompt > _ -->
    <path d="M 90 115 L 132 142 L 90 169" fill="none" stroke="#ffffff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" />
    <line x1="150" y1="169" x2="194" y2="169" stroke="#ffffff" stroke-width="18" stroke-linecap="round" />

    <!-- Top-Right: AI Sparkle Tile -->
    <rect x="280" y="52" width="180" height="180" rx="36" fill="#27272a" stroke="#ffffff" stroke-opacity="0.8" stroke-width="12" />
    <!-- Sparkle Shape -->
    <path d="M 370 85 Q 370 142 425 142 Q 370 142 370 199 Q 370 142 315 142 Q 370 142 370 85 Z" fill="#ffffff" />
    <circle cx="370" cy="142" r="10" fill="#18181b" />

    <!-- Bottom-Left: Code Bracket Tile -->
    <rect x="52" y="280" width="180" height="180" rx="36" fill="#27272a" stroke="#ffffff" stroke-opacity="0.8" stroke-width="12" />
    <!-- Code Bracket < / > -->
    <path d="M 100 342 L 76 370 L 100 398" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M 184 342 L 208 370 L 184 398" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
    <line x1="156" y1="334" x2="128" y2="406" stroke="#ffffff" stroke-width="14" stroke-linecap="round" />

    <!-- Bottom-Right: Fast Runner Tile -->
    <rect x="280" y="280" width="180" height="180" rx="36" fill="#27272a" stroke="#ffffff" stroke-opacity="0.8" stroke-width="12" />
    <!-- Lightning Bolt -->
    <path d="M 390 322 L 340 376 L 372 376 L 356 428 L 412 366 L 378 366 Z" fill="#ffffff" />

    <!-- Central Nexus Badge -->
    <circle cx="256" cy="256" r="42" fill="#18181b" stroke="#ffffff" stroke-width="12" />
    <circle cx="256" cy="256" r="18" fill="#ffffff" />
  </svg>
</template>

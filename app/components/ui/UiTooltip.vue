<script setup lang="ts">
import { type HTMLAttributes, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { cn } from '~/lib/utils'
import { activeTooltipId } from '~/composables/useTooltipStack'

type Side = 'top' | 'bottom' | 'left' | 'right'

// State "tooltip mana yang aktif" hidup di useTooltipStack, bukan di sini —
// <script setup> berjalan per-instance sehingga state lokal tidak akan dibagi.

interface Props {
  text: string
  side?: Side
  /** Jeda sebelum muncul, ms. Shortcut lama ~500ms dan terasa lambat. */
  delay?: number
  /** Jarak dari trigger, px. */
  gap?: number
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<Props>(), {
  side: 'top',
  delay: 250,
  gap: 6
})

const triggerRef = ref<HTMLElement | null>(null)
const tooltipRef = ref<HTMLElement | null>(null)
const open = ref(false)
const placement = ref<Side>(props.side)
const coords = ref({ x: 0, y: 0 })
const tooltipId = Symbol('tooltip')

let showTimer: ReturnType<typeof setTimeout> | null = null

const clearTimer = () => {
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
}

const hide = () => {
  clearTimer()
  if (activeTooltipId.value === tooltipId) activeTooltipId.value = null
  open.value = false
}

// Resolusi elemen yang dipakai sebagai acuan posisi. Span pembungkus dengan
// `display: contents` tidak punya box sendiri, jadi getBoundingClientRect-nya
// mengembalikan posisi yang salah (tooltip ikut terklem ke tepi layar).
// Dalam kasus itu jatuh ke elemen anak pertama yang benar-benar punya box.
const resolveAnchor = (): HTMLElement | null => {
  const trigger = triggerRef.value
  if (!trigger) return null
  if (trigger.getClientRects().length > 0) return trigger
  // Bisa bersarang (contents di dalam contents), jadi telusuri sampai ketemu
  // elemen yang benar-benar punya box.
  for (const el of trigger.querySelectorAll<HTMLElement>('*')) {
    if (el.getClientRects().length > 0) return el
  }
  return null
}

const updatePosition = () => {
  const trigger = resolveAnchor()
  const tooltip = tooltipRef.value
  if (!trigger || !tooltip) return

  const t = trigger.getBoundingClientRect()
  // Ukur tooltip yang sudah mounted tapi transparan supaya flip bisa dihitung.
  const w = tooltip.offsetWidth
  const h = tooltip.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  const margin = 8

  let side = props.side
  const fits: Record<Side, boolean> = {
    top: t.top - h - props.gap >= margin,
    bottom: t.bottom + h + props.gap <= vh - margin,
    left: t.left - w - props.gap >= margin,
    right: t.right + w + props.gap <= vw - margin
  }
  if (!fits[side]) {
    const opposite: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
    if (fits[opposite[side]]) side = opposite[side]
    else if (side === 'top' || side === 'bottom') side = t.top < vh / 2 ? 'bottom' : 'top'
    else side = t.left < vw / 2 ? 'right' : 'left'
  }
  placement.value = side

  // Sumbu mengikuti trigger, lalu di-clamp supaya tidak keluar viewport —
  // ini yang bikin native `title` kadang muncul di layar yang salah.
  const centerX = t.left + t.width / 2
  const centerY = t.top + t.height / 2
  const rawX = side === 'left' || side === 'right'
    ? side === 'left' ? t.left - w - props.gap : t.right + props.gap
    : centerX - w / 2
  const rawY = side === 'top' || side === 'bottom'
    ? side === 'top' ? t.top - h - props.gap : t.bottom + props.gap
    : centerY - h / 2

  coords.value = {
    x: Math.min(Math.max(rawX, margin), Math.max(margin, vw - w - margin)),
    y: Math.min(Math.max(rawY, margin), Math.max(margin, vh - h - margin))
  }
}

const show = () => {
  clearTimer()
  showTimer = setTimeout(() => {
    // Tooltip di dalam tooltip (mis. tombol close di dalam tab file) harus
    // menang atas tooltip induknya, kalau tidak keduanya tampil bertumpuk.
    activeTooltipId.value = tooltipId
    open.value = true
    requestAnimationFrame(updatePosition)
  }, props.delay)
}

// Tooltip lain yang sedang terbuka (induknya) langsung menutup diri.
watch(activeTooltipId, (id) => {
  if (open.value && id !== tooltipId) {
    clearTimer()
    open.value = false
  }
})

const onFocusOut = (e: FocusEvent) => {
  // focusout terpicu saat fokus pindah ke trigger anak; jangan tutup dulu
  // sebelum trigger anak sempat membuka tooltip-nya sendiri.
  const next = e.relatedTarget as Node | null
  if (next && triggerRef.value?.contains(next)) return
  hide()
}

// Scroll/resize saat tooltip terbuka: tanpa ini posisi tooltip tertinggal
// dan terlihat "nyangkut" di tempat yang sudah tidak ada trigger-nya.
const reposition = () => {
  if (open.value) updatePosition()
}

onMounted(() => {
  window.addEventListener('scroll', reposition, true)
  window.addEventListener('resize', reposition)
})

onBeforeUnmount(() => {
  clearTimer()
  if (activeTooltipId.value === tooltipId) activeTooltipId.value = null
  window.removeEventListener('scroll', reposition, true)
  window.removeEventListener('resize', reposition)
})

watch(() => props.side, (v) => (placement.value = v))
</script>

<template>
  <span
    ref="triggerRef"
    :class="cn('inline-flex', props.class)"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="onFocusOut"
  >
    <slot />
  </span>

  <Teleport to="body">
    <div
      v-if="open"
      ref="tooltipRef"
      role="tooltip"
      class="fixed z-[300] pointer-events-none max-w-[min(480px,calc(100vw-32px))] rounded-md border border-border bg-[#1b1c26] px-2 py-1 text-[11px] leading-snug text-foreground shadow-lg shadow-black/50 break-words [overflow-wrap:anywhere]"
      :style="{ left: `${coords.x}px`, top: `${coords.y}px` }"
    >
      {{ props.text }}
    </div>
  </Teleport>
</template>

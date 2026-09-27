import { shallowRef } from 'vue'

// Harus di module terpisah, bukan di dalam <script setup> UiTooltip: kode
// top-level <script setup> dieksekusi per-instance, jadi state yang Kuwaitkan
// di sana tidak pernah dibagi antar tooltip. Akibatnya tooltip anak tidak
// pernah menutup tooltip induknya dan keduanya tampil bertumpuk.
export const activeTooltipId = shallowRef<symbol | null>(null)

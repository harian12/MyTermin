<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  Radio,
  RotateCcw,
  X,
  Search,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Cpu,
  Activity,
  Check
} from 'lucide-vue-next'
import { usePortManager } from '~/composables/usePortManager'
import { useAppDialog } from '~/composables/useAppDialog'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const {
  portsList,
  isLoading,
  isKilling,
  errorMsg,
  fetchPorts,
  killProcess,
  openPortUrl,
  startPolling,
  stopPolling
} = usePortManager()

const { showAppConfirm, showAppAlert } = useAppDialog()

const searchQuery = ref('')
const killingPid = ref<number | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) {
      startPolling(3000)
    } else {
      stopPolling()
    }
  }
)

onBeforeUnmount(() => {
  stopPolling()
})

const filteredPorts = computed(() => {
  if (!searchQuery.value.trim()) return portsList.value
  const q = searchQuery.value.toLowerCase().trim()
  return portsList.value.filter(
    (p) =>
      p.port.toString().includes(q) ||
      p.process_name.toLowerCase().includes(q) ||
      p.pid.toString().includes(q) ||
      p.local_address.toLowerCase().includes(q)
  )
})

const handleKillProcess = async (port: number, pid: number, procName: string) => {
  const confirmed = await showAppConfirm(
    `Apakah Anda yakin ingin menghentikan proses "${procName}" (PID: ${pid}) yang sedang menggunakan Port ${port}?`,
    'Kill Process Port',
    'destructive',
    'Hentikan Proses'
  )
  if (!confirmed) return

  killingPid.value = pid
  const success = await killProcess(pid)
  killingPid.value = null

  if (success) {
    await showAppAlert(`Proses ${procName} (PID: ${pid}) berhasil dihentikan. Port ${port} sekarang bebas.`, 'Proses Dihentikan')
  } else {
    await showAppAlert(`Gagal menghentikan proses ${procName} (PID: ${pid}).`, 'Error')
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 font-sans select-none"
      @click="emit('update:open', false)"
    >
      <div
        class="bg-[#12131a] border border-border w-full max-w-3xl h-[75vh] rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-100"
        @click.stop
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-border/80 bg-[#161722] flex-shrink-0">
          <div class="flex items-center gap-3">
            <div class="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Radio class="w-4 h-4" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold text-foreground">Port & Process Manager</h2>
                <span class="px-2 py-0.5 text-[10px] font-mono rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {{ portsList.length }} Listening
                </span>
              </div>
              <p class="text-[11px] text-muted-foreground">
                Pantau port lokal aktif dan hentikan proses yang menabrak port.
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <!-- Search / Filter -->
            <div class="relative">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Cari port, PID, nama..."
                class="bg-[#0d0e14] border border-border focus:border-primary rounded-lg pl-7 pr-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono w-44 sm:w-56 transition-colors"
              />
              <Search class="w-3.5 h-3.5 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <!-- Refresh Button -->
            <button
              class="p-1.5 rounded-lg border border-border/80 hover:bg-[#1f202e] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Refresh Port Aktif"
              @click="fetchPorts"
            >
              <RotateCcw :class="['w-4 h-4', isLoading ? 'animate-spin text-primary' : '']" />
            </button>

            <!-- Close Button -->
            <button
              class="p-1.5 rounded-lg border border-border/80 hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors cursor-pointer ml-1"
              @click="emit('update:open', false)"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Port Table Container -->
        <div class="flex-1 flex flex-col overflow-hidden min-h-0 bg-[#0c0d12]">
          <!-- Table Header -->
          <div class="flex items-center border-b border-border/60 bg-[#14151f] px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-shrink-0">
            <div class="w-24 font-mono">Port</div>
            <div class="w-20">Protocol</div>
            <div class="flex-1 min-w-[150px] px-2">Process Name</div>
            <div class="w-24 px-2 font-mono">PID</div>
            <div class="w-32 px-2 hidden sm:block font-mono text-muted-foreground/80">Local Address</div>
            <div class="w-28 text-right">Aksi</div>
          </div>

          <!-- Port List -->
          <div class="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
            <div v-if="filteredPorts.length === 0" class="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <Radio class="w-8 h-8 opacity-40" />
              <span class="text-xs">{{ searchQuery ? 'Tidak ada port yang cocok dengan pencarian.' : 'Tidak ada port TCP aktif yang terdeteksi.' }}</span>
            </div>

            <div
              v-for="item in filteredPorts"
              :key="`${item.protocol}-${item.port}-${item.pid}`"
              class="flex items-center justify-between px-3 py-2 rounded-lg bg-[#14151f] hover:bg-[#181924] border border-border/40 text-xs transition-colors group select-none font-mono"
            >
              <!-- Port Badge -->
              <div class="w-24 flex items-center gap-1.5">
                <span class="font-bold text-sm text-emerald-400 font-mono">{{ item.port }}</span>
                <!-- Quick Browser Link Button -->
                <button
                  class="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Buka http://localhost:${item.port} di browser"
                  @click="openPortUrl(item.port)"
                >
                  <ExternalLink class="w-3 h-3 text-muted-foreground hover:text-primary" />
                </button>
              </div>

              <!-- Protocol -->
              <div class="w-20 text-[11px] text-muted-foreground font-semibold">
                {{ item.protocol }}
              </div>

              <!-- Process Name -->
              <div class="flex-1 min-w-[150px] px-2 flex items-center gap-2 truncate">
                <Cpu class="w-3.5 h-3.5 text-primary/80 flex-shrink-0" />
                <span class="font-sans font-medium text-foreground truncate" :title="item.process_name">
                  {{ item.process_name }}
                </span>
              </div>

              <!-- PID -->
              <div class="w-24 px-2 text-muted-foreground text-[11px]">
                {{ item.pid }}
              </div>

              <!-- Local Address -->
              <div class="w-32 px-2 hidden sm:block text-muted-foreground/60 text-[11px] truncate" :title="item.local_address">
                {{ item.local_address }}
              </div>

              <!-- Actions: Kill Process -->
              <div class="w-28 text-right flex items-center justify-end gap-1.5">
                <button
                  :disabled="killingPid === item.pid"
                  class="px-2.5 py-1 rounded-md bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-[10px] font-medium flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40"
                  title="Hentikan proses beserta seluruh process tree-nya (Kill PID /T)"
                  @click="handleKillProcess(item.port, item.pid, item.process_name)"
                >
                  <RotateCcw v-if="killingPid === item.pid" class="w-3 h-3 animate-spin" />
                  <Trash2 v-else class="w-3 h-3" />
                  <span>Kill Tree</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

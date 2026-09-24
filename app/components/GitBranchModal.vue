<script setup lang="ts">
import { ref } from 'vue'
import { GitBranch, X, Plus } from 'lucide-vue-next'
import { useProjectExplorer } from '~/composables/useProjectExplorer'

interface Props {
  open: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const { gitBranch, gitBranchesList, fetchBranches, switchBranch, createBranch } = useProjectExplorer()

const newBranchName = ref('')
const isCreatingBranch = ref(false)

const handleSwitchBranch = async (branchName: string) => {
  emit('update:open', false)
  await switchBranch(branchName)
}

const handleCreateBranch = async () => {
  if (!newBranchName.value.trim() || isCreatingBranch.value) return
  isCreatingBranch.value = true
  try {
    const ok = await createBranch(newBranchName.value.trim())
    if (ok) {
      newBranchName.value = ''
      emit('update:open', false)
    }
  } finally {
    isCreatingBranch.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[120] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 font-sans select-none"
      @click="emit('update:open', false)"
    >
      <div
        class="bg-[#181924] border border-border rounded-xl p-4 w-full max-w-md shadow-2xl space-y-3 animate-in zoom-in-95 duration-100"
        @click.stop
      >
        <div class="flex items-center justify-between border-b border-border/50 pb-2.5">
          <div class="flex items-center gap-2 text-xs font-semibold text-foreground">
            <GitBranch class="w-4 h-4 text-primary" />
            <span>Pilih atau Buat Branch</span>
          </div>
          <button
            class="p-1 hover:bg-white/10 rounded-md text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            @click="emit('update:open', false)"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Create New Branch Form -->
        <div class="flex items-center gap-2">
          <input
            v-model="newBranchName"
            type="text"
            placeholder="Nama branch baru..."
            class="flex-1 min-w-0 bg-[#0d0e14] border border-border/80 focus:border-primary rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono transition-colors"
            @keydown.enter="handleCreateBranch"
          />
          <button
            :disabled="!newBranchName.trim() || isCreatingBranch"
            class="px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs rounded-lg font-medium transition-colors disabled:opacity-40 flex-shrink-0 whitespace-nowrap shadow-sm cursor-pointer"
            @click="handleCreateBranch"
          >
            {{ isCreatingBranch ? 'Membuat...' : 'Buat' }}
          </button>
        </div>

        <!-- Branch List Header -->
        <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pt-1">
          Daftar Branch ({{ gitBranchesList.length }})
        </div>

        <!-- Branch List -->
        <div class="space-y-1 max-h-56 overflow-y-auto font-mono text-xs pr-0.5">
          <div
            v-for="b in gitBranchesList"
            :key="b"
            :class="[
              'flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors select-none',
              b === gitBranch
                ? 'bg-primary/20 text-foreground border border-primary/40 font-medium'
                : 'hover:bg-[#14151f] text-muted-foreground hover:text-foreground border border-transparent'
            ]"
            @click="handleSwitchBranch(b)"
          >
            <div class="flex items-center gap-2 min-w-0 flex-1 pr-2">
              <GitBranch :class="['w-3.5 h-3.5 flex-shrink-0', b === gitBranch ? 'text-primary' : 'text-muted-foreground']" />
              <span class="truncate font-mono text-[11px]">{{ b }}</span>
            </div>
            <span
              v-if="b === gitBranch"
              class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary flex-shrink-0 whitespace-nowrap font-mono"
            >
              Active
            </span>
          </div>

          <div v-if="gitBranchesList.length === 0" class="p-4 text-center text-xs text-muted-foreground">
            Tidak ada branch ditemukan
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

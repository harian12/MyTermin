<script setup lang="ts">
import { Play, RefreshCw, ListTodo, CircleDot, AlertCircle } from 'lucide-vue-next'
import type { TaskDefinition } from '~/types/terminal'

interface Props {
  open: boolean
  projectFolder?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:open', val: boolean): void
}>()

const { tasks, isLoading, lastError, groupedTasks, loadTasks, runTask } = useTaskRunner()
const { saveNotification } = useWorkspaceStore()
const { info, error: logError } = useDiagnostics()

const busyLabel = ref<string | null>(null)

watch(
  () => props.projectFolder,
  (folder) => {
    if (props.open && folder) loadTasks(folder)
  },
  { immediate: true }
)

watch(
  () => props.open,
  (open) => {
    if (open && props.projectFolder) loadTasks(props.projectFolder, true)
  }
)

const refresh = async () => {
  if (!props.projectFolder) return
  await loadTasks(props.projectFolder, true)
}

const run = async (task: TaskDefinition) => {
  busyLabel.value = task.label
  const result = await runTask(task)
  busyLabel.value = null
  if (result.ok) {
    saveNotification.value = `Task "${task.label}" dijalankan di terminal aktif`
    setTimeout(() => (saveNotification.value = null), 2000)
    info('task-runner', `Menjalankan ${task.command}`)
  } else {
    logError('task-runner', `${task.command}: ${result.error}`)
  }
}
</script>

<template>
  <div
    v-if="open"
    class="flex w-64 flex-shrink-0 flex-col border-l border-border/60 bg-[#0f1017]"
  >
    <div class="flex items-center justify-between border-b border-border/50 px-3 py-2">
      <div class="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <ListTodo class="h-3.5 w-3.5 text-amber-400" />
        <span>Tasks</span>
        <span v-if="tasks.length" class="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
          {{ tasks.length }}
        </span>
      </div>
      <div class="flex items-center gap-0.5">
        <button
          class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Refresh task"
          @click="refresh"
        >
          <RefreshCw class="h-3 w-3" :class="{ 'animate-spin': isLoading }" />
        </button>
        <button
          class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Tutup panel (Ctrl+Shift+M)"
          @click="emit('update:open', false)"
        >
          ×
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-2">
      <p v-if="!projectFolder" class="px-2 py-6 text-center text-[11px] text-muted-foreground">
        Buka folder project dulu untuk mendeteksi task.
      </p>

      <div v-else-if="isLoading && tasks.length === 0" class="px-2 py-6 text-center text-[11px] text-muted-foreground">
        Mendeteksi task…
      </div>

      <div v-else-if="lastError" class="flex items-start gap-1.5 px-2 py-3 text-[11px] text-rose-300">
        <AlertCircle class="mt-0.5 h-3 w-3 shrink-0" />
        <span>{{ lastError }}</span>
      </div>

      <p v-else-if="tasks.length === 0" class="px-2 py-6 text-center text-[11px] text-muted-foreground">
        Tidak ada task. Tambahkan <span class="font-mono">package.json</span> scripts,
        <span class="font-mono">Makefile</span>, atau <span class="font-mono">justfile</span>.
      </p>

      <div v-else class="space-y-3">
        <div v-for="[source, items] in groupedTasks" :key="source">
          <p class="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {{ source }}
          </p>
          <div class="space-y-0.5">
            <button
              v-for="task in items"
              :key="`${source}-${task.label}`"
              :disabled="busyLabel !== null"
              class="group flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-[11px] transition-colors hover:bg-muted disabled:opacity-50"
              :title="`${task.command}${task.is_watch ? ' (task berjalan terus)' : ''}`"
              @click="run(task)"
            >
              <Play class="h-3 w-3 shrink-0 text-emerald-400 opacity-70 group-hover:opacity-100" />
              <span class="min-w-0 flex-1 truncate text-foreground/90">{{ task.label }}</span>
              <CircleDot
                v-if="task.is_watch"
                class="h-2.5 w-2.5 shrink-0 text-amber-400"
                title="Task berjalan terus (watch/dev)"
              />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="border-t border-border/50 px-3 py-1.5 text-[10px] text-muted-foreground">
      Klik task untuk menjalankannya di terminal aktif
    </div>
  </div>
</template>

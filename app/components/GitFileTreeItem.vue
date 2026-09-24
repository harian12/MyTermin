<script setup lang="ts">
import { ref } from 'vue'
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  RotateCcw,
  Trash2,
  FileCode,
  FileText,
  FileJson,
  FileSpreadsheet,
  File,
  Image as ImageIcon
} from 'lucide-vue-next'

export interface GitTreeNode {
  name: string
  path: string
  isDir: boolean
  status?: string
  isStaged?: boolean
  isUntracked?: boolean
  children?: GitTreeNode[]
}

interface Props {
  node: GitTreeNode
  depth?: number
  mode: 'staged' | 'unstaged'
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0
})

const emit = defineEmits<{
  (e: 'open-diff', path: string): void
  (e: 'stage', path: string): void
  (e: 'unstage', path: string): void
  (e: 'discard', payload: { path: string; isUntracked: boolean }): void
  (e: 'stage-folder', files: string[]): void
  (e: 'unstage-folder', files: string[]): void
  (e: 'discard-folder', payload: { folderName: string; files: { path: string; isUntracked: boolean }[] }): void
}>()

// Collect all leaf files inside folder node
const collectFolderFiles = (treeNode: GitTreeNode): { path: string; isUntracked: boolean }[] => {
  const result: { path: string; isUntracked: boolean }[] = []
  const traverse = (item: GitTreeNode) => {
    if (item.isDir) {
      if (item.children) {
        item.children.forEach(traverse)
      }
    } else {
      result.push({
        path: item.path,
        isUntracked: Boolean(item.isUntracked)
      })
    }
  }
  traverse(treeNode)
  return result
}

const handleFolderStage = () => {
  const files = collectFolderFiles(props.node).map(f => f.path)
  if (files.length > 0) {
    emit('stage-folder', files)
  }
}

const handleFolderUnstage = () => {
  const files = collectFolderFiles(props.node).map(f => f.path)
  if (files.length > 0) {
    emit('unstage-folder', files)
  }
}

const handleFolderDiscard = () => {
  const files = collectFolderFiles(props.node)
  if (files.length > 0) {
    emit('discard-folder', {
      folderName: props.node.name,
      files
    })
  }
}

const isExpanded = ref(true)

const toggleExpand = () => {
  if (props.node.isDir) {
    isExpanded.value = !isExpanded.value
  }
}

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'vue':
    case 'rs':
    case 'go':
    case 'py':
    case 'php':
    case 'java':
    case 'c':
    case 'cpp':
    case 'cs':
    case 'html':
    case 'css':
    case 'scss':
      return { icon: FileCode, color: 'text-blue-400' }
    case 'json':
      return { icon: FileJson, color: 'text-amber-400' }
    case 'md':
    case 'txt':
    case 'log':
      return { icon: FileText, color: 'text-emerald-400' }
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'ico':
      return { icon: ImageIcon, color: 'text-purple-400' }
    case 'csv':
    case 'xlsx':
      return { icon: FileSpreadsheet, color: 'text-green-400' }
    default:
      return { icon: File, color: 'text-muted-foreground' }
  }
}
</script>

<template>
  <div class="select-none font-mono text-xs">
    <!-- Folder Node -->
    <div
      v-if="node.isDir"
      class="group flex items-center justify-between py-1 px-1.5 rounded hover:bg-[#181924] cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
      :style="{ paddingLeft: `${depth * 12 + 6}px` }"
      @click="toggleExpand"
    >
      <div class="flex items-center gap-1.5 min-w-0 flex-1">
        <component
          :is="isExpanded ? ChevronDown : ChevronRight"
          class="w-3 h-3 text-muted-foreground/70 flex-shrink-0"
        />
        <component
          :is="isExpanded ? FolderOpen : Folder"
          class="w-3.5 h-3.5 text-primary/80 flex-shrink-0"
        />
        <span class="truncate text-[11px] font-medium text-foreground/90">{{ node.name }}</span>
      </div>

      <!-- Folder Hover Actions -->
      <div class="hidden group-hover:flex items-center gap-1 flex-shrink-0">
        <!-- Actions for Staged Folder -->
        <button
          v-if="mode === 'staged'"
          class="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Unstage Seluruh Folder (-)"
          @click.stop="handleFolderUnstage"
        >
          <Minus class="w-3 h-3" />
        </button>

        <!-- Actions for Unstaged Folder -->
        <template v-else>
          <button
            class="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            title="Stage Seluruh Folder (+)"
            @click.stop="handleFolderStage"
          >
            <Plus class="w-3 h-3" />
          </button>
          <button
            class="p-0.5 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            title="Discard Semua Perubahan di Folder Ini"
            @click.stop="handleFolderDiscard"
          >
            <RotateCcw class="w-3 h-3" />
          </button>
        </template>
      </div>
    </div>

    <!-- File Node -->
    <div
      v-else
      class="group flex items-center justify-between py-1 px-1.5 rounded hover:bg-[#181924] cursor-pointer transition-colors"
      :style="{ paddingLeft: `${depth * 12 + 16}px` }"
      :title="`Klik untuk Diff: ${node.path}`"
      @click="emit('open-diff', node.path)"
    >
      <div class="flex items-center gap-1.5 min-w-0 flex-1">
        <component
          :is="getFileIcon(node.name).icon"
          :class="['w-3.5 h-3.5 flex-shrink-0', getFileIcon(node.name).color]"
        />
        <span
          class="truncate text-[11px]"
          :class="node.isUntracked ? 'text-emerald-400' : 'text-foreground'"
        >
          {{ node.name }}
        </span>
      </div>

      <!-- Status Badge & Action Buttons -->
      <div class="relative flex items-center justify-end min-w-[24px] flex-shrink-0">
        <!-- Badge Status (Shown by default, hidden when row is hovered) -->
        <span
          v-if="node.isStaged"
          class="text-[9px] font-bold px-1 rounded bg-green-500/20 text-green-400 group-hover:hidden"
        >
          {{ node.status }}
        </span>
        <span
          v-else-if="node.isUntracked"
          class="text-[9px] font-bold px-1 rounded bg-emerald-400/20 text-emerald-400 group-hover:hidden"
        >
          U
        </span>
        <span
          v-else
          class="text-[9px] font-bold px-1 rounded bg-amber-400/20 text-amber-400 group-hover:hidden"
        >
          {{ node.status }}
        </span>

        <!-- Actions (Hidden by default, shown on group-hover) -->
        <div class="hidden group-hover:flex items-center gap-1">
          <!-- Actions for Staged -->
          <button
            v-if="node.isStaged"
            class="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Unstage File (-)"
            @click.stop="emit('unstage', node.path)"
          >
            <Minus class="w-3 h-3" />
          </button>

          <!-- Actions for Unstaged / Untracked -->
          <template v-else>
            <button
              class="p-0.5 hover:bg-accent rounded text-muted-foreground hover:text-primary transition-colors cursor-pointer"
              title="Stage File (+)"
              @click.stop="emit('stage', node.path)"
            >
              <Plus class="w-3 h-3" />
            </button>
            <button
              v-if="!node.isUntracked"
              class="p-0.5 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              title="Discard Perubahan"
              @click.stop="emit('discard', { path: node.path, isUntracked: false })"
            >
              <RotateCcw class="w-3 h-3" />
            </button>
            <button
              v-else
              class="p-0.5 hover:bg-destructive/20 rounded text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
              title="Hapus File Untracked"
              @click.stop="emit('discard', { path: node.path, isUntracked: true })"
            >
              <Trash2 class="w-3 h-3" />
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- Recursive Children -->
    <div v-if="node.isDir && isExpanded && node.children && node.children.length > 0">
      <GitFileTreeItem
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :mode="mode"
        @open-diff="emit('open-diff', $event)"
        @stage="emit('stage', $event)"
        @unstage="emit('unstage', $event)"
        @discard="emit('discard', $event)"
        @stage-folder="emit('stage-folder', $event)"
        @unstage-folder="emit('unstage-folder', $event)"
        @discard-folder="emit('discard-folder', $event)"
      />
    </div>
  </div>
</template>

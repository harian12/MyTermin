import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { GitBranchCompareData } from '~/types/terminal'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'
import { useProjectExplorer } from '~/composables/useProjectExplorer'

export const useBranchCompare = () => {
  const { activeWorkstation, activeTerminal } = useWorkspaceStore()
  const { gitBranch, gitBranchesList, fetchBranches } = useProjectExplorer()

  const baseBranch = ref('main')
  const compareBranch = ref('')
  const compareData = ref<GitBranchCompareData | null>(null)
  const isLoading = ref(false)
  const isMerging = ref(false)
  const errorMsg = ref<string | null>(null)

  // Side-by-side diff state
  const activeDiffFile = ref<string | null>(null)
  const baseFileContent = ref('')
  const compareFileContent = ref('')
  const isDiffLoading = ref(false)

  const getRepoRoot = () => {
    return activeWorkstation.value?.folderPath || activeTerminal.value?.cwd || ''
  }

  const runCompare = async (base?: string, target?: string) => {
    const root = getRepoRoot()
    if (!root) {
      errorMsg.value = 'Buka folder project terlebih dahulu.'
      return
    }

    if (base) baseBranch.value = base
    if (target) compareBranch.value = target

    // Default target branch to current git branch if empty
    if (!compareBranch.value) {
      compareBranch.value = gitBranch.value || 'main'
    }

    if (!baseBranch.value) {
      baseBranch.value = 'main'
    }

    isLoading.value = true
    errorMsg.value = null
    try {
      const res = await invoke<GitBranchCompareData>('git_compare_branches', {
        repoPath: root,
        baseBranch: baseBranch.value,
        compareBranch: compareBranch.value
      })
      compareData.value = res
      activeDiffFile.value = null
    } catch (e: any) {
      errorMsg.value = e?.message || String(e)
      compareData.value = null
    } finally {
      isLoading.value = false
    }
  }

  const loadFileDiff = async (filePath: string) => {
    const root = getRepoRoot()
    if (!root || !filePath) return

    activeDiffFile.value = filePath
    isDiffLoading.value = true
    try {
      const [baseText, compareText] = await Promise.all([
        invoke<string>('git_get_file_at_ref', {
          repoPath: root,
          gitRef: baseBranch.value,
          relPath: filePath
        }),
        invoke<string>('git_get_file_at_ref', {
          repoPath: root,
          gitRef: compareBranch.value,
          relPath: filePath
        })
      ])
      baseFileContent.value = baseText || ''
      compareFileContent.value = compareText || ''
    } catch (e: any) {
      console.error('Failed to load file diff:', e)
    } finally {
      isDiffLoading.value = false
    }
  }

  const mergeCompareBranch = async (): Promise<{ success: boolean; error?: string }> => {
    const root = getRepoRoot()
    if (!root || !compareBranch.value || !baseBranch.value) return { success: false, error: 'Branch tidak valid' }

    isMerging.value = true
    try {
      // Pastikan repo berada di baseBranch sebelum merge
      if (gitBranch.value !== baseBranch.value) {
        await invoke('git_switch_branch', {
          repoPath: root,
          branchName: baseBranch.value
        })
      }

      await invoke('git_merge_branch', {
        repoPath: root,
        sourceBranch: compareBranch.value
      })
      await runCompare()
      return { success: true }
    } catch (e: any) {
      const err = e?.message || String(e)
      return { success: false, error: err }
    } finally {
      isMerging.value = false
    }
  }

  return {
    baseBranch,
    compareBranch,
    compareData,
    isLoading,
    isMerging,
    errorMsg,
    activeDiffFile,
    baseFileContent,
    compareFileContent,
    isDiffLoading,
    runCompare,
    loadFileDiff,
    mergeCompareBranch
  }
}

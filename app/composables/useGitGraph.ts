import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { GitGraphNode, GitGraphVisualNode, GitCommitDetail } from '~/types/terminal'
import { useWorkspaceStore } from '~/composables/useWorkspaceStore'

const BRANCH_COLORS = [
  '#38bdf8', // sky-400
  '#818cf8', // indigo-400
  '#c084fc', // purple-400
  '#f472b6', // pink-400
  '#fb7185', // rose-400
  '#fb923c', // orange-400
  '#facc15', // amber-400
  '#4ade80', // green-400
  '#2dd4bf'  // teal-400
]

export const useGitGraph = () => {
  const { activeWorkstation, activeTerminal } = useWorkspaceStore()

  const rawNodes = ref<GitGraphNode[]>([])
  const visualNodes = ref<GitGraphVisualNode[]>([])
  const selectedCommit = ref<GitCommitDetail | null>(null)
  const isLoading = ref(false)
  const isDetailsLoading = ref(false)
  const errorMsg = ref<string | null>(null)
  const maxLanes = ref(1)

  // Ambil path repo aktif: workstation folderPath atau fallback ke CWD terminal aktif
  const getRepoRoot = () => {
    return activeWorkstation.value?.folderPath || activeTerminal.value?.cwd || ''
  }

  // Compute visual graph layout (Lanes, colors, routes)
  const computeGraphLayout = (nodes: GitGraphNode[]) => {
    const lanes: (string | null)[] = []
    const result: GitGraphVisualNode[] = []
    const rowHeight = 36
    const laneWidth = 18
    const startX = 16

    let highestLane = 0

    nodes.forEach((node, rowIdx) => {
      // 1. Find existing lane for this commit hash, or find first free lane
      let lane = lanes.indexOf(node.hash)
      if (lane === -1) {
        lane = lanes.indexOf(null)
        if (lane === -1) {
          lane = lanes.length
          lanes.push(node.hash)
        } else {
          lanes[lane] = node.hash
        }
      }

      highestLane = Math.max(highestLane, lane)
      const color = BRANCH_COLORS[lane % BRANCH_COLORS.length]
      const routes: GitGraphVisualNode['routes'] = []

      // 2. Map parent connections
      if (node.parents.length === 0) {
        // Root commit, lane is freed
        lanes[lane] = null
      } else {
        // First parent inherits current lane
        const firstParent = node.parents[0]
        lanes[lane] = firstParent

        // Additional parents (merge)
        for (let pIdx = 1; pIdx < node.parents.length; pIdx++) {
          const pHash = node.parents[pIdx]
          let pLane = lanes.indexOf(pHash)
          if (pLane === -1) {
            pLane = lanes.indexOf(null)
            if (pLane === -1) {
              pLane = lanes.length
              lanes.push(pHash)
            } else {
              lanes[pLane] = pHash
            }
          }
          highestLane = Math.max(highestLane, pLane)
        }
      }

      // Compact empty trailing lanes
      while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
        lanes.pop()
      }

      result.push({
        ...node,
        lane,
        color,
        x: startX + lane * laneWidth,
        y: rowIdx * rowHeight + rowHeight / 2,
        routes
      })
    })

    // 3. Second pass: Calculate routing lines between commit and its parent row
    const hashToRow = new Map<string, { x: number; y: number; lane: number }>()
    result.forEach((vNode) => {
      hashToRow.set(vNode.hash, { x: vNode.x, y: vNode.y, lane: vNode.lane })
    })

    result.forEach((vNode) => {
      vNode.parents.forEach((pHash) => {
        const pTarget = hashToRow.get(pHash)
        if (pTarget) {
          vNode.routes.push({
            fromLane: vNode.lane,
            toLane: pTarget.lane,
            toY: pTarget.y,
            color: vNode.color
          })
        }
      })
    })

    maxLanes.value = highestLane + 1
    visualNodes.value = result
  }

  const fetchGraph = async (limit = 120) => {
    const root = getRepoRoot()
    if (!root) {
      rawNodes.value = []
      visualNodes.value = []
      errorMsg.value = 'Buka folder project terlebih dahulu.'
      return
    }

    isLoading.value = true
    errorMsg.value = null
    try {
      const data = await invoke<GitGraphNode[]>('git_get_graph', {
        repoPath: root,
        limit
      })
      rawNodes.value = data || []
      computeGraphLayout(rawNodes.value)

      // Auto select first commit if none selected
      if (rawNodes.value.length > 0 && !selectedCommit.value) {
        selectCommit(rawNodes.value[0].hash)
      }
    } catch (e: any) {
      errorMsg.value = e?.message || String(e)
      rawNodes.value = []
      visualNodes.value = []
    } finally {
      isLoading.value = false
    }
  }

  const selectCommit = async (hash: string) => {
    const root = getRepoRoot()
    if (!root || !hash) return

    isDetailsLoading.value = true
    try {
      const detail = await invoke<GitCommitDetail>('git_get_commit_detail', {
        repoPath: root,
        commitHash: hash
      })
      selectedCommit.value = detail
    } catch (e: any) {
      console.error('Failed to get commit detail:', e)
    } finally {
      isDetailsLoading.value = false
    }
  }

  const checkoutCommit = async (target: string): Promise<boolean> => {
    const root = getRepoRoot()
    if (!root || !target) return false
    try {
      await invoke('git_checkout_commit', {
        repoPath: root,
        target
      })
      await fetchGraph()
      return true
    } catch (e: any) {
      console.error('Failed to checkout commit:', e)
      return false
    }
  }

  const revertCommit = async (commitHash: string): Promise<{ success: boolean; error?: string }> => {
    const root = getRepoRoot()
    if (!root || !commitHash) return { success: false, error: 'Path repo tidak valid' }
    try {
      await invoke('git_revert_commit', {
        repoPath: root,
        commitHash
      })
      await fetchGraph()
      return { success: true }
    } catch (e: any) {
      const err = e?.message || String(e)
      console.error('Failed to revert commit:', err)
      return { success: false, error: err }
    }
  }

  const resetToCommit = async (commitHash: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<{ success: boolean; error?: string }> => {
    const root = getRepoRoot()
    if (!root || !commitHash) return { success: false, error: 'Path repo tidak valid' }
    try {
      await invoke('git_reset_to_commit', {
        repoPath: root,
        commitHash,
        mode
      })
      await fetchGraph()
      return { success: true }
    } catch (e: any) {
      const err = e?.message || String(e)
      console.error('Failed to reset to commit:', err)
      return { success: false, error: err }
    }
  }

  return {
    rawNodes,
    visualNodes,
    selectedCommit,
    isLoading,
    isDetailsLoading,
    errorMsg,
    maxLanes,
    fetchGraph,
    selectCommit,
    checkoutCommit,
    revertCommit,
    resetToCommit
  }
}

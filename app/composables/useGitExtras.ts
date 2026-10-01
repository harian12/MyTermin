import { invoke } from '@tauri-apps/api/core'
import type { GitAheadBehind, GitStashEntry, GitWorktreeEntry } from '~/types/terminal'

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Operasi Git yang belum tersedia di useProjectExplorer: fetch, ahead/behind,
// stash, amend, cherry-pick, tag, dan worktree.
export const useGitExtras = () => {
  const { activeWorkstation, saveNotification } = useWorkspaceStore()
  const aheadBehind = useState<GitAheadBehind | null>('git-ahead-behind', () => null)
  const stashList = useState<GitStashEntry[]>('git-stash-list', () => [])
  const tagList = useState<string[]>('git-tag-list', () => [])
  const worktreeList = useState<GitWorktreeEntry[]>('git-worktree-list', () => [])
  const isBusy = useState<boolean>('git-extras-busy', () => false)
  const { refreshGitStatus } = useProjectExplorer()

  const root = () => activeWorkstation.value?.folderPath

  const run = async <T>(fn: () => Promise<T>, successMsg?: string): Promise<T | null> => {
    if (!isTauri()) return null
    isBusy.value = true
    try {
      const result = await fn()
      if (successMsg) {
        saveNotification.value = successMsg
        setTimeout(() => (saveNotification.value = null), 2200)
      }
      return result
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      saveNotification.value = `Git: ${message.split('\n')[0]}`
      setTimeout(() => (saveNotification.value = null), 4000)
      return null
    } finally {
      isBusy.value = false
    }
  }

  const fetchAll = () => {
    const repo = root()
    if (!repo) return Promise.resolve(null)
    return run(() => invoke<string>('git_fetch', { repoPath: repo }), 'Fetch selesai')
  }

  const refreshAheadBehind = async () => {
    const repo = root()
    if (!repo || !isTauri()) return null
    try {
      aheadBehind.value = await invoke<GitAheadBehind>('git_ahead_behind', { repoPath: repo })
      return aheadBehind.value
    } catch {
      aheadBehind.value = null
      return null
    }
  }

  const refreshStashList = async () => {
    const repo = root()
    if (!repo || !isTauri()) return []
    try {
      stashList.value = await invoke<GitStashEntry[]>('git_stash_list', { repoPath: repo })
      return stashList.value
    } catch {
      stashList.value = []
      return []
    }
  }

  const stashSave = (message?: string) => {
    const repo = root()
    if (!repo) return Promise.resolve(null)
    return run(
      () => invoke<string>('git_stash_save', { repoPath: repo, message: message || null }),
      'Perubahan disimpan ke stash'
    ).then(async (res) => {
      await refreshStashList()
      await refreshGitStatus()
      return res
    })
  }

  const stashApply = (selector: string, pop = false) => {
    const repo = root()
    if (!repo) return Promise.resolve(null)
    return run(
      () => invoke<string>('git_stash_apply', { repoPath: repo, selector, pop }),
      pop ? 'Stash di-pop' : 'Stash di-apply'
    ).then(async (res) => {
      await refreshStashList()
      await refreshGitStatus()
      return res
    })
  }

  const stashDrop = (selector: string) => {
    const repo = root()
    if (!repo) return Promise.resolve(null)
    return run(() => invoke<string>('git_stash_drop', { repoPath: repo, selector }), 'Stash dihapus').then(
      async (res) => {
        await refreshStashList()
        return res
      }
    )
  }

  const stashShow = (selector: string) => {
    const repo = root()
    if (!repo || !isTauri()) return Promise.resolve('')
    return invoke<string>('git_stash_show', { repoPath: repo, selector }).catch(() => '')
  }

  const amendCommit = (message?: string) => {
    const repo = root()
    if (!repo) return Promise.resolve(null)
    return run(
      () => invoke<string>('git_amend', { repoPath: repo, message: message || null }),
      'Commit terakhir di-amend'
    )
  }

  const cherryPick = (commitHash: string) => {
    const repo = root()
    if (!repo) return Promise.resolve(null)
    return run(() => invoke<string>('git_cherry_pick', { repoPath: repo, commitHash }), 'Cherry-pick selesai')
  }

  const refreshTags = async () => {
    const repo = root()
    if (!repo || !isTauri()) return []
    try {
      tagList.value = await invoke<string[]>('git_get_tags', { repoPath: repo })
      return tagList.value
    } catch {
      tagList.value = []
      return []
    }
  }

  const createTag = (name: string, message?: string) => {
    const repo = root()
    if (!repo) return Promise.resolve(null)
    return run(
      () => invoke<string>('git_create_tag', { repoPath: repo, tagName: name, message: message || null }),
      `Tag ${name} dibuat`
    ).then(async (res) => {
      await refreshTags()
      return res
    })
  }

  const refreshWorktrees = async () => {
    const repo = root()
    if (!repo || !isTauri()) return []
    try {
      worktreeList.value = await invoke<GitWorktreeEntry[]>('git_worktree_list', { repoPath: repo })
      return worktreeList.value
    } catch {
      worktreeList.value = []
      return []
    }
  }

  const addWorktree = (path: string, branch: string, newBranch = false) => {
    const repo = root()
    if (!repo) return Promise.resolve(null)
    return run(
      () => invoke<string>('git_worktree_add', { repoPath: repo, path, branch, newBranch }),
      `Worktree "${branch}" dibuat`
    ).then(async (res) => {
      await refreshWorktrees()
      await refreshGitStatus()
      return res
    })
  }

  const removeWorktree = (worktreePath: string, force = false) => {
    const repo = root()
    if (!repo) return Promise.resolve(null)
    return run(
      () => invoke<string>('git_worktree_remove', { repoPath: repo, worktreePath, force }),
      'Worktree dihapus'
    ).then(async (res) => {
      await refreshWorktrees()
      await refreshGitStatus()
      return res
    })
  }

  return {
    aheadBehind,
    stashList,
    tagList,
    worktreeList,
    isBusy,
    fetchAll,
    refreshAheadBehind,
    refreshStashList,
    stashSave,
    stashApply,
    stashDrop,
    stashShow,
    amendCommit,
    cherryPick,
    refreshTags,
    createTag,
    refreshWorktrees,
    addWorktree,
    removeWorktree
  }
}

import type { FileEntry } from '~/types/terminal'

export interface SearchResultItem {
  file_path: string
  rel_path: string
  line_number: number
  line_content: string
  col_start: number
  col_end: number
}

export interface RecentProject {
  name: string
  path: string
  lastOpened: string
}

export interface GitCommitLogItem {
  hash: string
  short_hash: string
  message: string
  author: string
  relative_time: string
}

export interface GitStatusItem {
  path: string
  name: string
  status: string
  is_staged: boolean
  is_untracked: boolean
}

export interface GitStatusOverview {
  branch: string
  staged: GitStatusItem[]
  unstaged: GitStatusItem[]
  untracked: GitStatusItem[]
}

const RECENT_PROJECTS_KEY = 'mytermin_recent_projects_v1'

export const useProjectExplorer = () => {
  const { isTauri, writePty } = useTauriPty()
  const { activeWorkstation, saveSession, updateTerminalCwd } = useWorkspaceStore()
  const { showAppAlert, showAppConfirm, showAppPrompt } = useAppDialog()

  const gitStatusMap = useState<Record<string, string>>('project-git-status-map', () => ({}))
  const gitBranch = useState<string>('project-git-branch', () => '')
  const gitOverview = useState<GitStatusOverview>('project-git-overview', () => ({
    branch: '',
    staged: [],
    unstaged: [],
    untracked: []
  }))
  const gitBranchesList = useState<string[]>('project-git-branches-list', () => [])
  const gitCommitLogs = useState<GitCommitLogItem[]>('project-git-logs', () => [])

  const projectFileList = useState<string[]>('project-all-files-list', () => [])
  const isScanningFiles = useState<boolean>('project-is-scanning-files', () => false)
  const recentProjects = useState<RecentProject[]>('project-recent-list', () => [])

  // Load Recent Projects from localStorage
  const loadRecentProjects = () => {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem(RECENT_PROJECTS_KEY)
      if (stored) {
        recentProjects.value = JSON.parse(stored)
      }
    } catch (e) {
      console.warn('Failed to load recent projects:', e)
    }
  }

  const saveRecentProject = (folderPath: string) => {
    if (!folderPath) return
    const folderName = folderPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folderPath
    const filtered = recentProjects.value.filter(
      (p) => p.path.toLowerCase() !== folderPath.toLowerCase()
    )
    const updated = [
      { name: folderName, path: folderPath, lastOpened: new Date().toISOString() },
      ...filtered
    ].slice(0, 15)

    recentProjects.value = updated
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(updated))
      } catch (e) {
        console.warn('Failed to save recent projects:', e)
      }
    }
  }

  const removeRecentProject = (folderPath: string) => {
    recentProjects.value = recentProjects.value.filter(
      (p) => p.path.toLowerCase() !== folderPath.toLowerCase()
    )
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recentProjects.value))
      } catch (e) {
        console.warn('Failed to save recent projects:', e)
      }
    }
  }

  // Native folder picker
  const pickFolder = async (): Promise<string | null> => {
    if (isTauri.value) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const folder = await invoke<string | null>('pick_folder')
        return folder
      } catch (e) {
        console.error('Failed to pick folder via Tauri:', e)
      }
    }

    const input = await showAppPrompt(
      'Masukkan absolute path folder project:',
      activeWorkstation.value.folderPath || '',
      'D:\\Projects\\MyProject',
      'Pilih Folder Project'
    )
    return input ? input.trim() : null
  }

  // Read directory contents
  const readDirectory = async (dirPath: string): Promise<FileEntry[]> => {
    if (!dirPath) return []
    if (isTauri.value) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const entries = await invoke<FileEntry[]>('read_directory', { path: dirPath })

        const root = (activeWorkstation.value.folderPath || '').replace(/\\/g, '/')
        return entries.map((entry) => {
          const entryNorm = entry.path.replace(/\\/g, '/')
          const rel = entryNorm.startsWith(root)
            ? entryNorm.substring(root.length).replace(/^\/+/, '')
            : entry.name
          return {
            ...entry,
            gitStatus: gitStatusMap.value[rel]
          }
        })
      } catch (e) {
        console.warn('read_directory error:', e)
        return []
      }
    }

    return [
      { name: 'app', path: `${dirPath}/app`, is_dir: true },
      { name: 'src-tauri', path: `${dirPath}/src-tauri`, is_dir: true },
      { name: 'package.json', path: `${dirPath}/package.json`, is_dir: false, size: 1024, gitStatus: 'M' },
      { name: 'README.md', path: `${dirPath}/README.md`, is_dir: false, size: 2048 },
      { name: 'nuxt.config.ts', path: `${dirPath}/nuxt.config.ts`, is_dir: false, size: 512 }
    ]
  }

  // Refresh Git Status & Branch & Detailed Overview
  const refreshGitStatus = async () => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) {
      gitStatusMap.value = {}
      gitBranch.value = ''
      gitOverview.value = { branch: '', staged: [], unstaged: [], untracked: [] }
      return
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const [resMap, overview] = await Promise.all([
        invoke<Record<string, string>>('get_git_status', { repoPath: root }),
        invoke<GitStatusOverview>('get_git_status_overview', { repoPath: root })
      ])
      gitStatusMap.value = resMap || {}
      if (overview) {
        gitOverview.value = overview
        gitBranch.value = overview.branch || ''
      }
    } catch (e) {
      gitStatusMap.value = {}
      gitBranch.value = ''
      gitOverview.value = { branch: '', staged: [], unstaged: [], untracked: [] }
    }
  }

  // Fetch branches list
  const fetchBranches = async (): Promise<string[]> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return []
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const list = await invoke<string[]>('git_get_branches', { repoPath: root })
      gitBranchesList.value = list || []
      return gitBranchesList.value
    } catch (e) {
      return []
    }
  }

  // Switch branch
  const switchBranch = async (branchName: string): Promise<boolean> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('git_switch_branch', { repoPath: root, branchName })
      await refreshGitStatus()
      await fetchBranches()
      return true
    } catch (e: any) {
      alert(`Gagal beralih branch: ${e?.message || e}`)
      return false
    }
  }

  // Create branch
  const createBranch = async (branchName: string): Promise<boolean> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('git_create_branch', { repoPath: root, branchName })
      await refreshGitStatus()
      await fetchBranches()
      return true
    } catch (e: any) {
      alert(`Gagal membuat branch: ${e?.message || e}`)
      return false
    }
  }

  // Fetch commit logs
  const fetchCommitLogs = async (limit = 15): Promise<GitCommitLogItem[]> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return []
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const logs = await invoke<GitCommitLogItem[]>('git_get_log', { repoPath: root, limit })
      gitCommitLogs.value = logs || []
      return gitCommitLogs.value
    } catch (e) {
      return []
    }
  }

  // Stage individual file
  const stageFile = async (relPath: string): Promise<boolean> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('git_stage', { repoPath: root, relPath })
      await refreshGitStatus()
      return true
    } catch (e) {
      return false
    }
  }

  // Unstage individual file
  const unstageFile = async (relPath: string): Promise<boolean> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('git_unstage', { repoPath: root, relPath })
      await refreshGitStatus()
      return true
    } catch (e) {
      return false
    }
  }

  // Stage all changes
  const stageAll = async (): Promise<boolean> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('git_stage_all', { repoPath: root })
      await refreshGitStatus()
      return true
    } catch (e) {
      return false
    }
  }

  // Unstage all changes
  const unstageAll = async (): Promise<boolean> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('git_unstage_all', { repoPath: root })
      await refreshGitStatus()
      return true
    } catch (e) {
      return false
    }
  }

  // Discard changes
  const discardFile = async (relPath: string, isUntracked = false): Promise<boolean> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return false
    if (!window.confirm(`Batalkan semua perubahan pada file "${relPath}"?`)) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('git_discard', { repoPath: root, relPath, isUntracked })
      await refreshGitStatus()
      await scanProjectFiles()
      return true
    } catch (e: any) {
      alert(`Gagal membatalkan perubahan: ${e?.message || e}`)
      return false
    }
  }

  // Push Git
  const pushGit = async (): Promise<{ success: boolean; output?: string; error?: string }> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return { success: false, error: 'Tauri required' }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const output = await invoke<string>('git_push', { repoPath: root })
      await refreshGitStatus()
      return { success: true, output }
    } catch (e: any) {
      return { success: false, error: e?.message || e || 'Push error' }
    }
  }

  // Pull Git
  const pullGit = async (): Promise<{ success: boolean; output?: string; error?: string }> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return { success: false, error: 'Tauri required' }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const output = await invoke<string>('git_pull', { repoPath: root })
      await refreshGitStatus()
      await scanProjectFiles()
      return { success: true, output }
    } catch (e: any) {
      return { success: false, error: e?.message || e || 'Pull error' }
    }
  }

  // Get file content at HEAD
  const getFileHead = async (relPath: string): Promise<string> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) return ''
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const content = await invoke<string>('git_get_file_head', { repoPath: root, relPath })
      return content || ''
    } catch (e) {
      return ''
    }
  }

  // Scan all project files for Quick Open (Ctrl+P)
  const scanProjectFiles = async () => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) {
      projectFileList.value = []
      return
    }

    isScanningFiles.value = true
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const files = await invoke<string[]>('list_all_files', { rootPath: root, maxFiles: 3000 })
      projectFileList.value = files || []
    } catch (e) {
      console.warn('scanProjectFiles error:', e)
      projectFileList.value = []
    } finally {
      isScanningFiles.value = false
    }
  }

  // Global search in files (Ctrl+Shift+F)
  const searchInFiles = async (
    query: string,
    matchCase = false,
    maxResults = 200
  ): Promise<SearchResultItem[]> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !query.trim() || !isTauri.value) {
      return []
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const results = await invoke<SearchResultItem[]>('search_in_files', {
        rootPath: root,
        query,
        matchCase,
        maxResults
      })
      return results || []
    } catch (e) {
      console.error('searchInFiles error:', e)
      return []
    }
  }

  // Global Replace in files
  const replaceInFiles = async (
    query: string,
    replacement: string,
    matchCase = false,
    targetFiles?: string[]
  ): Promise<{ success: boolean; count?: number; error?: string }> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !query || !isTauri.value) {
      return { success: false, error: 'Tauri atau folder root tidak tersedia' }
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const count = await invoke<number>('replace_in_files', {
        rootPath: root,
        query,
        replacement,
        matchCase,
        targetFiles
      })
      await refreshGitStatus()
      return { success: true, count }
    } catch (e: any) {
      return { success: false, error: e?.message || e || 'Gagal replace' }
    }
  }

  // Reveal in OS File Explorer
  const revealInExplorer = async (path: string): Promise<boolean> => {
    if (!path || !isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('reveal_in_explorer', { path })
      return true
    } catch (e) {
      console.error('revealInExplorer error:', e)
      return false
    }
  }

  // Create new file
  const createFile = async (filePath: string): Promise<boolean> => {
    if (!isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('create_file', { path: filePath })
      await refreshGitStatus()
      await scanProjectFiles()
      return true
    } catch (e: any) {
      alert(e?.message || e || 'Gagal membuat file')
      return false
    }
  }

  // Create new directory
  const createFolder = async (dirPath: string): Promise<boolean> => {
    if (!isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('create_dir', { path: dirPath })
      return true
    } catch (e: any) {
      alert(e?.message || e || 'Gagal membuat folder')
      return false
    }
  }

  // Rename file or folder
  const renamePath = async (oldPath: string, newPath: string): Promise<boolean> => {
    if (!isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('rename_path', { oldPath, newPath })
      await refreshGitStatus()
      await scanProjectFiles()
      return true
    } catch (e: any) {
      alert(e?.message || e || 'Gagal mengubah nama')
      return false
    }
  }

  // Delete file or folder
  const deletePath = async (targetPath: string): Promise<boolean> => {
    if (!isTauri.value) return false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('delete_path', { path: targetPath })
      await refreshGitStatus()
      await scanProjectFiles()
      return true
    } catch (e: any) {
      alert(e?.message || e || 'Gagal menghapus target')
      return false
    }
  }

  // Git Commit (git commit -m)
  const gitCommit = async (message: string): Promise<{ success: boolean; output?: string; error?: string }> => {
    const root = activeWorkstation.value.folderPath
    if (!root || !isTauri.value) {
      return { success: false, error: 'Bukan di desktop Tauri atau tidak ada folder project' }
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const output = await invoke<string>('git_commit', { repoPath: root, message })
      await refreshGitStatus()
      await fetchCommitLogs()
      return { success: true, output }
    } catch (e: any) {
      return { success: false, error: e?.message || e || 'Gagal commit' }
    }
  }

  // Changed files computed list
  const changedFilesList = computed(() => {
    const map = gitStatusMap.value
    return Object.keys(map).map((relPath) => ({
      path: relPath,
      name: relPath.split('/').pop() || relPath,
      status: map[relPath]
    }))
  })

  // Set active workstation folder + Auto-sync terminal CWD
  const setWorkstationFolder = async (folderPath: string) => {
    if (!folderPath) return
    const folderName = folderPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || folderPath
    activeWorkstation.value.folderPath = folderPath
    activeWorkstation.value.name = folderName

    for (const term of activeWorkstation.value.terminals) {
      term.cwd = folderPath
      updateTerminalCwd(term.id, folderPath)
      writePty(term.id, `cd "${folderPath}"\r`)
    }

    saveSession(false)
    saveRecentProject(folderPath)
    await refreshGitStatus()
    await fetchBranches()
    await fetchCommitLogs()
    await scanProjectFiles()
  }

  return {
    gitStatusMap,
    gitBranch,
    gitOverview,
    gitBranchesList,
    gitCommitLogs,
    changedFilesList,
    projectFileList,
    isScanningFiles,
    recentProjects,
    loadRecentProjects,
    removeRecentProject,
    pickFolder,
    readDirectory,
    refreshGitStatus,
    fetchBranches,
    switchBranch,
    createBranch,
    fetchCommitLogs,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    discardFile,
    pushGit,
    pullGit,
    getFileHead,
    scanProjectFiles,
    searchInFiles,
    replaceInFiles,
    revealInExplorer,
    createFile,
    createFolder,
    renamePath,
    deletePath,
    gitCommit,
    setWorkstationFolder
  }
}

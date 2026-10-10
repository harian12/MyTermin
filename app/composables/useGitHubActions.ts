import { computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { GitHubActionRun, GitHubActionJob, GitHubActionStep } from '~/types/terminal'

export type GitCiProvider = 'github' | 'gitlab' | 'unknown'

export interface RemoteRepoInfo {
  provider: GitCiProvider
  host: string
  owner: string
  repo: string
  projectPath: string
  encodedPath: string
  remoteUrl: string
}

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const parseGitRemote = (url: string): RemoteRepoInfo | null => {
  if (!url) return null
  const clean = url.trim()

  let host = ''
  let path = ''

  // Format SCP: git@host:group/project(.git)
  const sshScpMatch = clean.match(/^[a-zA-Z0-9_\-]+@([a-zA-Z0-9\.\-]+):(.+?)(?:\.git)?(?:\/)?$/)
  if (sshScpMatch && sshScpMatch[1] && sshScpMatch[2]) {
    host = sshScpMatch[1].toLowerCase()
    path = sshScpMatch[2].replace(/^\/+/, '')
  } else {
    // Format URL: http(s):// atau ssh://
    try {
      const normalized = clean.startsWith('ssh://') ? clean.replace('ssh://', 'http://') : clean
      const parsedUrl = new URL(normalized)
      host = parsedUrl.hostname.toLowerCase()
      path = parsedUrl.pathname.replace(/^\/+/, '').replace(/\.git\/?$/, '')
    } catch {
      return null
    }
  }

  if (!host || !path) return null

  let provider: GitCiProvider = 'unknown'
  if (host === 'github.com') {
    provider = 'github'
  } else if (host === 'gitlab.com' || host.includes('gitlab')) {
    provider = 'gitlab'
  }

  const parts = path.split('/')
  const repo = parts[parts.length - 1] || ''
  const owner = parts.slice(0, -1).join('/') || ''

  return {
    provider,
    host,
    owner,
    repo,
    projectPath: path,
    encodedPath: encodeURIComponent(path),
    remoteUrl: url
  }
}

// Kompatibilitas mundur
export const parseGitHubRemote = (url: string) => parseGitRemote(url)

let pollTimer: any = null

export const useGitHubActions = () => {
  const { activeWorkstation } = useWorkspaceStore()
  const { settings } = useSettingsStore()

  const runs = useState<GitHubActionRun[]>('github-actions-runs', () => [])
  const selectedRun = useState<GitHubActionRun | null>('github-actions-selected-run', () => null)
  const jobs = useState<GitHubActionJob[]>('github-actions-jobs', () => [])
  const isLoadingRuns = useState<boolean>('github-actions-loading-runs', () => false)
  const isLoadingJobs = useState<boolean>('github-actions-loading-jobs', () => false)
  const isActionBusy = useState<boolean>('github-actions-busy', () => false)
  const errorMsg = useState<string | null>('github-actions-error', () => null)
  const repoInfo = useState<RemoteRepoInfo | null>('github-actions-repo-info', () => null)
  const activeBranchFilter = useState<string>('github-actions-branch-filter', () => 'all')
  const isCliAvailable = useState<boolean>('github-actions-cli-avail', () => false)
  const dataSource = useState<'cli' | 'api' | null>('github-actions-data-source', () => null)

  const currentRepoPath = () => activeWorkstation.value?.folderPath || ''

  const runningCount = computed(() => {
    return runs.value.filter((r) => r.status === 'in_progress' || r.status === 'queued').length
  })

  const detectRepo = async (path?: string): Promise<RemoteRepoInfo | null> => {
    const targetPath = path || currentRepoPath()
    if (!targetPath || !isTauri()) {
      repoInfo.value = null
      return null
    }

    try {
      const url = await invoke<string>('git_get_remote_url', { repoPath: targetPath })
      const parsed = parseGitRemote(url)
      if (parsed) {
        repoInfo.value = parsed
        return repoInfo.value
      } else {
        repoInfo.value = null
        errorMsg.value = `Remote URL bukan repositori GitHub atau GitLab yang valid: ${url}`
        return null
      }
    } catch (e: any) {
      repoInfo.value = null
      errorMsg.value = `Gagal membaca remote origin: ${e?.message || e}`
      return null
    }
  }

  const checkCliAvailable = async (provider: GitCiProvider): Promise<boolean> => {
    if (!isTauri()) return false
    try {
      if (provider === 'github') {
        isCliAvailable.value = await invoke<boolean>('gh_is_available')
      } else if (provider === 'gitlab') {
        isCliAvailable.value = await invoke<boolean>('glab_is_available')
      } else {
        isCliAvailable.value = false
      }
      return isCliAvailable.value
    } catch {
      isCliAvailable.value = false
      return false
    }
  }

  const mapGitLabStatus = (st: string): { status: string; conclusion: string | null } => {
    switch (st) {
      case 'success':
        return { status: 'completed', conclusion: 'success' }
      case 'failed':
        return { status: 'completed', conclusion: 'failure' }
      case 'canceled':
      case 'cancelled':
        return { status: 'completed', conclusion: 'cancelled' }
      case 'skipped':
        return { status: 'completed', conclusion: 'skipped' }
      case 'running':
        return { status: 'in_progress', conclusion: null }
      case 'pending':
      case 'created':
      case 'preparing':
      case 'waiting_for_resource':
      case 'manual':
      case 'scheduled':
        return { status: 'queued', conclusion: null }
      default:
        return { status: st || 'unknown', conclusion: null }
    }
  }

  const fetchRuns = async (branch?: string, silent = false) => {
    const path = currentRepoPath()
    if (!path) {
      if (!silent) errorMsg.value = 'Workstation belum memilih folder proyek.'
      return
    }

    if (!silent) {
      isLoadingRuns.value = true
      errorMsg.value = null
    }

    try {
      const repo = repoInfo.value || (await detectRepo(path))
      if (!repo) {
        if (!silent) isLoadingRuns.value = false
        return
      }

      await checkCliAvailable(repo.provider)

      // ========================
      // 1. GITHUB ACTIONS FLOW
      // ========================
      if (repo.provider === 'github') {
        let cliSuccess = false
        if (isCliAvailable.value) {
          try {
            const cliRaw = await invoke<string>('gh_run_list', {
              repoPath: path,
              branch: branch && branch !== 'all' ? branch : null,
              limit: 30
            })
            const parsedList = JSON.parse(cliRaw)
            if (Array.isArray(parsedList)) {
              runs.value = parsedList.map((item: any) => ({
                id: item.databaseId || item.id,
                name: item.workflowName || item.name || 'Workflow Run',
                displayTitle: item.displayTitle || item.name || `#${item.number}`,
                headBranch: item.headBranch || '',
                headSha: item.headSha || '',
                event: item.event || '',
                status: item.status || 'unknown',
                conclusion: item.conclusion || null,
                createdAt: item.createdAt || '',
                updatedAt: item.updatedAt || '',
                url: item.url || '',
                runNumber: item.number || 0
              }))
              dataSource.value = 'cli'
              cliSuccess = true
            }
          } catch {
            cliSuccess = false
          }
        }

        if (!cliSuccess) {
          let apiUrl = `https://api.github.com/repos/${repo.projectPath}/actions/runs?per_page=30`
          if (branch && branch !== 'all') {
            apiUrl += `&branch=${encodeURIComponent(branch)}`
          }

          const headers: Record<string, string> = {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'MyTermin'
          }
          if (settings.value.githubToken && settings.value.githubToken.trim()) {
            headers['Authorization'] = `Bearer ${settings.value.githubToken.trim()}`
          }

          const res = await fetch(apiUrl, { headers })
          if (!res.ok) {
            if (res.status === 404) {
              throw new Error(`Repositori ${repo.projectPath} tidak ditemukan atau private (masukkan GitHub Token di Pengaturan).`)
            } else if (res.status === 403 || res.status === 401) {
              throw new Error(`Rate limit terlampaui atau autentikasi ditolak. Masukkan GitHub Token di Pengaturan.`)
            } else {
              throw new Error(`GitHub API HTTP ${res.status}: ${res.statusText}`)
            }
          }

          const data = await res.json()
          runs.value = (data.workflow_runs || []).map((r: any) => ({
            id: r.id,
            name: r.name || 'Workflow Run',
            displayTitle: r.display_title || r.name || `#${r.run_number}`,
            headBranch: r.head_branch || '',
            headSha: r.head_sha || '',
            event: r.event || '',
            status: r.status || 'unknown',
            conclusion: r.conclusion || null,
            createdAt: r.created_at || '',
            updatedAt: r.updated_at || '',
            url: r.html_url || '',
            runNumber: r.run_number || 0,
            actorName: r.actor?.login,
            actorAvatar: r.actor?.avatar_url
          }))
          dataSource.value = 'api'
        }
      }
      // ========================
      // 2. GITLAB CI/CD FLOW
      // ========================
      else if (repo.provider === 'gitlab') {
        let cliSuccess = false
        if (isCliAvailable.value) {
          try {
            const cliRaw = await invoke<string>('glab_pipeline_list', {
              repoPath: path,
              limit: 30
            })
            const parsedList = JSON.parse(cliRaw)
            if (Array.isArray(parsedList)) {
              runs.value = parsedList.map((item: any) => {
                const norm = mapGitLabStatus(item.status)
                return {
                  id: item.id,
                  name: `Pipeline #${item.iid || item.id}`,
                  displayTitle: `Pipeline #${item.iid || item.id} (${item.ref || 'branch'})`,
                  headBranch: item.ref || '',
                  headSha: item.sha || '',
                  event: item.source || 'pipeline',
                  status: norm.status,
                  conclusion: norm.conclusion,
                  createdAt: item.created_at || item.createdAt || '',
                  updatedAt: item.updated_at || item.updatedAt || '',
                  url: item.web_url || item.webUrl || '',
                  runNumber: item.iid || item.id
                }
              })
              dataSource.value = 'cli'
              cliSuccess = true
            }
          } catch {
            cliSuccess = false
          }
        }

        if (!cliSuccess) {
          let apiUrl = `https://${repo.host}/api/v4/projects/${repo.encodedPath}/pipelines?per_page=30`
          if (branch && branch !== 'all') {
            apiUrl += `&ref=${encodeURIComponent(branch)}`
          }

          const headers: Record<string, string> = {
            Accept: 'application/json'
          }
          if (settings.value.gitlabToken && settings.value.gitlabToken.trim()) {
            headers['PRIVATE-TOKEN'] = settings.value.gitlabToken.trim()
          }

          const res = await fetch(apiUrl, { headers })
          if (!res.ok) {
            if (res.status === 404) {
              throw new Error(`Project GitLab ${repo.projectPath} tidak ditemukan atau private (masukkan GitLab Token di Pengaturan).`)
            } else if (res.status === 401 || res.status === 403) {
              throw new Error(`Autentikasi GitLab ditolak. Masukkan GitLab Personal Access Token di Pengaturan.`)
            } else {
              throw new Error(`GitLab API HTTP ${res.status}: ${res.statusText}`)
            }
          }

          const data = await res.json()
          if (Array.isArray(data)) {
            runs.value = data.map((p: any) => {
              const norm = mapGitLabStatus(p.status)
              return {
                id: p.id,
                name: p.name || `Pipeline #${p.iid || p.id}`,
                displayTitle: `Pipeline #${p.iid || p.id} (${p.ref})`,
                headBranch: p.ref || '',
                headSha: p.sha || '',
                event: p.source || 'pipeline',
                status: norm.status,
                conclusion: norm.conclusion,
                createdAt: p.created_at || '',
                updatedAt: p.updated_at || '',
                url: p.web_url || '',
                runNumber: p.iid || p.id
              }
            })
            dataSource.value = 'api'
          }
        }
      } else {
        throw new Error(`Remote repository (${repo.host}) bukan GitHub atau GitLab.`)
      }

      // Auto-pilih run pertama atau sinkronkan run yang terpilih
      if (runs.value.length > 0 && !selectedRun.value) {
        selectRun(runs.value[0] || null, silent)
      } else if (selectedRun.value) {
        const found = runs.value.find((r) => r.id === selectedRun.value?.id)
        if (found) {
          selectedRun.value = found
        }
      }
    } catch (e: any) {
      if (!silent) {
        errorMsg.value = e?.message || String(e)
        runs.value = []
      }
    } finally {
      if (!silent) {
        isLoadingRuns.value = false
      }
    }
  }

  const selectRun = async (run: GitHubActionRun | null, silent = false) => {
    selectedRun.value = run
    if (!silent) {
      jobs.value = []
    }
    if (!run) return

    if (!silent) {
      isLoadingJobs.value = true
    }

    try {
      const path = currentRepoPath()
      const repo = repoInfo.value
      if (!repo) return

      // ========================
      // 1. GITHUB JOBS
      // ========================
      if (repo.provider === 'github') {
        let cliJobsSuccess = false
        if (dataSource.value === 'cli' && path) {
          try {
            const cliRaw = await invoke<string>('gh_run_view_jobs', {
              repoPath: path,
              runId: run.id
            })
            const parsed = JSON.parse(cliRaw)
            if (parsed && Array.isArray(parsed.jobs)) {
              jobs.value = parsed.jobs.map((j: any) => ({
                id: j.databaseId || j.id,
                name: j.name,
                status: j.status,
                conclusion: j.conclusion || null,
                startedAt: j.startedAt,
                completedAt: j.completedAt,
                url: j.url,
                steps: (j.steps || []).map((s: any, idx: number) => ({
                  name: s.name,
                  status: s.status,
                  conclusion: s.conclusion || null,
                  number: s.number || idx + 1
                }))
              }))
              cliJobsSuccess = true
            }
          } catch {
            cliJobsSuccess = false
          }
        }

        if (!cliJobsSuccess) {
          const headers: Record<string, string> = {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'MyTermin'
          }
          if (settings.value.githubToken && settings.value.githubToken.trim()) {
            headers['Authorization'] = `Bearer ${settings.value.githubToken.trim()}`
          }

          const res = await fetch(`https://api.github.com/repos/${repo.projectPath}/actions/runs/${run.id}/jobs`, {
            headers
          })
          if (res.ok) {
            const data = await res.json()
            jobs.value = (data.jobs || []).map((j: any) => ({
              id: j.id,
              name: j.name,
              status: j.status,
              conclusion: j.conclusion || null,
              startedAt: j.started_at,
              completedAt: j.completed_at,
              url: j.html_url,
              steps: (j.steps || []).map((s: any) => ({
                name: s.name,
                status: s.status,
                conclusion: s.conclusion || null,
                number: s.number
              }))
            }))
          }
        }
      }
      // ========================
      // 2. GITLAB JOBS
      // ========================
      else if (repo.provider === 'gitlab') {
        const headers: Record<string, string> = {
          Accept: 'application/json'
        }
        if (settings.value.gitlabToken && settings.value.gitlabToken.trim()) {
          headers['PRIVATE-TOKEN'] = settings.value.gitlabToken.trim()
        }

        const res = await fetch(`https://${repo.host}/api/v4/projects/${repo.encodedPath}/pipelines/${run.id}/jobs`, {
          headers
        })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data)) {
            jobs.value = data.map((j: any) => {
              const norm = mapGitLabStatus(j.status)
              return {
                id: j.id,
                name: j.stage ? `[${j.stage}] ${j.name}` : j.name,
                status: norm.status,
                conclusion: norm.conclusion,
                startedAt: j.started_at,
                completedAt: j.finished_at,
                url: j.web_url,
                steps: []
              }
            })
          }
        }
      }
    } catch {
      if (!silent) {
        jobs.value = []
      }
    } finally {
      if (!silent) {
        isLoadingJobs.value = false
      }
    }
  }

  const startPolling = (intervalMs = 6000) => {
    stopPolling()
    pollTimer = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (!currentRepoPath()) return
      await fetchRuns(activeBranchFilter.value, true)
      if (selectedRun.value && (selectedRun.value.status === 'in_progress' || selectedRun.value.status === 'queued')) {
        await selectRun(selectedRun.value, true)
      }
    }, intervalMs)
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const rerunRun = async (runId: number): Promise<boolean> => {
    isActionBusy.value = true
    const path = currentRepoPath()
    const repo = repoInfo.value
    if (!repo) {
      isActionBusy.value = false
      return false
    }

    try {
      if (repo.provider === 'github') {
        if (dataSource.value === 'cli' && path) {
          await invoke('gh_run_rerun', { repoPath: path, runId })
          await fetchRuns(activeBranchFilter.value)
          return true
        }

        if (settings.value.githubToken) {
          const res = await fetch(`https://api.github.com/repos/${repo.projectPath}/actions/runs/${runId}/rerun`, {
            method: 'POST',
            headers: {
              Accept: 'application/vnd.github+json',
              'User-Agent': 'MyTermin',
              Authorization: `Bearer ${settings.value.githubToken.trim()}`
            }
          })
          if (res.ok) {
            await fetchRuns(activeBranchFilter.value)
            return true
          }
        }
      } else if (repo.provider === 'gitlab') {
        if (dataSource.value === 'cli' && path) {
          await invoke('glab_pipeline_retry', { repoPath: path, pipelineId: runId })
          await fetchRuns(activeBranchFilter.value)
          return true
        }

        if (settings.value.gitlabToken) {
          const res = await fetch(`https://${repo.host}/api/v4/projects/${repo.encodedPath}/pipelines/${runId}/retry`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'PRIVATE-TOKEN': settings.value.gitlabToken.trim()
            }
          })
          if (res.ok) {
            await fetchRuns(activeBranchFilter.value)
            return true
          }
        }
      }
      return false
    } catch {
      return false
    } finally {
      isActionBusy.value = false
    }
  }

  const cancelRun = async (runId: number): Promise<boolean> => {
    isActionBusy.value = true
    const path = currentRepoPath()
    const repo = repoInfo.value
    if (!repo) {
      isActionBusy.value = false
      return false
    }

    try {
      if (repo.provider === 'github') {
        if (dataSource.value === 'cli' && path) {
          await invoke('gh_run_cancel', { repoPath: path, runId })
          await fetchRuns(activeBranchFilter.value)
          return true
        }

        if (settings.value.githubToken) {
          const res = await fetch(`https://api.github.com/repos/${repo.projectPath}/actions/runs/${runId}/cancel`, {
            method: 'POST',
            headers: {
              Accept: 'application/vnd.github+json',
              'User-Agent': 'MyTermin',
              Authorization: `Bearer ${settings.value.githubToken.trim()}`
            }
          })
          if (res.ok) {
            await fetchRuns(activeBranchFilter.value)
            return true
          }
        }
      } else if (repo.provider === 'gitlab') {
        if (dataSource.value === 'cli' && path) {
          await invoke('glab_pipeline_cancel', { repoPath: path, pipelineId: runId })
          await fetchRuns(activeBranchFilter.value)
          return true
        }

        if (settings.value.gitlabToken) {
          const res = await fetch(`https://${repo.host}/api/v4/projects/${repo.encodedPath}/pipelines/${runId}/cancel`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'PRIVATE-TOKEN': settings.value.gitlabToken.trim()
            }
          })
          if (res.ok) {
            await fetchRuns(activeBranchFilter.value)
            return true
          }
        }
      }
      return false
    } catch {
      return false
    } finally {
      isActionBusy.value = false
    }
  }

  const openInBrowser = async (url: string) => {
    if (!url) return
    if (isTauri()) {
      try {
        await invoke('open_url', { url })
      } catch {
        window.open(url, '_blank')
      }
    } else {
      window.open(url, '_blank')
    }
  }

  return {
    runs,
    selectedRun,
    jobs,
    isLoadingRuns,
    isLoadingJobs,
    isActionBusy,
    errorMsg,
    repoInfo,
    activeBranchFilter,
    isGhCliAvailable: isCliAvailable,
    isCliAvailable,
    dataSource,
    runningCount,
    detectRepo,
    fetchRuns,
    selectRun,
    startPolling,
    stopPolling,
    rerunRun,
    cancelRun,
    openInBrowser
  }
}

import { invoke } from '@tauri-apps/api/core'
import type { ProjectConfig, TaskDefinition, EnvEntry } from '~/types/terminal'

const CONFIG_DIR = '.mytermin'
const CONFIG_FILE = 'project.json'

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Task yang dibaca dari package.json / Makefile / justfile oleh backend Rust.
export const useTaskRunner = () => {
  const tasks = useState<TaskDefinition[]>('task-runner-tasks', () => [])
  const tasksRoot = useState<string>('task-runner-root', () => '')
  const isLoading = useState<boolean>('task-runner-loading', () => false)
  const lastError = useState<string | null>('task-runner-error', () => null)
  const { activeTerminalId, terminals } = useWorkspaceStore()
  const { writePty } = useTauriPty()

  const groupedTasks = computed(() => {
    const groups: Record<string, TaskDefinition[]> = {}
    for (const task of tasks.value) {
      const key = task.source || 'Lainnya'
      groups[key] ||= []
      groups[key]!.push(task)
    }
    return Object.entries(groups)
  })

  const loadTasks = async (root?: string, force = false) => {
    if (!root) return
    if (!force && tasksRoot.value === root && tasks.value.length > 0) return
    isLoading.value = true
    lastError.value = null
    try {
      if (!isTauri()) {
        tasks.value = []
        tasksRoot.value = root
        return
      }
      const result = await invoke<TaskDefinition[]>('discover_tasks', { rootPath: root })
      tasks.value = result || []
      tasksRoot.value = root
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      tasks.value = []
    } finally {
      isLoading.value = false
    }
  }

  // Task dikirim ke terminal aktif (bukan spawn proses terpisah) supaya
  // output-nya masuk buffer terminal dan bisa searched.
  const runTask = async (task: TaskDefinition) => {
    const termId = activeTerminalId.value || terminals.value[0]?.id
    if (!termId) return { ok: false, error: 'Tidak ada terminal aktif' }
    const command = task.command.endsWith('\r') ? task.command : `${task.command}\r`
    try {
      await writePty(termId, command)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  const runCommand = async (command: string) => {
    const termId = activeTerminalId.value || terminals.value[0]?.id
    if (!termId) return { ok: false, error: 'Tidak ada terminal aktif' }
    try {
      await writePty(termId, command.endsWith('\r') ? command : `${command}\r`)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return { tasks, tasksRoot, isLoading, lastError, groupedTasks, loadTasks, runTask, runCommand }
}

// Konfigurasi project (.mytermin/project.json) — ikut di-commit ke repo
// supaya environment kerja bisa dibagikan antar developer.
export const useProjectConfig = () => {
  const config = useState<ProjectConfig | null>('project-config', () => null)
  const configPath = useState<string>('project-config-path', () => '')
  const envEntries = useState<EnvEntry[]>('project-env-entries', () => [])
  const saveState = useState<'idle' | 'saving' | 'saved' | 'error'>('project-config-save-state', () => 'idle')

  const configDirPath = (root: string) => `${root.replace(/[\\/]+$/, '')}\\${CONFIG_DIR}`
  const fullConfigPath = (root: string) => `${configDirPath(root)}\\${CONFIG_FILE}`

  const loadConfig = async (root?: string) => {
    if (!root || !isTauri()) {
      config.value = null
      return null
    }
    const path = fullConfigPath(root)
    try {
      const raw = await invoke<string>('read_file_content', { path })
      const parsed = JSON.parse(raw) as ProjectConfig
      config.value = parsed
      configPath.value = path
      envEntries.value = Object.entries(parsed.env || {}).map(([key, value]) => ({
        key,
        value: String(value),
        isSecret: /secret|token|key|password/i.test(key)
      }))
      return parsed
    } catch {
      // Project tanpa .mytermin/project.json bukan error.
      config.value = null
      configPath.value = path
      envEntries.value = []
      return null
    }
  }

  const saveConfig = async (root: string) => {
    if (!root || !config.value || !isTauri()) return false
    saveState.value = 'saving'
    try {
      const dir = configDirPath(root)
      try {
        await invoke('create_dir', { path: dir })
      } catch {
        // Folder sudah ada.
      }
      await invoke('save_file_content', {
        path: fullConfigPath(root),
        content: `${JSON.stringify(config.value, null, 2)}\n`
      })
      configPath.value = fullConfigPath(root)
      saveState.value = 'saved'
      setTimeout(() => {
        saveState.value = 'idle'
      }, 2000)
      return true
    } catch (e) {
      saveState.value = 'error'
      console.error('Gagal menyimpan project config:', e)
      return false
    }
  }

  const setEnvValue = (key: string, value: string) => {
    const existing = envEntries.value.find(e => e.key === key)
    if (existing) {
      existing.value = value
    } else {
      envEntries.value = [...envEntries.value, { key, value, isSecret: /secret|token|key|password/i.test(key) }]
    }
  }

  const removeEnvValue = (key: string) => {
    envEntries.value = envEntries.value.filter(e => e.key !== key)
  }

  // Env yang dikirim ke PTY baru. Nilai secret ikut, tapi ditampilkan masked di UI.
  const envMap = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const entry of envEntries.value) {
      if (entry.key.trim()) out[entry.key.trim()] = entry.value
    }
    return out
  })

  // .env project dibaca agar nilainya bisa dipakai tanpa mengetik ulang.
  const loadEnvFile = async (root: string) => {
    if (!root || !isTauri()) return
    for (const candidate of ['.env', '.env.local', '.env.development']) {
      try {
        const raw = await invoke<string>('read_file_content', { path: `${root}\\${candidate}` })
        const parsed: EnvEntry[] = []
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eq = trimmed.indexOf('=')
          if (eq <= 0) continue
          const key = trimmed.slice(0, eq).trim()
          let value = trimmed.slice(eq + 1).trim()
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1)
          }
          parsed.push({ key, value, isSecret: /secret|token|key|password/i.test(key) })
        }
        if (parsed.length > 0) {
          envEntries.value = parsed
          if (config.value) config.value.envFile = candidate
          return parsed
        }
      } catch {
        // File tidak ada — coba kandidat berikutnya.
      }
    }
    return []
  }

  // Peringatan bila .env punya key sensitif yang belum masuk .gitignore.
  const checkEnvSecretExposure = async (root: string) => {
    if (!root || !isTauri()) return []
    let ignore = ''
    try {
      ignore = await invoke<string>('read_file_content', { path: `${root}\\.gitignore` })
    } catch {
      return envEntries.value.filter(e => e.isSecret).map(e => e.key)
    }
    return envEntries.value
      .filter(e => e.isSecret)
      .filter(e => !ignore.split(/\r?\n/).some(line => {
        const clean = line.trim()
        return clean.startsWith('.env') || clean.includes(`${e.key}=`) || clean === '*'
      }))
      .map(e => e.key)
  }

  const reset = () => {
    config.value = null
    configPath.value = ''
    envEntries.value = []
    saveState.value = 'idle'
  }

  return {
    config,
    configPath,
    envEntries,
    envMap,
    saveState,
    loadConfig,
    saveConfig,
    setEnvValue,
    removeEnvValue,
    loadEnvFile,
    checkEnvSecretExposure,
    reset
  }
}

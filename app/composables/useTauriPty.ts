import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ShellOption, PtyStats } from '~/types/terminal'

export const useTauriPty = () => {
  const isTauri = computed(() => {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  })

  const getAvailableShells = async (): Promise<ShellOption[]> => {
    if (!isTauri.value) {
      return [
        { name: 'PowerShell (Web Mock)', path: 'powershell.exe', icon: 'powershell' },
        { name: 'Command Prompt (Web Mock)', path: 'cmd.exe', icon: 'terminal' }
      ]
    }
    try {
      return await invoke<ShellOption[]>('get_available_shells')
    } catch (e) {
      console.error('Failed to get shells:', e)
      return [{ name: 'PowerShell', path: 'powershell.exe', icon: 'powershell' }]
    }
  }

  const getAllPtyStats = async (): Promise<Record<string, PtyStats>> => {
    if (!isTauri.value) return {}
    try {
      return await invoke<Record<string, PtyStats>>('get_all_pty_stats')
    } catch (e) {
      return {}
    }
  }

  const createPty = async (
    id: string,
    shell?: string,
    cwd?: string,
    cols: number = 80,
    rows: number = 24
  ) => {
    if (!isTauri.value) {
      console.log(`[Mock PTY] Created session ${id} with shell ${shell}`)
      return
    }
    await invoke('create_pty', { id, shell: shell || null, cwd: cwd || null, cols, rows })
  }

  const writePty = async (id: string, data: string) => {
    if (!isTauri.value) {
      return
    }
    await invoke('write_pty', { id, data })
  }

  const resizePty = async (id: string, cols: number, rows: number) => {
    if (!isTauri.value) return
    await invoke('resize_pty', { id, cols, rows })
  }

  const killPty = async (id: string) => {
    if (!isTauri.value) return
    await invoke('kill_pty', { id })
  }

  const onPtyData = async (id: string, callback: (data: string) => void): Promise<UnlistenFn> => {
    if (!isTauri.value) {
      // Mock echo for browser testing
      return () => {}
    }
    return await listen<string>(`pty-data-${id}`, (event) => {
      callback(event.payload)
    })
  }

  const onPtyExit = async (id: string, callback: () => void): Promise<UnlistenFn> => {
    if (!isTauri.value) return () => {}
    return await listen(`pty-exit-${id}`, () => {
      callback()
    })
  }

  const saveTempImage = async (bytes: number[] | Uint8Array, ext = 'png'): Promise<string> => {
    if (!isTauri.value) return ''
    try {
      const byteArray = Array.isArray(bytes) ? bytes : Array.from(bytes)
      return await invoke<string>('save_temp_image', { bytes: byteArray, ext })
    } catch (e) {
      console.error('Failed to save temp clipboard image:', e)
      return ''
    }
  }

  const saveTempFile = async (bytes: number[] | Uint8Array, filename: string): Promise<string> => {
    if (!isTauri.value) return ''
    try {
      const byteArray = Array.isArray(bytes) ? bytes : Array.from(bytes)
      return await invoke<string>('save_temp_file', { bytes: byteArray, filename })
    } catch (e) {
      console.error('Failed to save temp file:', e)
      return ''
    }
  }

  const pasteFromClipboard = async (id: string): Promise<void> => {
    if (!isTauri.value) return
    try {
      await invoke('paste_from_clipboard', { id })
    } catch (e) {
      console.error('Failed to paste from native clipboard:', e)
    }
  }

  const getClipboardFiles = async (): Promise<string[]> => {
    if (!isTauri.value) return []
    try {
      return await invoke<string[]>('get_clipboard_files')
    } catch (e) {
      return []
    }
  }

  const copyToClipboard = async (text: string): Promise<void> => {
    if (!isTauri.value) {
      await navigator.clipboard?.writeText(text)
      return
    }
    try {
      await invoke('copy_to_clipboard', { text })
    } catch (e) {
      console.error('Failed to copy to native clipboard:', e)
    }
  }

  return {
    isTauri,
    getAvailableShells,
    getAllPtyStats,
    createPty,
    writePty,
    resizePty,
    killPty,
    onPtyData,
    onPtyExit,
    saveTempImage,
    saveTempFile,
    pasteFromClipboard,
    getClipboardFiles,
    copyToClipboard
  }
}


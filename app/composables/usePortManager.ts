import { ref, onMounted, onUnmounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { ListeningPortInfo } from '~/types/terminal'
import { useTauriPty } from '~/composables/useTauriPty'

export const usePortManager = () => {
  const { isTauri } = useTauriPty()
  const portsList = ref<ListeningPortInfo[]>([])
  const isLoading = ref(false)
  const isKilling = ref(false)
  const errorMsg = ref<string | null>(null)
  let pollInterval: any = null

  const fetchPorts = async () => {
    if (!isTauri.value) {
      // Web fallback mock ports
      portsList.value = [
        { protocol: 'TCP', local_address: '127.0.0.1:3000', port: 3000, pid: 14200, process_name: 'node.exe' },
        { protocol: 'TCP', local_address: '127.0.0.1:5173', port: 5173, pid: 9840, process_name: 'vite.exe' },
        { protocol: 'TCP', local_address: '127.0.0.1:8080', port: 8080, pid: 1120, process_name: 'python.exe' }
      ]
      return
    }

    try {
      const data = await invoke<ListeningPortInfo[]>('get_listening_ports')
      portsList.value = data || []
      errorMsg.value = null
    } catch (e: any) {
      errorMsg.value = e?.message || String(e)
    } finally {
      isLoading.value = false
    }
  }

  const killProcess = async (pid: number): Promise<boolean> => {
    if (!isTauri.value) {
      portsList.value = portsList.value.filter(p => p.pid !== pid)
      return true
    }

    isKilling.value = true
    try {
      await invoke('kill_process_by_pid', { pid })
      await fetchPorts()
      return true
    } catch (e: any) {
      console.error('Failed to kill process by PID:', e)
      return false
    } finally {
      isKilling.value = false
    }
  }

  const openPortUrl = async (port: number) => {
    const url = `http://localhost:${port}`
    if (isTauri.value) {
      try {
        const { open } = await import('@tauri-apps/plugin-shell')
        await open(url)
      } catch {
        window.open(url, '_blank')
      }
    } else {
      window.open(url, '_blank')
    }
  }

  const startPolling = (intervalMs = 4000) => {
    stopPolling()
    fetchPorts()
    pollInterval = setInterval(fetchPorts, intervalMs)
  }

  const stopPolling = () => {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  return {
    portsList,
    isLoading,
    isKilling,
    errorMsg,
    fetchPorts,
    killProcess,
    openPortUrl,
    startPolling,
    stopPolling
  }
}

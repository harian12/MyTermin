import type { NotificationRule, ShellStatus } from '~/types/terminal'

interface ShellIntegrationPayload {
  state?: 'running' | 'idle'
  exit?: number
  ms?: number
  cwd?: string
  branch?: string
}

// Status command per terminal. Diisi dari OSC 1337 ; MyTermin=<base64 json>
// yang dikirim prompt PowerShell/bash, jadi xterm.js tidak perlu parses ANSI prompt.
export const useShellIntegration = () => {
  const statuses = useState<Record<string, ShellStatus>>('shell-integration-status', () => ({}))
  const outputWatchers = useState<Record<string, { buffer: string; lastHitAt: number }>>('shell-integration-watchers', () => ({}))
  const lastNotificationAt = useState<Record<string, number>>('shell-integration-last-notify', () => ({}))

  const getStatus = (termId: string): ShellStatus | null => statuses.value[termId] || null

  const markRunning = (termId: string) => {
    const prev = statuses.value[termId]
    statuses.value = {
      ...statuses.value,
      [termId]: {
        termId,
        state: 'running',
        exitCode: prev?.exitCode ?? 0,
        durationMs: 0,
        branch: prev?.branch ?? '',
        cwd: prev?.cwd ?? '',
        updatedAt: Date.now()
      }
    }
  }

  const reportIdle = (termId: string, payload: ShellIntegrationPayload) => {
    const prev = statuses.value[termId]
    statuses.value = {
      ...statuses.value,
      [termId]: {
        termId,
        state: 'idle',
        exitCode: payload.exit ?? 0,
        durationMs: payload.ms ?? 0,
        branch: payload.branch ?? prev?.branch ?? '',
        cwd: payload.cwd ?? prev?.cwd ?? '',
        updatedAt: Date.now()
      }
    }
  }

  // Kumpulkan output terakhir per terminal supaya rule keyword/regex punya bahan.
  const trackOutput = (termId: string, chunk: string) => {
    const clean = chunk.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    const prev = outputWatchers.value[termId]?.buffer || ''
    const next = (prev + clean).slice(-4000)
    outputWatchers.value = { ...outputWatchers.value, [termId]: { buffer: next, lastHitAt: Date.now() } }
  }

  const getOutputBuffer = (termId: string): string => outputWatchers.value[termId]?.buffer || ''

  const evaluateRules = (
    termId: string,
    termTitle: string,
    status: ShellStatus,
    rules: NotificationRule[],
    enabledGlobally: boolean
  ): string | null => {
    if (!enabledGlobally) return null

    const now = Date.now()
    const output = getOutputBuffer(termId)

    for (const rule of rules) {
      if (!rule.enabled) continue

      // Cooldown mencegah spam saat terminal berjalan beruntun.
      const lastHit = lastNotificationAt.value[`${rule.id}:${termId}`] || 0
      if (rule.cooldownSec > 0 && now - lastHit < rule.cooldownSec * 1000) continue

      let matched = false
      let reason = ''

      if (rule.kind === 'exit-code') {
        matched = status.state === 'idle' && status.exitCode !== 0
        reason = `exit code ${status.exitCode}`
      } else if (rule.kind === 'terminal-name') {
        const needle = rule.pattern.toLowerCase()
        matched = needle.length > 0 && termTitle.toLowerCase().includes(needle)
        reason = `terminal "${termTitle}"`
      } else if (rule.kind === 'duration') {
        const threshold = Number(rule.pattern) || 0
        matched = status.state === 'idle' && status.durationMs >= threshold * 1000
        reason = `durasi ${(status.durationMs / 1000).toFixed(1)}s`
      } else if (rule.pattern) {
        if (rule.kind === 'regex') {
          try {
            const re = new RegExp(rule.pattern, 'i')
            matched = re.test(output)
            reason = `pola /${rule.pattern}/`
          } catch {
            matched = false
          }
        } else {
          matched = output.toLowerCase().includes(rule.pattern.toLowerCase())
          reason = `"${rule.pattern}"`
        }
      }

      if (!matched) continue

      // Exit code & durasi hanya relevan kalau memang itu yang terjadi;
      // rule keyword boleh tetap berbunyi meski command sukses.
      if (rule.kind === 'keyword' || rule.kind === 'regex') {
        if (!rule.notifyOnSuccess && status.exitCode === 0 && status.durationMs < 500) continue
      }

      lastNotificationAt.value = { ...lastNotificationAt.value, [`${rule.id}:${termId}`]: now }
      return `${termTitle} — ${reason}`
    }

    return null
  }

  const parsePayload = (raw: string): ShellIntegrationPayload | null => {
    // Cari delimiter OSC 1337 ; MyTermin=<base64> lalu decode JSON-nya.
    const match = raw.match(/\x1B\]1337;MyTermin=([A-Za-z0-9+/=]+)(?:\x07|\x1B\\)/)
    if (!match || !match[1]) return null
    try {
      const json = decodeURIComponent(
        Array.from(atob(match[1]), ch =>
          `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`
        ).join('')
      )
      return JSON.parse(json) as ShellIntegrationPayload
    } catch {
      return null
    }
  }

  const clearStatus = (termId: string) => {
    if (!statuses.value[termId]) return
    const copy = { ...statuses.value }
    delete copy[termId]
    statuses.value = copy
  }

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
    const minutes = Math.floor(ms / 60_000)
    const seconds = Math.round((ms % 60_000) / 1000)
    return `${minutes}m${seconds.toString().padStart(2, '0')}s`
  }

  return {
    statuses,
    getStatus,
    markRunning,
    reportIdle,
    trackOutput,
    getOutputBuffer,
    evaluateRules,
    parsePayload,
    clearStatus,
    formatDuration
  }
}

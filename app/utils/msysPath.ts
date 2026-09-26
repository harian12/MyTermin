export function msysToWinPath(path?: string | null): string | null {
  if (!path) return null
  const match = /^\/([a-zA-Z])(?:\/(.*))?$/.exec(path.trim())
  if (!match || match[1] === undefined) return null
  const rest = match[2] ?? ''
  return `${match[1].toUpperCase()}:\\${rest.replace(/\//g, '\\')}`
}

export function parseMsysTitle(title?: string | null): string | null {
  if (!title || !title.includes('/')) return null
  const tokens = title.trim().split(/\s+/)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]
    if (!token || /^[A-Za-z]:/.test(token)) continue
    const idx = token.search(/\/[a-zA-Z](?:\/|$)/)
    if (idx < 0) continue
    if (idx > 0 && /[A-Za-z0-9_]/.test(token.charAt(idx - 1))) continue
    return tokens.slice(i).join(' ').slice(idx)
  }
  return null
}

export function matchMsysPrompt(buffer?: string | null): string | null {
  if (!buffer) return null
  const match =
    /(?<=\s)(\/[a-zA-Z](?:\/[^\r\n]*?)?)(?:[ \t]+\([^)\r\n]*\))?[ \t]*\r?\n[$#][ \t]*$/.exec(
      buffer
    )
  return match?.[1] ?? null
}

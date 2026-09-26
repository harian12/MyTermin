export function msysToWinPath(path?: string | null): string | null {
  if (!path) return null
  const match = /^\/([a-zA-Z])\/(.*)$/.exec(path.trim())
  if (!match) return null
  return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, '\\')}`
}

export function parseMsysTitle(title?: string | null): string | null {
  if (!title) return null
  const tokens = title.trim().split(/\s+/)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]
    if (/^[A-Za-z]:/.test(token)) continue
    const idx = token.search(/\/[a-zA-Z]\//)
    if (idx >= 0) return tokens.slice(i).join(' ').slice(idx)
  }
  return null
}

export function matchMsysPrompt(buffer?: string | null): string | null {
  if (!buffer) return null
  const matches = [
    ...buffer.matchAll(
      /(\/[a-zA-Z]\/[^\r\n]*?)(?:[ \t]+\([^)\r\n]*\))?[ \t]*\r?\n[$#]/g
    )
  ]
  const last = matches[matches.length - 1]
  return last ? last[1] : null
}

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
    if (/^\/[a-zA-Z]\//.test(tokens[i])) return tokens[i]
  }
  return null
}

export function matchMsysPrompt(buffer?: string | null): string | null {
  if (!buffer) return null
  const match = /(?:^|\s)(\/[a-zA-Z]\/[^\s$#]*)[$#]\s*$/.exec(buffer)
  return match ? match[1] : null
}

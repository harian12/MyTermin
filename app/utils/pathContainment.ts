export function normalizePath(p?: string | null): string {
  if (!p) return ''
  return p
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/[\\/]+/g, '\\')
    .replace(/\\+$/, '')
    .toLowerCase()
}

export function isPathInsideProject(childPath?: string | null, rootPath?: string | null): boolean {
  const root = normalizePath(rootPath)
  if (!root) return false

  const child = normalizePath(childPath)
  if (!child) return false

  if (child === root) return true

  return child.startsWith(root + '\\')
}

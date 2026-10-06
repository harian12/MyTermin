import * as monaco from 'monaco-editor'

const IGNORED_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'default', 'break', 'continue', 'import', 'export',
  'from', 'class', 'interface', 'type', 'extends', 'implements', 'public',
  'private', 'protected', 'static', 'readonly', 'async', 'await', 'try',
  'catch', 'finally', 'throw', 'new', 'this', 'super', 'typeof', 'instanceof',
  'in', 'of', 'void', 'null', 'undefined', 'true', 'false', 'string', 'number',
  'boolean', 'any', 'unknown', 'never', 'symbol', 'bigint', 'object', 'def',
  'fn', 'struct', 'enum', 'trait', 'impl', 'pub', 'mut', 'self', 'match',
  'func', 'package'
])

export function getDeclarationRegex(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(?:` +
    // JS/TS: function foo, async function foo, export function foo
    `(?:export\\s+)?(?:async\\s+)?function\\s*\\*?\\s+${escaped}\\b|` +
    // JS/TS: const foo =, let foo =, var foo =
    `(?:export\\s+)?(?:const|let|var)\\s+${escaped}\\s*[:=]|` +
    // JS/TS/PHP/Java/C++: class foo, interface foo, type foo =
    `(?:export\\s+)?(?:class|interface|enum)\\s+${escaped}\\b|` +
    `(?:export\\s+)?type\\s+${escaped}\\s*=|` +
    // Python: def foo(, class foo(
    `def\\s+${escaped}\\s*\\(|` +
    `class\\s+${escaped}\\s*[:\\(]|` +
    // Rust: fn foo(, pub fn foo(, struct foo, enum foo, trait foo
    `(?:pub(?:\\([^)]+\\))?\\s+)?(?:fn|struct|enum|trait|type)\\s+${escaped}\\b|` +
    // Go: func foo(, func (x *Y) foo(
    `func\\s+(?:\\([^)]+\\)\\s+)?${escaped}\\b|` +
    // Method shorthand: foo(args) { or foo: (args) =>
    `^\\s*(?:async\\s+)?${escaped}\\s*\\([^)]*\\)\\s*\\{?|` +
    `^\\s*${escaped}\\s*:\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>` +
    `)`,
    'i'
  )
}

export function getImportPathForSymbol(content: string, word: string): string | null {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const importRegex = new RegExp(
    `import\\s+(?:(?:\\{[^}]*?\\b${escaped}\\b[^}]*?\\})|(?:\\b${escaped}\\b))\\s+from\\s+['"]([^'"]+)['"]`,
    'i'
  )
  const match = content.match(importRegex)
  if (match && match[1]) {
    return match[1]
  }

  const requireRegex = new RegExp(
    `(?:const|let|var)\\s+(?:(?:\\{[^}]*?\\b${escaped}\\b[^}]*?\\})|(?:\\b${escaped}\\b))\\s*=\\s*require\\(['"]([^'"]+)['"]\\)`,
    'i'
  )
  const reqMatch = content.match(requireRegex)
  if (reqMatch && reqMatch[1]) {
    return reqMatch[1]
  }

  return null
}

interface SearchResultItem {
  file_path: string
  rel_path: string
  line_number: number
  line_content: string
  col_start: number
  col_end: number
}

type FileOpenerCallback = (filePath: string, line: number, col: number) => void

let activeFileOpener: FileOpenerCallback | null = null
let isOpenerRegistered = false
let isProviderRegistered = false

export function setGlobalFileOpener(opener: FileOpenerCallback) {
  activeFileOpener = opener
  if (!isOpenerRegistered && typeof monaco !== 'undefined') {
    monaco.editor.registerEditorOpener({
      openCodeEditor(_source, resource, selectionOrPosition) {
        let filePath = resource.fsPath || resource.path
        if (filePath.startsWith('/') && filePath.length >= 3 && filePath[2] === ':') {
          filePath = filePath.substring(1)
        }
        filePath = filePath.replace(/\//g, '\\')

        const line =
          (selectionOrPosition as any)?.startLineNumber ||
          (selectionOrPosition as any)?.lineNumber ||
          1
        const col =
          (selectionOrPosition as any)?.startColumn ||
          (selectionOrPosition as any)?.column ||
          1

        if (activeFileOpener) {
          activeFileOpener(filePath, line, col)
          return true
        }
        return false
      }
    })
    isOpenerRegistered = true
  }
}

export function registerUniversalDefinitionProvider(
  getProjectRoot?: () => string | undefined
) {
  if (isProviderRegistered || typeof monaco === 'undefined') return

  const definitionProvider: monaco.languages.DefinitionProvider = {
    async provideDefinition(model, position, _token) {
      const wordInfo = model.getWordAtPosition(position)
      if (!wordInfo || !wordInfo.word) return null
      const word = wordInfo.word.trim()
      if (word.length < 2 || IGNORED_KEYWORDS.has(word)) return null

      const declRegex = getDeclarationRegex(word)

      // 1. Cari deklarasi di file yang sama
      const lineCount = model.getLineCount()
      for (let i = 1; i <= lineCount; i++) {
        if (i === position.lineNumber) continue
        const lineContent = model.getLineContent(i)
        if (declRegex.test(lineContent)) {
          const col = lineContent.indexOf(word)
          return {
            uri: model.uri,
            range: new monaco.Range(
              i,
              col >= 0 ? col + 1 : 1,
              i,
              col >= 0 ? col + 1 + word.length : lineContent.length + 1
            )
          }
        }
      }

      // 2. Periksa apakah simbol di-import dari file relatif
      const currentFilePath = model.uri.fsPath || model.uri.path || ''
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      if (isTauri) {
        const fullContent = model.getValue()
        const importTarget = getImportPathForSymbol(fullContent, word)

        if (importTarget && currentFilePath) {
          try {
            const { invoke } = await import('@tauri-apps/api/core')
            const normCurrent = currentFilePath.replace(/^[/\\]+([A-Za-z]:)/, '$1').replace(/\//g, '\\')
            const lastSlash = Math.max(normCurrent.lastIndexOf('\\'), normCurrent.lastIndexOf('/'))
            const currentDir = lastSlash > 0 ? normCurrent.substring(0, lastSlash) : ''

            let candidateBase = ''
            if (importTarget.startsWith('.')) {
              candidateBase = `${currentDir}\\${importTarget.replace(/^[./\\]+/, '').replace(/\//g, '\\')}`
            } else if ((importTarget.startsWith('@/') || importTarget.startsWith('~/')) && getProjectRoot) {
              const root = getProjectRoot()
              if (root) {
                candidateBase = `${root.replace(/[/\\]+$/, '')}\\${importTarget.substring(2).replace(/\//g, '\\')}`
              }
            }

            if (candidateBase) {
              const exts = ['', '.ts', '.js', '.vue', '.tsx', '.jsx', '\\index.ts', '\\index.js']
              for (const ext of exts) {
                const targetFile = `${candidateBase}${ext}`
                try {
                  const targetContent = await invoke<string>('read_file_content', { path: targetFile })
                  if (targetContent) {
                    const lines = targetContent.split('\n')
                    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                      const lineText = lines[lineIdx]!
                      if (declRegex.test(lineText)) {
                        const col = lineText.indexOf(word)
                        return {
                          uri: monaco.Uri.file(targetFile),
                          range: new monaco.Range(
                            lineIdx + 1,
                            col >= 0 ? col + 1 : 1,
                            lineIdx + 1,
                            col >= 0 ? col + 1 + word.length : lineText.length + 1
                          )
                        }
                      }
                    }
                    // Jika deklarasi tidak ditemukan spesifik tapi file valid di-import,
                    // arahkan ke baris 1 file tersebut
                    return {
                      uri: monaco.Uri.file(targetFile),
                      range: new monaco.Range(1, 1, 1, 1)
                    }
                  }
                } catch {
                  // Lanjutkan ke ekstensi berikutnya
                }
              }
            }
          } catch {
            // Lanjutkan ke pencarian global workspace
          }
        }

        // 3. Fallback pencarian deklarasi di seluruh workspace proyek
        if (getProjectRoot) {
          const rootPath = getProjectRoot()
          if (rootPath) {
            try {
              const { invoke } = await import('@tauri-apps/api/core')
              const searchResults = await invoke<SearchResultItem[]>('search_in_files', {
                rootPath,
                query: word,
                matchCase: true,
                maxResults: 30
              })

              const matchingLocations: monaco.languages.Location[] = []

              for (const item of searchResults) {
                if (declRegex.test(item.line_content)) {
                  const col = item.col_start || item.line_content.indexOf(word)
                  matchingLocations.push({
                    uri: monaco.Uri.file(item.file_path),
                    range: new monaco.Range(
                      item.line_number,
                      col >= 0 ? col + 1 : 1,
                      item.line_number,
                      col >= 0 ? col + 1 + word.length : item.line_content.length + 1
                    )
                  })
                }
              }

              if (matchingLocations.length > 0) {
                return matchingLocations.length === 1 ? matchingLocations[0]! : matchingLocations
              }
            } catch {
              // Abaikan jika pencarian gagal
            }
          }
        }
      }

      return null
    }
  }

  const SUPPORTED_LANGUAGES = [
    'typescript',
    'javascript',
    'vue',
    'html',
    'python',
    'rust',
    'go',
    'php',
    'c',
    'cpp',
    'csharp',
    'java',
    'ruby',
    'shell',
    'powershell',
    'sql',
    'json',
    'yaml',
    'ini'
  ]

  for (const lang of SUPPORTED_LANGUAGES) {
    monaco.languages.registerDefinitionProvider(lang, definitionProvider)
  }

  isProviderRegistered = true
}

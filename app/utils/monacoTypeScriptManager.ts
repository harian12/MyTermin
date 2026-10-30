import * as monaco from 'monaco-editor'

const registeredExtraLibs = new Map<string, monaco.IDisposable>()
let isDefaultsInitialized = false
let lastLoadedProjectRoot = ''
let lastLoadedTsConfigSummary = 'default (bundler / ESNext)'

/**
 * Akses modul TypeScript Monaco yang kompatibel dengan runtime ESM maupun AMD
 */
export function getTsModule(): any {
  if (typeof monaco === 'undefined') return null
  return (monaco as any).typescript || (monaco as any).languages?.typescript || null
}

/**
 * Hapus komentar single-line //, multi-line /* *\/ dan trailing commas dari file JSONC
 */
export function stripJsonComments(json: string): string {
  return json
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1')
}

export function mapScriptTarget(target?: string): number {
  const ts = getTsModule()
  const fallback = ts?.ScriptTarget?.ESNext ?? 99
  if (!target) return fallback
  const t = target.toLowerCase()
  if (t === 'es3') return ts?.ScriptTarget?.ES3 ?? 0
  if (t === 'es5') return ts?.ScriptTarget?.ES5 ?? 1
  if (t === 'es2015' || t === 'es6') return ts?.ScriptTarget?.ES2015 ?? 2
  if (t === 'es2016') return ts?.ScriptTarget?.ES2016 ?? 3
  if (t === 'es2017') return ts?.ScriptTarget?.ES2017 ?? 4
  if (t === 'es2018') return ts?.ScriptTarget?.ES2018 ?? 5
  if (t === 'es2019') return ts?.ScriptTarget?.ES2019 ?? 6
  if (t === 'es2020') return ts?.ScriptTarget?.ES2020 ?? 7
  if (t === 'es2021') return ts?.ScriptTarget?.ES2021 ?? 8
  if (t === 'es2022') return ts?.ScriptTarget?.ES2022 ?? 9
  return fallback
}

export function mapModuleKind(mod?: string): number {
  const ts = getTsModule()
  const fallback = ts?.ModuleKind?.ESNext ?? 99
  if (!mod) return fallback
  const m = mod.toLowerCase()
  if (m === 'none') return ts?.ModuleKind?.None ?? 0
  if (m === 'commonjs') return ts?.ModuleKind?.CommonJS ?? 1
  if (m === 'amd') return ts?.ModuleKind?.AMD ?? 2
  if (m === 'umd') return ts?.ModuleKind?.UMD ?? 3
  if (m === 'system') return ts?.ModuleKind?.System ?? 4
  if (m === 'es2015' || m === 'es6') return ts?.ModuleKind?.ES2015 ?? 5
  if (m === 'es2020') return ts?.ModuleKind?.ES2020 ?? 7
  if (m === 'node16') return 100
  if (m === 'nodenext') return 199
  return fallback
}

export function mapModuleResolution(res?: string): number {
  const ts = getTsModule()
  if (!res) return 100 // Modern Bundler
  const r = res.toLowerCase()
  if (r === 'classic') return ts?.ModuleResolutionKind?.Classic ?? 1
  if (r === 'node' || r === 'nodejs' || r === 'node10') return ts?.ModuleResolutionKind?.NodeJs ?? 2
  if (r === 'node16') return 3
  if (r === 'nodenext') return 99
  if (r === 'bundler') return 100
  return 100
}

export function mapJsxEmit(jsx?: string): number {
  const ts = getTsModule()
  const fallback = ts?.JsxEmit?.ReactJSX ?? 4
  if (!jsx) return fallback
  const j = jsx.toLowerCase()
  if (j === 'preserve') return ts?.JsxEmit?.Preserve ?? 1
  if (j === 'react') return ts?.JsxEmit?.React ?? 2
  if (j === 'react-native') return ts?.JsxEmit?.ReactNative ?? 3
  if (j === 'react-jsx') return ts?.JsxEmit?.ReactJSX ?? 4
  if (j === 'react-jsxdev') return ts?.JsxEmit?.ReactJSXDev ?? 5
  return fallback
}

/**
 * Inisialisasi opsi default TypeScript dan JavaScript di Monaco
 */
export function initTypeScriptDefaults() {
  if (typeof window === 'undefined' || typeof monaco === 'undefined') return
  if (isDefaultsInitialized) return

  try {
    const ts = getTsModule()
    if (!ts || !ts.typescriptDefaults) return
    isDefaultsInitialized = true

    // Aktifkan eager model sync agar model antar file sinkron ke worker
    if (typeof ts.typescriptDefaults.setEagerModelSync === 'function') {
      ts.typescriptDefaults.setEagerModelSync(true)
    }
    if (ts.javascriptDefaults && typeof ts.javascriptDefaults.setEagerModelSync === 'function') {
      ts.javascriptDefaults.setEagerModelSync(true)
    }

    const defaultCompilerOptions: any = {
      target: mapScriptTarget('esnext'),
      module: mapModuleKind('esnext'),
      moduleResolution: 100, // Bundler
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      allowJs: true,
      checkJs: false,
      jsx: mapJsxEmit('react-jsx'),
      allowNonTsExtensions: true,
      resolveJsonModule: true,
      isolatedModules: true,
      skipLibCheck: true
    }

    if (typeof ts.typescriptDefaults.setCompilerOptions === 'function') {
      ts.typescriptDefaults.setCompilerOptions(defaultCompilerOptions)
    }
    if (ts.javascriptDefaults && typeof ts.javascriptDefaults.setCompilerOptions === 'function') {
      ts.javascriptDefaults.setCompilerOptions(defaultCompilerOptions)
    }

    // Abaikan error missing module deklarasi untuk paket eksternal agar tidak merah semua
    const defaultDiagnostics = {
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [
        2792, // Cannot find module ... Did you mean to set 'moduleResolution' to 'nodenext'...
        2307, // Cannot find module ... or its corresponding type declarations
        7016  // Could not find declaration file for module
      ]
    }

    if (typeof ts.typescriptDefaults.setDiagnosticsOptions === 'function') {
      ts.typescriptDefaults.setDiagnosticsOptions(defaultDiagnostics)
    }
    if (ts.javascriptDefaults && typeof ts.javascriptDefaults.setDiagnosticsOptions === 'function') {
      ts.javascriptDefaults.setDiagnosticsOptions(defaultDiagnostics)
    }
  } catch (err) {
    console.warn('[Monaco] initTypeScriptDefaults warning:', err)
  }
}

/**
 * Baca dan terapkan compilerOptions dari tsconfig.json / jsconfig.json pada folder proyek
 */
export async function syncTsConfig(projectRoot?: string): Promise<{ found: boolean; info: string }> {
  if (typeof window === 'undefined' || typeof monaco === 'undefined' || !projectRoot) {
    return { found: false, info: 'Folder project tidak tersedia' }
  }

  initTypeScriptDefaults()

  const ts = getTsModule()
  if (!ts || !ts.typescriptDefaults) {
    return { found: false, info: 'TypeScript language service tidak tersedia' }
  }

  const normRoot = projectRoot.replace(/[/\\]+$/, '')
  const tsConfigPaths = [
    `${normRoot}\\tsconfig.json`,
    `${normRoot}/tsconfig.json`,
    `${normRoot}\\jsconfig.json`,
    `${normRoot}/jsconfig.json`
  ]

  let content = ''
  let foundPath = ''

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    for (const p of tsConfigPaths) {
      try {
        const text = await invoke<string>('read_file_content', { path: p })
        if (text && text.trim()) {
          content = text
          foundPath = p
          break
        }
      } catch {
        // Lanjutkan
      }
    }

    if (!content) {
      lastLoadedProjectRoot = projectRoot
      lastLoadedTsConfigSummary = 'default (bundler / ESNext)'
      return { found: false, info: 'tsconfig.json tidak ditemukan, menggunakan standar bundler ESNext' }
    }

    const clean = stripJsonComments(content)
    const parsed = JSON.parse(clean)
    const rawOpts = parsed.compilerOptions || {}

    const existingOpts = ts.typescriptDefaults.getCompilerOptions ? ts.typescriptDefaults.getCompilerOptions() : {}
    const mergedOpts: any = {
      ...existingOpts,
      target: mapScriptTarget(rawOpts.target),
      module: mapModuleKind(rawOpts.module),
      moduleResolution: mapModuleResolution(rawOpts.moduleResolution),
      jsx: mapJsxEmit(rawOpts.jsx),
      allowSyntheticDefaultImports: rawOpts.allowSyntheticDefaultImports ?? true,
      esModuleInterop: rawOpts.esModuleInterop ?? true,
      allowJs: rawOpts.allowJs ?? true,
      checkJs: rawOpts.checkJs ?? false,
      resolveJsonModule: rawOpts.resolveJsonModule ?? true,
      isolatedModules: rawOpts.isolatedModules ?? true,
      skipLibCheck: rawOpts.skipLibCheck ?? true,
      strict: rawOpts.strict ?? false
    }

    if (rawOpts.baseUrl) mergedOpts.baseUrl = rawOpts.baseUrl
    if (rawOpts.paths) mergedOpts.paths = rawOpts.paths

    if (typeof ts.typescriptDefaults.setCompilerOptions === 'function') {
      ts.typescriptDefaults.setCompilerOptions(mergedOpts)
    }
    if (ts.javascriptDefaults && typeof ts.javascriptDefaults.setCompilerOptions === 'function') {
      ts.javascriptDefaults.setCompilerOptions(mergedOpts)
    }

    lastLoadedProjectRoot = projectRoot
    const resName = rawOpts.moduleResolution || 'bundler'
    const targetName = rawOpts.target || 'ESNext'
    lastLoadedTsConfigSummary = `${resName} / ${targetName}`

    const filename = foundPath.replace(/\\/g, '/').split('/').pop() || 'tsconfig.json'
    return {
      found: true,
      info: `${filename} aktif (${lastLoadedTsConfigSummary})`
    }
  } catch (err: any) {
    return {
      found: false,
      info: `Gagal mem-parsing tsconfig.json: ${err?.message || err}`
    }
  }
}

/**
 * Pindai berkas lokal yang di-import relatif dalam file dan daftarkan ke Monaco extraLibs
 */
export async function resolveFileImports(
  filePath: string,
  content: string,
  projectRoot?: string
): Promise<number> {
  if (typeof window === 'undefined' || typeof monaco === 'undefined' || !filePath || !content) {
    return 0
  }

  initTypeScriptDefaults()

  const ts = getTsModule()
  if (!ts || !ts.typescriptDefaults) return 0

  const normCurrent = filePath.replace(/^[/\\]+([A-Za-z]:)/, '$1').replace(/\//g, '\\')
  const lastSlash = Math.max(normCurrent.lastIndexOf('\\'), normCurrent.lastIndexOf('/'))
  const currentDir = lastSlash > 0 ? normCurrent.substring(0, lastSlash) : ''

  const importRegex = /(?:import\s+(?:[\w*\s{},]*\s+from\s+)?|export\s+(?:[\w*\s{},]*\s+from\s+)?|require\s*\(\s*)['"]([^'"]+)['"]/g
  const matchedImports: string[] = []
  let match: RegExpExecArray | null
  while ((match = importRegex.exec(content)) !== null) {
    if (match[1]) matchedImports.push(match[1])
  }

  if (matchedImports.length === 0) return 0

  const exts = ['', '.ts', '.tsx', '.d.ts', '.js', '.jsx', '\\index.ts', '\\index.tsx', '\\index.js']
  let resolvedCount = 0

  try {
    const { invoke } = await import('@tauri-apps/api/core')

    for (const specifier of matchedImports) {
      let candidateBase = ''
      if (specifier.startsWith('.')) {
        candidateBase = `${currentDir}\\${specifier.replace(/^[./\\]+/, '').replace(/\//g, '\\')}`
      } else if ((specifier.startsWith('@/') || specifier.startsWith('~/')) && projectRoot) {
        const root = projectRoot.replace(/[/\\]+$/, '')
        candidateBase = `${root}\\${specifier.substring(2).replace(/\//g, '\\')}`
      }

      if (!candidateBase) continue

      for (const ext of exts) {
        const fullCandidate = `${candidateBase}${ext}`
        const fileUriStr = monaco.Uri.file(fullCandidate).toString()

        if (monaco.editor.getModel(monaco.Uri.file(fullCandidate)) || registeredExtraLibs.has(fileUriStr)) {
          resolvedCount++
          break
        }

        try {
          const fileContent = await invoke<string>('read_file_content', { path: fullCandidate })
          if (fileContent !== undefined && fileContent !== null) {
            if (typeof ts.typescriptDefaults.addExtraLib === 'function') {
              const disposable = ts.typescriptDefaults.addExtraLib(fileContent, fileUriStr)
              registeredExtraLibs.set(fileUriStr, disposable)
            }

            if (ts.javascriptDefaults && typeof ts.javascriptDefaults.addExtraLib === 'function') {
              ts.javascriptDefaults.addExtraLib(fileContent, fileUriStr)
            }
            resolvedCount++
            break
          }
        } catch {
          // Lanjut ke kandidat ekstensi berikutnya
        }
      }
    }
  } catch {
    // Abaikan kegagalan invoke
  }

  return resolvedCount
}

/**
 * Restart TypeScript Language Server Worker & Sync Config + Imports
 */
export async function restartTypeScriptServer(
  projectRoot?: string,
  currentFilePath?: string,
  currentContent?: string
): Promise<{ success: boolean; message: string }> {
  if (typeof window === 'undefined' || typeof monaco === 'undefined') {
    return { success: false, message: 'Monaco Editor belum dimuat' }
  }

  try {
    initTypeScriptDefaults()

    const ts = getTsModule()
    if (!ts || !ts.typescriptDefaults) {
      return { success: false, message: 'TypeScript service tidak ditemukan di editor' }
    }

    // 1. Bersihkan extraLibs cache
    for (const disposable of registeredExtraLibs.values()) {
      try {
        disposable.dispose()
      } catch {
        // Ignore
      }
    }
    registeredExtraLibs.clear()

    // 2. Sinkronkan tsconfig.json dari project root
    let configMsg = ''
    if (projectRoot) {
      const tsSync = await syncTsConfig(projectRoot)
      configMsg = tsSync.info
    }

    // 3. Muat ulang impor lokal file saat ini
    let resolvedImportsCount = 0
    if (currentFilePath && currentContent) {
      resolvedImportsCount = await resolveFileImports(currentFilePath, currentContent, projectRoot)
    }

    // 4. Force restart TS Worker & recompute diagnostics
    if (typeof ts.typescriptDefaults.getCompilerOptions === 'function' && typeof ts.typescriptDefaults.setCompilerOptions === 'function') {
      const currentOpts = ts.typescriptDefaults.getCompilerOptions()
      ts.typescriptDefaults.setCompilerOptions({ ...currentOpts })
      if (ts.javascriptDefaults && typeof ts.javascriptDefaults.setCompilerOptions === 'function') {
        ts.javascriptDefaults.setCompilerOptions({ ...currentOpts })
      }
    }

    const parts = [
      'TypeScript Server direstart',
      configMsg || 'bundler mode',
      resolvedImportsCount > 0 ? `${resolvedImportsCount} modul lokal disinkronkan` : ''
    ].filter(Boolean)

    return {
      success: true,
      message: parts.join(' • ')
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal restart TypeScript Server: ${err?.message || err}`
    }
  }
}

export function getTsServerStatus() {
  return {
    summary: lastLoadedTsConfigSummary,
    projectRoot: lastLoadedProjectRoot,
    extraLibsCount: registeredExtraLibs.size
  }
}

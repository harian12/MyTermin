import * as monaco from 'monaco-editor'

const registeredExtraLibs = new Map<string, monaco.IDisposable>()
let isDefaultsInitialized = false
let lastLoadedProjectRoot = ''
let lastLoadedTsConfigSummary = 'default (bundler / ESNext)'

/**
 * Hapus komentar single-line //, multi-line /* *\/ dan trailing commas dari file JSONC
 */
export function stripJsonComments(json: string): string {
  return json
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1')
}

export function mapScriptTarget(target?: string): monaco.languages.typescript.ScriptTarget {
  if (!target) return monaco.languages.typescript.ScriptTarget.ESNext
  const t = target.toLowerCase()
  if (t === 'es3') return monaco.languages.typescript.ScriptTarget.ES3
  if (t === 'es5') return monaco.languages.typescript.ScriptTarget.ES5
  if (t === 'es2015' || t === 'es6') return monaco.languages.typescript.ScriptTarget.ES2015
  if (t === 'es2016') return monaco.languages.typescript.ScriptTarget.ES2016
  if (t === 'es2017') return monaco.languages.typescript.ScriptTarget.ES2017
  if (t === 'es2018') return monaco.languages.typescript.ScriptTarget.ES2018
  if (t === 'es2019') return monaco.languages.typescript.ScriptTarget.ES2019
  if (t === 'es2020') return monaco.languages.typescript.ScriptTarget.ES2020
  if (t === 'es2021') return monaco.languages.typescript.ScriptTarget.ES2021
  if (t === 'es2022') return monaco.languages.typescript.ScriptTarget.ES2022
  return monaco.languages.typescript.ScriptTarget.ESNext
}

export function mapModuleKind(mod?: string): monaco.languages.typescript.ModuleKind {
  if (!mod) return monaco.languages.typescript.ModuleKind.ESNext
  const m = mod.toLowerCase()
  if (m === 'none') return monaco.languages.typescript.ModuleKind.None
  if (m === 'commonjs') return monaco.languages.typescript.ModuleKind.CommonJS
  if (m === 'amd') return monaco.languages.typescript.ModuleKind.AMD
  if (m === 'umd') return monaco.languages.typescript.ModuleKind.UMD
  if (m === 'system') return monaco.languages.typescript.ModuleKind.System
  if (m === 'es2015' || m === 'es6') return monaco.languages.typescript.ModuleKind.ES2015
  if (m === 'es2020') return monaco.languages.typescript.ModuleKind.ES2020
  if (m === 'node16') return 100 as any
  if (m === 'nodenext') return 199 as any
  return monaco.languages.typescript.ModuleKind.ESNext
}

export function mapModuleResolution(res?: string): monaco.languages.typescript.ModuleResolutionKind {
  if (!res) return 100 as any // Modern Bundler
  const r = res.toLowerCase()
  if (r === 'classic') return monaco.languages.typescript.ModuleResolutionKind.Classic
  if (r === 'node' || r === 'nodejs' || r === 'node10') return monaco.languages.typescript.ModuleResolutionKind.NodeJs
  if (r === 'node16') return 3 as any
  if (r === 'nodenext') return 99 as any
  if (r === 'bundler') return 100 as any
  return 100 as any
}

export function mapJsxEmit(jsx?: string): monaco.languages.typescript.JsxEmit {
  if (!jsx) return monaco.languages.typescript.JsxEmit.ReactJSX
  const j = jsx.toLowerCase()
  if (j === 'preserve') return monaco.languages.typescript.JsxEmit.Preserve
  if (j === 'react') return monaco.languages.typescript.JsxEmit.React
  if (j === 'react-native') return monaco.languages.typescript.JsxEmit.ReactNative
  if (j === 'react-jsx') return monaco.languages.typescript.JsxEmit.ReactJSX
  if (j === 'react-jsxdev') return monaco.languages.typescript.JsxEmit.ReactJSXDev
  return monaco.languages.typescript.JsxEmit.ReactJSX
}

/**
 * Inisialisasi opsi default TypeScript dan JavaScript di Monaco
 */
export function initTypeScriptDefaults() {
  if (typeof window === 'undefined' || typeof monaco === 'undefined') return
  if (isDefaultsInitialized) return
  isDefaultsInitialized = true

  const ts = monaco.languages.typescript

  // Aktifkan eager model sync agar model antar file sinkron ke worker
  ts.typescriptDefaults.setEagerModelSync(true)
  ts.javascriptDefaults.setEagerModelSync(true)

  const defaultCompilerOptions: monaco.languages.typescript.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: 100 as any, // Bundler
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    allowNonTsExtensions: true,
    resolveJsonModule: true,
    isolatedModules: true,
    skipLibCheck: true
  }

  ts.typescriptDefaults.setCompilerOptions(defaultCompilerOptions)
  ts.javascriptDefaults.setCompilerOptions(defaultCompilerOptions)

  // Abaikan error missing module deklarasi untuk paket eksternal agar tidak merah semua
  const defaultDiagnostics: monaco.languages.typescript.DiagnosticsOptions = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [
      2792, // Cannot find module ... Did you mean to set 'moduleResolution' to 'nodenext'...
      2307, // Cannot find module ... or its corresponding type declarations
      7016  // Could not find declaration file for module
    ]
  }

  ts.typescriptDefaults.setDiagnosticsOptions(defaultDiagnostics)
  ts.javascriptDefaults.setDiagnosticsOptions(defaultDiagnostics)
}

/**
 * Baca dan terapkan compilerOptions dari tsconfig.json / jsconfig.json pada folder proyek
 */
export async function syncTsConfig(projectRoot?: string): Promise<{ found: boolean; info: string }> {
  if (typeof window === 'undefined' || typeof monaco === 'undefined' || !projectRoot) {
    return { found: false, info: 'Folder project tidak tersedia' }
  }

  initTypeScriptDefaults()

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

    const ts = monaco.languages.typescript
    const mergedOpts: monaco.languages.typescript.CompilerOptions = {
      ...ts.typescriptDefaults.getCompilerOptions(),
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

    ts.typescriptDefaults.setCompilerOptions(mergedOpts)
    ts.javascriptDefaults.setCompilerOptions(mergedOpts)

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
            const disposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
              fileContent,
              fileUriStr
            )
            registeredExtraLibs.set(fileUriStr, disposable)

            monaco.languages.typescript.javascriptDefaults.addExtraLib(
              fileContent,
              fileUriStr
            )
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
    const currentOpts = monaco.languages.typescript.typescriptDefaults.getCompilerOptions()
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({ ...currentOpts })
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({ ...currentOpts })

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

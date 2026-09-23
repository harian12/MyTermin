import * as prettier from 'prettier/standalone'
import prettierPluginBabel from 'prettier/plugins/babel'
import prettierPluginEstree from 'prettier/plugins/estree'
import prettierPluginTypescript from 'prettier/plugins/typescript'
import prettierPluginHtml from 'prettier/plugins/html'
import prettierPluginPostcss from 'prettier/plugins/postcss'
import prettierPluginMarkdown from 'prettier/plugins/markdown'
import prettierPluginYaml from 'prettier/plugins/yaml'

export interface FormatResult {
  success: boolean
  formatted?: string
  error?: string
}

export async function formatCode(code: string, filepath: string): Promise<FormatResult> {
  const ext = filepath.split('.').pop()?.toLowerCase() || ''
  
  let parser: string | null = null
  const plugins = [
    prettierPluginEstree,
    prettierPluginBabel,
    prettierPluginTypescript,
    prettierPluginHtml,
    prettierPluginPostcss,
    prettierPluginMarkdown,
    prettierPluginYaml
  ]

  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      parser = 'babel'
      break
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      parser = 'typescript'
      break
    case 'json':
    case 'jsonc':
      parser = 'json'
      break
    case 'html':
    case 'htm':
      parser = 'html'
      break
    case 'vue':
      parser = 'vue'
      break
    case 'css':
      parser = 'css'
      break
    case 'scss':
      parser = 'scss'
    case 'less':
      parser = 'less'
      break
    case 'md':
    case 'markdown':
      parser = 'markdown'
      break
    case 'yaml':
    case 'yml':
      parser = 'yaml'
      break
    default:
      parser = null
  }

  if (!parser) {
    return { success: false, error: 'Bahasa belum didukung Prettier' }
  }

  try {
    const formatted = await prettier.format(code, {
      parser,
      plugins,
      semi: false,
      singleQuote: true,
      tabWidth: 2,
      trailingComma: 'none',
      printWidth: 100
    })
    return { success: true, formatted }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Gagal memformat kode' }
  }
}

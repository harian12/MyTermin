import * as monaco from 'monaco-editor'

const viewStateMap = new Map<string, monaco.editor.ICodeEditorViewState | null>()

export function saveMonacoViewState(uriStr: string, state: monaco.editor.ICodeEditorViewState | null) {
  viewStateMap.set(uriStr, state)
}

export function getMonacoViewState(uriStr: string): monaco.editor.ICodeEditorViewState | null {
  return viewStateMap.get(uriStr) || null
}

export function removeMonacoViewState(uriStr: string) {
  viewStateMap.delete(uriStr)
}

export function disposeMonacoModel(filePath: string) {
  if (typeof window === 'undefined') return
  try {
    const uri = monaco.Uri.file(filePath)
    const uriStr = uri.toString()
    viewStateMap.delete(uriStr)
    const model = monaco.editor.getModel(uri)
    if (model && !model.isDisposed()) {
      model.dispose()
    }
  } catch {
    // Ignore
  }
}

export function updateMonacoModelContent(filePath: string, newContent: string) {
  if (typeof window === 'undefined') return
  try {
    const uri = monaco.Uri.file(filePath)
    const model = monaco.editor.getModel(uri)
    if (model && !model.isDisposed() && model.getValue() !== newContent) {
      model.setValue(newContent)
    }
  } catch {
    // Ignore
  }
}

export function disposeAllMonacoModels() {
  if (typeof window === 'undefined') return
  try {
    viewStateMap.clear()
    for (const model of monaco.editor.getModels()) {
      if (!model.isDisposed()) {
        model.dispose()
      }
    }
  } catch {
    // Ignore
  }
}

export function patchMonacoTextModelService(editor: any) {
  if (typeof window === 'undefined' || !editor) return
  try {
    const findService = (insta: any): any => {
      if (!insta) return null
      const entries = insta._services?._entries || insta._services
      if (entries instanceof Map) {
        for (const [key, val] of entries) {
          if (val && typeof val.createModelReference === 'function') {
            return val
          }
          if (key && typeof key.toString === 'function' && key.toString().includes('textModelService')) {
            try {
              const s = insta.invokeFunction ? insta.invokeFunction((acc: any) => acc.get(key)) : null
              if (s && typeof s.createModelReference === 'function') return s
            } catch {}
          }
        }
      }
      return insta._parent ? findService(insta._parent) : null
    }

    const textModelService = findService(editor._instantiationService)
    if (textModelService && !textModelService.__patchedCreateModelReference) {
      textModelService.__patchedCreateModelReference = true
      const origFn = textModelService.createModelReference.bind(textModelService)
      textModelService.createModelReference = async function (resource: any) {
        try {
          return await origFn(resource)
        } catch (err: any) {
          if (err?.message?.includes('Model not found')) {
            const rawPath = resource?.fsPath || resource?.path || ''
            let filePath = rawPath
            if (filePath.startsWith('/') && filePath.length >= 3 && filePath[2] === ':') {
              filePath = filePath.substring(1)
            }
            filePath = filePath.replace(/\//g, '\\')

            let content = ''
            if (filePath && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
              try {
                const { invoke } = await import('@tauri-apps/api/core')
                content = await invoke<string>('read_file_content', { path: filePath })
              } catch {
                content = ''
              }
            }
            if (!monaco.editor.getModel(resource)) {
              monaco.editor.createModel(content, undefined, resource)
            }
            return origFn(resource)
          }
          throw err
        }
      }
    }
  } catch {
    // Ignore
  }
}

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

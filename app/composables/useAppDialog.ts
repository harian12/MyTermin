export interface DialogState {
  isOpen: boolean
  type: 'alert' | 'confirm' | 'prompt'
  title: string
  message: string
  promptValue: string
  promptPlaceholder: string
  confirmText: string
  cancelText: string
  variant: 'primary' | 'destructive' | 'warning'
  resolve: (value: any) => void
}

export const useAppDialog = () => {
  const dialog = useState<DialogState>('app-global-dialog-state', () => ({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    promptValue: '',
    promptPlaceholder: '',
    confirmText: 'OK',
    cancelText: 'Batal',
    variant: 'primary',
    resolve: () => {}
  }))

  const showAppAlert = (message: string, title = 'Pemberitahuan'): Promise<void> => {
    return new Promise((resolve) => {
      dialog.value = {
        isOpen: true,
        type: 'alert',
        title,
        message,
        promptValue: '',
        promptPlaceholder: '',
        confirmText: 'Mengerti',
        cancelText: '',
        variant: 'primary',
        resolve: () => {
          dialog.value.isOpen = false
          resolve()
        }
      }
    })
  }

  const showAppConfirm = (
    message: string,
    title = 'Konfirmasi',
    variant: 'primary' | 'destructive' | 'warning' = 'primary',
    confirmText = 'Lanjutkan',
    cancelText = 'Batal'
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      dialog.value = {
        isOpen: true,
        type: 'confirm',
        title,
        message,
        promptValue: '',
        promptPlaceholder: '',
        confirmText,
        cancelText,
        variant,
        resolve: (result: boolean) => {
          dialog.value.isOpen = false
          resolve(result)
        }
      }
    })
  }

  const showAppPrompt = (
    message: string,
    defaultValue = '',
    placeholder = '',
    title = 'Masukkan Teks',
    confirmText = 'Simpan'
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      dialog.value = {
        isOpen: true,
        type: 'prompt',
        title,
        message,
        promptValue: defaultValue,
        promptPlaceholder: placeholder,
        confirmText,
        cancelText: 'Batal',
        variant: 'primary',
        resolve: (result: string | null) => {
          dialog.value.isOpen = false
          resolve(result)
        }
      }
    })
  }

  return {
    dialog,
    showAppAlert,
    showAppConfirm,
    showAppPrompt
  }
}

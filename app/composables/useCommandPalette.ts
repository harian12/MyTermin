export const useCommandPalette = () => {
  const isOpen = useState<boolean>('command-palette-open', () => false)

  const openPalette = () => {
    isOpen.value = true
  }

  const closePalette = () => {
    isOpen.value = false
  }

  const togglePalette = () => {
    isOpen.value = !isOpen.value
  }

  return {
    isOpen,
    openPalette,
    closePalette,
    togglePalette
  }
}

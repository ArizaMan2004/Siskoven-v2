let bufferCode = ""
let lastKeyTime = 0

export function initBarcodeScanner(onBarcodeDetected: (code: string) => void) {
  const handleKeydown = (e: KeyboardEvent) => {
    const now = Date.now()

    if (now - lastKeyTime > 250) {
      bufferCode = ""
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      bufferCode += e.key
    }

    if (e.key === "Enter" && bufferCode.length > 3) {
      const code = bufferCode.trim()
      bufferCode = ""
      onBarcodeDetected(code)
    }

    lastKeyTime = now
  }

  document.addEventListener("keydown", handleKeydown)

  return () => {
    document.removeEventListener("keydown", handleKeydown)
  }
}

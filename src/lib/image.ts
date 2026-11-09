/** Ridimensiona e comprime una foto (fattura) in JPEG, restituendo un data URL. */
export async function compressImage(file: File, maxSide = 1400, quality = 0.72): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Il file selezionato non è un\u2019immagine.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Impossibile leggere l\u2019immagine.'))
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Compressione non disponibile su questo browser.')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    URL.revokeObjectURL(url)
  }
}

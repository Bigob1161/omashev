/**
 * Уменьшает большие снимки с телефона до 2000 px и пересохраняет в JPEG.
 * Заодно из файла уходят служебные данные, в том числе геометка.
 * PDF и то, что браузер не может прочитать, отправляется как есть.
 */
export async function prepareUpload(file: File): Promise<Blob> {
  if (file.type === 'application/pdf') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (blob) return blob
  } catch { /* отправим исходный файл */ }
  return file
}

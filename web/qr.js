// Decode fiscal QR locally from a photo; only the QR text reaches the server.
export async function decodeQrFile(file) {
  if (!(file instanceof Blob) || !/^image\//.test(file.type))
    throw new Error('Выберите фотографию с QR-кодом чека');
  if (file.size > 12 * 1024 * 1024) throw new Error('Фото слишком большое (максимум 12 МБ)');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (_) {
    throw new Error('Фото не удалось открыть. Попробуйте JPG или PNG.');
  }
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Ваш браузер не разрешил обработку изображения');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const jsQR = window.jsQR;
    if (typeof jsQR !== 'function') throw new Error('Декодер QR не загрузился. Переоткройте Mini App.');
    const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' });
    if (!result?.data) throw new Error('Не удалось найти QR-код на фото. Снимите его ближе, ровно и без бликов.');
    return result.data;
  } finally {
    bitmap.close?.();
  }
}

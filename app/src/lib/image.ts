// x/y: the centre of the circle in fractions of the picture; zoom ≥ 1 shrinks the square.
export type AvatarCrop = { x: number; y: number; zoom: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function clampCrop(w: number, h: number, c: AvatarCrop): AvatarCrop {
  const zoom = clamp(c.zoom, 1, 4);
  const side = Math.min(w, h) / zoom;
  return { x: clamp(c.x, side / 2 / w, 1 - side / 2 / w), y: clamp(c.y, side / 2 / h, 1 - side / 2 / h), zoom };
}

export function cropRect(w: number, h: number, c: AvatarCrop) {
  const k = clampCrop(w, h, c);
  const side = Math.min(w, h) / k.zoom;
  return { sx: k.x * w - side / 2, sy: k.y * h - side / 2, side };
}

// Decoded with the camera's rotation applied, so portrait photos stand upright.
export function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

export function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', quality));
}

export async function resizePhoto(file: Blob, maxSide = 1080, quality = 0.82) {
  const img = await decodeImage(file);
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const width = Math.round(img.width * k);
  const height = Math.round(img.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  img.close();
  return { blob: await toJpeg(canvas, quality), width, height };
}

export async function cropAvatar(file: Blob, crop: AvatarCrop, size = 256): Promise<Blob> {
  const img = await decodeImage(file);
  const { sx, sy, side } = cropRect(img.width, img.height, crop);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')!.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  img.close();
  return toJpeg(canvas, 0.85);
}

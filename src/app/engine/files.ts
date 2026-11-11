/** Names and formats of the pictures read and saved. Framework-free, covered by unit tests. */

export type ExportFormat = 'png' | 'jpg' | 'webp';

export const EXPORT_FORMATS: Record<ExportFormat, { mime: string; extension: string; transparency: boolean }> = {
  png: { mime: 'image/png', extension: 'png', transparency: true },
  jpg: { mime: 'image/jpeg', extension: 'jpg', transparency: false },
  webp: { mime: 'image/webp', extension: 'webp', transparency: true },
};

/**
 * Every picture: the browser itself decodes it, so what it can open is accepted (JPG, PNG,
 * WebP, AVIF, GIF, BMP everywhere, HEIC on Safari…). What it cannot open is refused with a message.
 */
export const ACCEPTED_TYPES = 'image/*';

const IMAGE_EXTENSION = /\.(png|jpe?g|jfif|webp|avif|gif|bmp|heic|heif|tiff?|ico)$/i;

/** Whether a dropped or pasted file may be a picture (its type, else its extension). */
export function isImageFile(file: { type: string; name: string }): boolean {
  return file.type ? file.type.startsWith('image/') && file.type !== 'image/svg+xml' : IMAGE_EXTENSION.test(file.name);
}

/** "IMG_0042.JPG" saved as PNG → "IMG_0042-no-bg.png". Characters file systems refuse are dropped. */
export function exportName(original: string, format: ExportFormat, suffix = 'no-bg'): string {
  const base = original
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .trim();
  return `${base || 'image'}-${suffix}.${EXPORT_FORMATS[format].extension}`;
}

/** 1536000 → "1.5 MP"; small pictures keep their size in pixels. */
export function megapixels(width: number, height: number): string {
  const mp = (width * height) / 1e6;
  return mp >= 10 ? `${Math.round(mp)} MP` : `${Math.round(mp * 10) / 10} MP`;
}

/** What a model does before it can run: download (once), then preparation on the device. */
export interface ModelLoadProgress {
  stage: 'download' | 'load';
  progress: number;
  /** Bytes received and expected, during a download. */
  loaded?: number;
  total?: number;
}

/**
 * Transformers.js callback reporting a model's download as a whole, then its preparation.
 * It also reports progress while reading its own cache: `fromCache` silences that, since
 * nothing is being downloaded then.
 */
export function modelProgress(onProgress: (p: ModelLoadProgress) => void, fromCache = false): (info: { status: string; progress?: number; loaded?: number; total?: number }) => void {
  return (info) => {
    if (fromCache || info.status !== 'progress_total') return;
    const progress = (info.progress ?? 0) / 100;
    onProgress(progress >= 1 ? { stage: 'load', progress: 0 } : { stage: 'download', progress, loaded: info.loaded, total: info.total });
  };
}

/** Whether a file of a model is already in the browser cache (Transformers.js keeps them there). */
export async function modelIsCached(repo: string, revision: string, file: string): Promise<boolean> {
  try {
    const keys = (await (await caches.open('transformers-cache')).keys()).map((request) => decodeURIComponent(request.url));
    return keys.some((url) => url.includes(`${repo}/resolve/${revision}/`) && url.endsWith(file));
  } catch {
    return false;
  }
}

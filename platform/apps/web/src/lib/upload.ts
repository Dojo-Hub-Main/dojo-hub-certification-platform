import { MAX_UPLOAD_LABEL, StoredFileKind } from '@dojo-hub/shared';
import { api } from './api-client';

export async function uploadFile(
  file: File,
  kind: StoredFileKind,
  onProgress?: (pct: number) => void,
): Promise<{ id: string; url: string; originalName: string; sizeBytes: number; mimeType: string; kind: StoredFileKind }> {
  const { storageKey, uploadUrl } = await api.post<{ storageKey: string; uploadUrl: string; publicUrl: string }>('/files/presign', {
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    kind,
  });

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // 413 comes from the storage itself, after the whole file has gone up.
      reject(
        new Error(
          xhr.status === 413
            ? `the file is too large for storage (limit ${MAX_UPLOAD_LABEL}). For a longer video, paste a video link instead.`
            : `the storage rejected it (error ${xhr.status}).`,
        ),
      );
    };
    xhr.onerror = () => reject(new Error('the connection dropped part-way through. Check your internet and try again.'));
    xhr.send(file);
  });

  return api.post('/files', {
    storageKey,
    originalName: file.name,
    sizeBytes: file.size,
    mimeType: file.type || 'application/octet-stream',
    kind,
  });
}

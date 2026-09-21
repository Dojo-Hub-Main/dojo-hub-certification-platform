'use client';

import { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, StoredFileKind } from '@dojo-hub/shared';
import { ApiError } from '@/lib/api-client';
import { uploadFile } from '@/lib/upload';

export interface UploadedFile {
  id: string;
  originalName: string;
  sizeBytes: number;
  /** Public URL of the stored object — used by callers that embed the file (e.g. lecture videos). */
  url?: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FileDropzone({
  kind,
  accept,
  files,
  onChange,
  noun,
}: {
  kind: StoredFileKind;
  accept: string;
  files: UploadedFile[];
  onChange: (files: UploadedFile[]) => void;
  /** What the user is uploading, e.g. "image". Defaults from `kind`. */
  noun?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    setError(null);

    // Checked here as well as server-side so an oversized file fails instantly
    // instead of after a long upload that the API would reject anyway.
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(
        `"${file.name}" is ${formatBytes(file.size)}, and the limit is ${MAX_UPLOAD_LABEL}.` +
          (kind === StoredFileKind.VIDEO
            ? ' Upload the video to YouTube and paste its link below instead, or compress it first.'
            : ' Compress it or split it into smaller files.'),
      );
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    if (file.size === 0) {
      setError(`"${file.name}" is empty and cannot be uploaded.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setProgress(0);
    try {
      const uploaded = await uploadFile(file, kind, setProgress);
      onChange([...files, uploaded]);
    } catch (e) {
      // Surface the real reason — a generic message makes a down API,
      // an expired session and a rejected file all look identical.
      const reason = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Unknown error';
      setError(`Upload failed: ${reason}`);
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div
        className="border-2 border-dashed border-navy-200 rounded-xl p-4 text-center hover:border-crimson-300 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        <Upload className="w-5 h-5 text-navy-400 mx-auto mb-1" />
        {progress !== null ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-navy-700">Uploading… {progress}%</p>
            <div className="h-1.5 bg-navy-100 rounded-full overflow-hidden max-w-[220px] mx-auto">
              <div className="h-full bg-crimson-600 transition-all duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-navy-600">
              Drop {noun ?? (kind === 'VIDEO' ? 'a video' : 'a document')} here or click to browse
            </p>
            <p className="text-[13px] text-navy-400 mt-0.5">Up to {MAX_UPLOAD_LABEL}</p>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-crimson-600 bg-crimson-50 border border-crimson-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {files.map((f) => (
        <div key={f.id} className="flex items-center justify-between text-xs bg-navy-50 border border-navy-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-3.5 h-3.5 text-navy-400 shrink-0" />
            <span className="truncate">{f.originalName}</span>
            <span className="text-navy-400 shrink-0">({(f.sizeBytes / 1024).toFixed(0)} KB)</span>
          </div>
          <button
            type="button"
            onClick={() => onChange(files.filter((x) => x.id !== f.id))}
            aria-label={`Remove file "${f.originalName}"`}
            className="text-navy-400 hover:text-crimson-600 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

'use client';

import { FileText, Link2, Plus, Video, X } from 'lucide-react';
import { StoredFileKind, TopicResourceKind } from '@dojo-hub/shared';
import { FileDropzone, UploadedFile } from '@/components/student/FileDropzone';

/**
 * The parts of a lesson beyond its main video: uploaded reference documents, and further
 * videos or links. Shared by the add and edit forms so the two cannot drift apart.
 */

export type ResourceRow = { title: string; url: string; kind: TopicResourceKind };

/** Office documents, PDFs and plain files — kept in step with the API's allowed types. */
export const DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,' +
  'application/pdf,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-powerpoint,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/vnd.ms-excel,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const isHttpUrl = (u: string) => /^https?:\/\/\S+\.\S+/i.test(u.trim());

/** A row the author has started but not finished. Blocks saving so nothing is silently dropped. */
export function resourceProblem(rows: ResourceRow[]): string | null {
  for (const [i, r] of rows.entries()) {
    const title = r.title.trim();
    const url = r.url.trim();
    if (!title && !url) continue; // an untouched empty row is simply ignored
    if (!title) return `Give link ${i + 1} a title so students know what it is.`;
    if (!isHttpUrl(url)) return `Link ${i + 1} needs a full address starting with http:// or https://.`;
  }
  return null;
}

/** Rows ready to send: trimmed, with untouched empty rows removed. */
export function cleanResources(rows: ResourceRow[]): ResourceRow[] {
  return rows
    .map((r) => ({ ...r, title: r.title.trim(), url: r.url.trim() }))
    .filter((r) => r.title || r.url);
}

export function TopicExtrasFields({
  documents,
  onDocumentsChange,
  resources,
  onResourcesChange,
}: {
  documents: UploadedFile[];
  onDocumentsChange: (next: UploadedFile[]) => void;
  resources: ResourceRow[];
  onResourcesChange: (next: ResourceRow[]) => void;
}) {
  const update = (i: number, patch: Partial<ResourceRow>) =>
    onResourcesChange(resources.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));

  const problem = resourceProblem(resources);

  return (
    <div className="space-y-4">
      {/* ----------------------------------------------------- reference documents */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-[12px] font-mono uppercase text-navy-400 font-bold">
          <FileText className="w-3.5 h-3.5" /> Reference materials <span className="normal-case font-normal">(optional)</span>
        </p>
        <p className="text-[12px] text-navy-500">
          PDF, Word, PowerPoint or Excel files students can download alongside the lesson.
        </p>
        <FileDropzone
          kind={StoredFileKind.DOCUMENT}
          accept={DOCUMENT_ACCEPT}
          files={documents}
          onChange={onDocumentsChange}
          noun="a document"
        />
      </div>

      {/* ----------------------------------------------------- videos and links */}
      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-[12px] font-mono uppercase text-navy-400 font-bold">
          <Link2 className="w-3.5 h-3.5" /> More videos &amp; links <span className="normal-case font-normal">(optional)</span>
        </p>
        <p className="text-[12px] text-navy-500">
          Further videos or reference links for this lesson, beyond the main video above.
        </p>

        {resources.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1.4fr)_auto] items-center">
            <select
              aria-label={`Link ${i + 1} type`}
              className="input text-sm py-2"
              value={r.kind}
              onChange={(e) => update(i, { kind: e.target.value as TopicResourceKind })}
            >
              <option value="VIDEO">Video</option>
              <option value="LINK">Link</option>
            </select>
            <input
              aria-label={`Link ${i + 1} title`}
              className="input text-sm py-2"
              placeholder={r.kind === 'VIDEO' ? 'e.g. Wiring walkthrough' : 'e.g. Siemens datasheet'}
              value={r.title}
              onChange={(e) => update(i, { title: e.target.value })}
            />
            <input
              aria-label={`Link ${i + 1} address`}
              className="input text-sm py-2"
              placeholder="https://"
              value={r.url}
              onChange={(e) => update(i, { url: e.target.value })}
            />
            <button
              type="button"
              aria-label={`Remove link ${i + 1}`}
              onClick={() => onResourcesChange(resources.filter((_, ri) => ri !== i))}
              className="justify-self-end p-2 rounded-lg text-navy-400 hover:text-crimson-600 hover:bg-crimson-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onResourcesChange([...resources, { title: '', url: '', kind: 'VIDEO' }])}
            className="inline-flex items-center gap-1 text-xs font-bold text-crimson-600 hover:underline"
          >
            <Video className="w-3.5 h-3.5" /> <Plus className="w-3 h-3 -ml-1" /> Add a video
          </button>
          <button
            type="button"
            onClick={() => onResourcesChange([...resources, { title: '', url: '', kind: 'LINK' }])}
            className="inline-flex items-center gap-1 text-xs font-bold text-crimson-600 hover:underline"
          >
            <Link2 className="w-3.5 h-3.5" /> <Plus className="w-3 h-3 -ml-1" /> Add a link
          </button>
        </div>

        {problem && <p className="text-[12px] text-crimson-600">{problem}</p>}
      </div>
    </div>
  );
}

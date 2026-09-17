'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, ChevronDown, Clock, Download, ExternalLink, FileText, Lock, Plus, Trash2, XCircle } from 'lucide-react';
import { StoredFileKind, SubmissionDto } from '@dojo-hub/shared';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '../ui/Button';
import { FileDropzone } from './FileDropzone';

export function SubmissionWorkspace({
  topicId,
  moduleId,
  topicTitle,
}: {
  topicId?: string;
  moduleId?: string;
  topicTitle: string;
}) {
  const queryClient = useQueryClient();
  const { data: submissions = [] } = useQuery<SubmissionDto[]>({
    queryKey: ['submissions', 'mine'],
    queryFn: () => api.get<SubmissionDto[]>('/submissions/mine'),
  });

  const matchesTarget = (s: SubmissionDto) => (topicId ? s.topicId === topicId : s.moduleId === moduleId);
  const existing = submissions.find((s) => matchesTarget(s) && s.status !== 'REJECTED');
  const lastRejected = submissions.find((s) => matchesTarget(s) && s.status === 'REJECTED');

  const [links, setLinks] = useState([{ url: '', description: '' }]);
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<{ id: string; originalName: string; sizeBytes: number; kind: StoredFileKind }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api.post<SubmissionDto>('/submissions', {
        type: 'COMPETENCY',
        ...(topicId ? { topicId } : { moduleId }),
        title: `Competency Evidence: ${topicTitle}`,
        submissionText: notes,
        links: links.filter((l) => l.url.trim()),
        fileIds: files.map((f) => f.id),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['submissions', 'mine'] });
      setLinks([{ url: '', description: '' }]);
      setNotes('');
      setFiles([]);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Submission failed.'),
  });

  if (existing?.status === 'APPROVED' || existing?.status === 'PENDING') {
    const pending = existing.status === 'PENDING';
    return (
      <div className="bg-navy-50 rounded-2xl border border-navy-200 p-5 space-y-3">
        <div className="flex items-center gap-2">
          {pending ? (
            <Clock className="w-5 h-5 text-navy-600 animate-pulse" />
          ) : (
            <CheckCircle className="w-5 h-5 text-green-600" />
          )}
          <h4 className="font-bold text-sm text-navy-950">{pending ? 'Under Active Review' : 'Competency Verified'}</h4>
        </div>
        {!pending && existing.feedback && (
          <div className="bg-white rounded-lg border border-navy-200 p-3 text-xs">
            <p className="font-bold text-navy-500 mb-1">Supervisor Feedback ({existing.score}%)</p>
            <p className="text-navy-600">{existing.feedback}</p>
            <p className="text-[12px] text-navy-400 mt-1">— {existing.evaluatorName}</p>
          </div>
        )}
        {/* Open while it is being reviewed — that is when a student most wants to check
            what they sent. Folded away once there is a verdict to read first. */}
        <SubmittedEvidence submission={existing} defaultOpen={pending} />
      </div>
    );
  }

  return (
    <div className="bg-navy-50 rounded-2xl border border-navy-200 p-5 space-y-4">
      <h4 className="font-bold text-sm text-navy-950">Submit Competency Evidence</h4>

      {lastRejected && (
        <div className="bg-crimson-50 border border-crimson-200 rounded-lg p-3 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-crimson-700 font-bold">
            <XCircle className="w-3.5 h-3.5" /> Revision Requested
          </div>
          <p className="text-crimson-600">{lastRejected.feedback}</p>
          <div className="pt-1">
            <SubmittedEvidence submission={lastRejected} title="View what you submitted last time" />
          </div>
        </div>
      )}

      {error && <div className="bg-crimson-50 border border-crimson-200 rounded-lg p-2.5 text-xs text-crimson-700">{error}</div>}

      <div className="space-y-2">
        <label className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500">Evidence Links</label>
        {links.map((link, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={link.url}
              onChange={(e) => setLinks(links.map((l, idx) => (idx === i ? { ...l, url: e.target.value } : l)))}
              placeholder="https://github.com/..."
              aria-label="Evidence link URL"
              className="input flex-1"
            />
            <input
              value={link.description}
              onChange={(e) => setLinks(links.map((l, idx) => (idx === i ? { ...l, description: e.target.value } : l)))}
              placeholder="Description"
              aria-label="Evidence link description"
              className="input flex-1"
            />
            {links.length > 1 && (
              <button onClick={() => setLinks(links.filter((_, idx) => idx !== i))} aria-label="Remove this link" className="text-navy-400 hover:text-crimson-600">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setLinks([...links, { url: '', description: '' }])}
          className="text-[13px] font-semibold text-crimson-600 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add another link
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500 block mb-1">Documents</label>
          <FileDropzone
            kind={StoredFileKind.DOCUMENT}
            accept=".pdf,.doc,.docx,.zip,.txt,.json,.png,.jpg"
            files={files.filter((f) => f.kind === StoredFileKind.DOCUMENT)}
            onChange={(docFiles) => setFiles([...files.filter((f) => f.kind !== StoredFileKind.DOCUMENT), ...docFiles.map((f) => ({ ...f, kind: StoredFileKind.DOCUMENT }))])}
          />
        </div>
        <div>
          <label className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500 block mb-1">Demo Video</label>
          <FileDropzone
            kind={StoredFileKind.VIDEO}
            accept="video/*"
            files={files.filter((f) => f.kind === StoredFileKind.VIDEO)}
            onChange={(vidFiles) => setFiles([...files.filter((f) => f.kind !== StoredFileKind.VIDEO), ...vidFiles.map((f) => ({ ...f, kind: StoredFileKind.VIDEO }))])}
          />
        </div>
      </div>

      <div>
        <label className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500 block mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Describe what you built and how it satisfies this competency..."
          className="input resize-none"
        />
      </div>

      <Button
        size="sm"
        loading={submit.isPending}
        onClick={() => {
          setError(null);
          if (!links.some((l) => l.url.trim()) && files.length === 0) {
            setError('Add at least one link or uploaded file as evidence.');
            return;
          }
          if (notes.trim().length < 10) {
            setError('Add a short note (10+ characters) describing your submission.');
            return;
          }
          submit.mutate();
        }}
      >
        Submit for Review
      </Button>
    </div>
  );
}

/** Only real web addresses become links; anything else is shown as plain text. */
function isWebUrl(url: string) {
  return /^https?:\/\//i.test(url.trim());
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * A read-only copy of a submission as the reviewer receives it: notes, links, documents
 * and demo video. Nothing here can be changed — a submission is fixed once sent.
 */
function SubmittedEvidence({
  submission,
  defaultOpen = false,
  title = 'View your submission',
}: {
  submission: SubmissionDto;
  defaultOpen?: boolean;
  title?: string;
}) {
  const documents = submission.files.filter((f) => f.kind === StoredFileKind.DOCUMENT);
  const videos = submission.files.filter((f) => f.kind === StoredFileKind.VIDEO);
  const submittedOn = new Date(submission.submittedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <details open={defaultOpen} className="group rounded-xl border border-navy-200 bg-white">
      <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none text-xs font-semibold text-navy-800 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown className="w-4 h-4 text-navy-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-navy-100 px-3 py-3 space-y-4 text-xs">
        <p className="flex items-center gap-1.5 text-navy-500">
          <Lock className="w-3.5 h-3.5 shrink-0" /> Submitted {submittedOn} · can&apos;t be edited after submission
        </p>

        <section className="space-y-1">
          <h5 className="text-[11px] font-mono uppercase tracking-wider font-bold text-navy-500">Notes</h5>
          <p className="text-navy-700 whitespace-pre-wrap">{submission.submissionText}</p>
        </section>

        {submission.links.length > 0 && (
          <section className="space-y-1.5">
            <h5 className="text-[11px] font-mono uppercase tracking-wider font-bold text-navy-500">Evidence links</h5>
            <ul className="space-y-1.5">
              {submission.links.map((link, i) => (
                <li key={i} className="rounded-lg border border-navy-100 px-3 py-2">
                  {isWebUrl(link.url) ? (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 font-semibold text-crimson-700 hover:underline break-all"
                    >
                      {link.url}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="font-semibold text-navy-800 break-all">{link.url}</span>
                  )}
                  {link.description && <p className="text-navy-500 mt-0.5">{link.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {documents.length > 0 && (
          <section className="space-y-1.5">
            <h5 className="text-[11px] font-mono uppercase tracking-wider font-bold text-navy-500">Documents</h5>
            <ul className="space-y-1.5">
              {documents.map((doc) => (
                <li key={doc.id}>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={doc.originalName}
                    className="flex items-center gap-2 rounded-lg border border-navy-100 px-3 py-2 hover:border-crimson-300"
                  >
                    <FileText className="w-4 h-4 text-navy-500 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-semibold text-navy-800">{doc.originalName}</span>
                    <span className="text-navy-400 shrink-0">{formatSize(doc.sizeBytes)}</span>
                    <Download className="w-3.5 h-3.5 text-navy-400 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {videos.length > 0 && (
          <section className="space-y-1.5">
            <h5 className="text-[11px] font-mono uppercase tracking-wider font-bold text-navy-500">Demo video</h5>
            {videos.map((video) => (
              <div key={video.id} className="space-y-1">
                <video src={video.url} controls preload="metadata" className="w-full rounded-lg bg-black aspect-video" />
                <p className="text-navy-400 truncate">{video.originalName}</p>
              </div>
            ))}
          </section>
        )}
      </div>
    </details>
  );
}

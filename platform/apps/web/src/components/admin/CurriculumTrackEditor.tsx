'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, ChevronLeft, Eye, Pencil, Plus, Trash2, Rocket, RotateCcw, X } from 'lucide-react';
import { StoredFileKind, TrackDto } from '@dojo-hub/shared';
import { api, ApiError } from '@/lib/api-client';
import { formatDuration } from '@/lib/video';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../ui/cn';
import { FileDropzone } from '../student/FileDropzone';
import { DurationInput } from './DurationInput';
import { TopicPreview } from './TopicPreview';
import { ModuleQuizEditor } from './ModuleQuizEditor';
import { TopicExtrasFields, ResourceRow, resourceProblem, cleanResources } from './TopicExtrasFields';
import type { UploadedFile } from '../student/FileDropzone';

type Module = TrackDto['modules'][number];

/** In-progress "Add Lesson Topic" input, held by the parent so collapsing a module
 *  (which unmounts ModuleDetail) no longer discards what the author has typed. */
type TopicDraft = {
  title: string;
  description: string;
  durationSeconds: number;
  videoUrl: string;
  tools: string;
  documents: UploadedFile[];
  resources: ResourceRow[];
};

const EMPTY_DRAFT: TopicDraft = {
  title: '',
  description: '',
  durationSeconds: 600,
  videoUrl: '',
  tools: '',
  documents: [],
  resources: [],
};

function draftHasContent(d: TopicDraft): boolean {
  return Boolean(
    d.title.trim() ||
      d.description.trim() ||
      d.videoUrl.trim() ||
      d.tools.trim() ||
      (d.documents ?? []).length ||
      (d.resources ?? []).some((r) => r.title.trim() || r.url.trim()),
  );
}
type Topic = Module['topics'][number];

function toolsToArray(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function CurriculumTrackEditor({ trackId }: { trackId: string }) {
  const queryClient = useQueryClient();
  const { data: track, isLoading } = useQuery<TrackDto>({
    queryKey: ['track', 'admin', trackId],
    queryFn: () => api.get<TrackDto>(`/tracks/${trackId}/admin`),
  });

  const [reviewing, setReviewing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [topicDrafts, setTopicDrafts] = useState<Record<string, TopicDraft>>({});
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [addModuleError, setAddModuleError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['track', 'admin', trackId] });

  // A module is just a titled grouping — description and tools belong on its topics.
  const addModule = useMutation({
    mutationFn: () => api.post(`/tracks/${trackId}/modules`, { title: newModuleTitle }),
    onSuccess: () => {
      invalidate();
      setNewModuleTitle('');
      setAddModuleError(null);
    },
    onError: (e) => setAddModuleError(e instanceof ApiError ? e.message : 'Failed to add module. Please try again.'),
  });

  const titleTooShort = newModuleTitle.length > 0 && newModuleTitle.trim().length < 3;
  const canAddModule = newModuleTitle.trim().length >= 3;

  const removeModule = useMutation({
    mutationFn: (moduleId: string) => api.delete(`/tracks/modules/${moduleId}`),
    onSuccess: invalidate,
  });

  const publish = useMutation({
    mutationFn: () => api.post(`/tracks/${trackId}/publish`),
    onSuccess: () => {
      invalidate();
      setReviewing(false);
    },
    onError: (e) => setPublishError(e instanceof ApiError ? e.message : 'Failed to publish.'),
  });

  const unpublish = useMutation({
    mutationFn: () => api.post(`/tracks/${trackId}/unpublish`),
    onSuccess: invalidate,
  });

  if (isLoading || !track) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <Skeleton className="h-3.5 w-32" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-2/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
        <Skeleton className="h-32 rounded-2xl" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <Link href="/curriculum" className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-950 font-semibold">
          <ChevronLeft className="w-4 h-4" /> Back to Programs
        </Link>
        <div className="flex items-center gap-2">
          <Badge tone={track.status === 'PUBLISHED' ? 'green' : 'amber'}>{track.status === 'PUBLISHED' ? 'Live' : 'Draft'}</Badge>
          {track.status === 'PUBLISHED' ? (
            <Button size="sm" variant="outline" onClick={() => unpublish.mutate()} loading={unpublish.isPending}>
              <RotateCcw className="w-3.5 h-3.5" /> Revert to Draft
            </Button>
          ) : (
            <Button size="sm" onClick={() => setReviewing(true)}>
              <Rocket className="w-3.5 h-3.5" /> Review &amp; Publish
            </Button>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-extrabold text-navy-950">{track.title}</h1>
        <p className="text-sm text-navy-500 mt-1">{track.description}</p>
      </div>

      <Card className="p-6 space-y-3">
        <div>
          <h3 className="font-bold text-navy-950 text-sm">+ New Module</h3>
          <p className="text-xs text-navy-500 mt-0.5">
            A module just needs a title — add its lesson topics underneath, where descriptions, tools and video live.
          </p>
        </div>
        {addModuleError && <p className="text-xs text-crimson-600">{addModuleError}</p>}
        <div
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canAddModule && !addModule.isPending) {
              e.preventDefault();
              addModule.mutate();
            }
          }}
        >
          <input value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} placeholder="Module title" className="input" />
          {titleTooShort && <p className="text-[12px] text-crimson-600 mt-1">Title needs at least 3 characters.</p>}
        </div>
        <Button size="sm" disabled={!canAddModule} loading={addModule.isPending} onClick={() => addModule.mutate()}>
          <Plus className="w-4 h-4" /> Add Module
        </Button>
      </Card>

      <div className="space-y-4">
        {track.modules.map((mod) => (
          <Card key={mod.id} className="overflow-hidden">
            {editingModuleId === mod.id ? (
              <ModuleEditForm
                module={mod}
                onCancel={() => setEditingModuleId(null)}
                onSaved={() => {
                  setEditingModuleId(null);
                  invalidate();
                }}
              />
            ) : (
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expandedModuleId === mod.id}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-navy-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-crimson-500/60"
                onClick={() => setExpandedModuleId(expandedModuleId === mod.id ? null : mod.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedModuleId(expandedModuleId === mod.id ? null : mod.id);
                  }
                }}
              >
                <div className="min-w-0">
                  <p className="font-bold text-sm text-navy-950">{mod.title}</p>
                  {draftHasContent(topicDrafts[mod.id] ?? EMPTY_DRAFT) && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      Unsaved lesson
                    </span>
                  )}
                  {mod.description && <p className="text-xs text-navy-500 mt-0.5 line-clamp-2">{mod.description}</p>}
                  <p className="text-xs text-navy-400 mt-0.5">
                    {mod.topics.length === 0
                      ? 'Project brief — students submit work directly'
                      : `${mod.topics.length} lesson${mod.topics.length === 1 ? '' : 's'}`}
                    {mod.competencies.length > 0 && ` • ${mod.competencies.length} rubric item${mod.competencies.length === 1 ? '' : 's'}`}
                  </p>
                  {mod.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {mod.tools.map((tool) => (
                        <Badge key={tool} tone="gray">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingModuleId(mod.id);
                      setExpandedModuleId(mod.id);
                    }}
                    aria-label={`Edit module "${mod.title}"`}
                    className="text-navy-400 hover:text-navy-800"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete module "${mod.title}" and all its topics?`)) removeModule.mutate(mod.id);
                    }}
                    aria-label={`Delete module "${mod.title}"`}
                    className="text-navy-400 hover:text-crimson-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            {expandedModuleId === mod.id && editingModuleId !== mod.id && (
              <ModuleDetail
                moduleId={mod.id}
                trackId={trackId}
                module={mod}
                onChanged={invalidate}
                draft={topicDrafts[mod.id] ?? EMPTY_DRAFT}
                onDraftChange={(next) => setTopicDrafts((prev) => ({ ...prev, [mod.id]: next }))}
              />
            )}
          </Card>
        ))}
        {track.modules.length === 0 && <p className="text-sm text-navy-400 text-center py-8">No modules yet. Add one above to get started.</p>}
      </div>

      {reviewing && (
        <Modal open onClose={() => setReviewing(false)} title="Pre-Flight Publication Review" subtitle="Confirm this program is ready to go live." maxWidth="max-w-2xl">
          <div className="space-y-4">
            {publishError && <p className="text-xs text-crimson-600">{publishError}</p>}
            {track.modules.length === 0 && <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-lg">This track has zero modules — publishing is blocked.</p>}
            <div className="max-h-80 overflow-y-auto space-y-3">
              {track.modules.map((mod) => (
                <div key={mod.id} className="border border-navy-100 rounded-lg p-3">
                  <p className="text-sm font-bold text-navy-950">{mod.title}</p>
                  {mod.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {mod.tools.map((tool) => (
                        <Badge key={tool} tone="gray">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {mod.topics.length === 0 ? (
                    <p className="text-xs text-navy-400 mt-1">Project brief — students submit work directly against this module.</p>
                  ) : (
                    <ul className="text-xs text-navy-500 mt-1 list-disc pl-4">
                      {mod.topics.map((t) => (
                        <li key={t.id}>{t.title}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <Button className="w-full" loading={publish.isPending} onClick={() => publish.mutate()}>
              Approve &amp; Launch
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ModuleEditForm({ module: mod, onCancel, onSaved }: { module: Module; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(mod.title);
  const [error, setError] = useState<string | null>(null);

  // Title only — a module's detail lives on its topics.
  const save = useMutation({
    mutationFn: () => api.patch(`/tracks/modules/${mod.id}`, { title }),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save module.'),
  });

  const canSave = title.trim().length >= 3;

  return (
    <div className="p-4 space-y-2.5 bg-navy-50/60">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-mono uppercase text-navy-400 font-bold">Editing Module</p>
        <button onClick={onCancel} aria-label="Cancel editing module" className="text-navy-400 hover:text-navy-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="text-xs text-crimson-600">{error}</p>}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Module title" className="input" />
      <div className="flex gap-2">
        <Button size="sm" disabled={!canSave} loading={save.isPending} onClick={() => save.mutate()}>
          Save Changes
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function VideoSourceInput({ videoUrl, onVideoUrlChange }: { videoUrl: string; onVideoUrlChange: (url: string) => void }) {
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string; originalName: string; sizeBytes: number; url?: string }[]>([]);

  return (
    <div className="space-y-2">
      <label className="text-xs font-mono uppercase text-navy-400 font-bold block">Lecture Video</label>
      <FileDropzone
        kind={StoredFileKind.VIDEO}
        accept="video/*"
        files={uploadedFiles}
        onChange={(files) => {
          setUploadedFiles(files);
          const last = files[files.length - 1];
          if (last?.url) onVideoUrlChange(last.url);
        }}
      />

      <div className="flex items-center gap-2">
        <span className="h-px flex-1 bg-navy-100" />
        <span className="text-[13px] font-semibold text-navy-400 uppercase tracking-wide">or paste a link</span>
        <span className="h-px flex-1 bg-navy-100" />
      </div>

      <input
        value={videoUrl}
        onChange={(e) => onVideoUrlChange(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
        className="input"
      />
      <p className="text-[13px] text-navy-400">
        Paste a YouTube link or any direct video URL. Optional — leave blank for a reading or exercise lesson.
      </p>
    </div>
  );
}

function ModuleDetail({
  moduleId,
  trackId,
  module: mod,
  onChanged,
  draft,
  onDraftChange,
}: {
  moduleId: string;
  trackId: string;
  module: Module;
  onChanged: () => void;
  draft: TopicDraft;
  onDraftChange: (next: TopicDraft) => void;
}) {
  // Draft lives in the parent so it survives this component unmounting.
  const { title, description, durationSeconds, videoUrl, tools } = draft;
  // Drafts started before these fields existed will not have them.
  const documents = draft.documents ?? [];
  const resources = draft.resources ?? [];
  const patch = (fields: Partial<TopicDraft>) => onDraftChange({ ...draft, ...fields });
  const setTitle = (v: string) => patch({ title: v });
  const setDescription = (v: string) => patch({ description: v });
  const setDurationSeconds = (v: number) => patch({ durationSeconds: v });
  const setVideoUrl = (v: string) => patch({ videoUrl: v });
  const setTools = (v: string) => patch({ tools: v });
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [previewTopicId, setPreviewTopicId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [addTopicError, setAddTopicError] = useState<string | null>(null);
  const [justSavedTitle, setJustSavedTitle] = useState<string | null>(null);

  const addTopic = useMutation({
    mutationFn: () =>
      api.post<Topic>(`/tracks/modules/${moduleId}/topics`, {
        title,
        description: description.trim() || undefined,
        durationSeconds,
        // No video is a valid lesson — don't substitute a placeholder clip.
        videoUrl: videoUrl.trim() || undefined,
        tools: toolsToArray(tools),
        resources: cleanResources(resources),
        documentIds: documents.map((d) => d.id),
      }),
    onSuccess: (created) => {
      onChanged();
      // Open the new topic straight away so the author sees what they just saved.
      if (created?.id) setPreviewTopicId(created.id);
      setJustSavedTitle(title.trim());
      setAddTopicError(null);
      onDraftChange(EMPTY_DRAFT);
    },
    onError: (e) => {
      setJustSavedTitle(null);
      setAddTopicError(e instanceof ApiError ? e.message : 'Failed to add topic. Please try again.');
    },
  });

  const removeTopic = useMutation({
    mutationFn: (topicId: string) => api.delete(`/tracks/topics/${topicId}`),
    onSuccess: onChanged,
  });

  // Description is optional, but a half-typed one is still rejected.
  const topicDescTooShort = description.trim().length > 0 && description.trim().length < 5;
  const addResourceProblem = resourceProblem(resources);
  const canAddTopic = title.trim().length >= 3 && !topicDescTooShort && !addResourceProblem;

  return (
    <div className="border-t border-navy-100 p-4 space-y-4 bg-navy-50/40">
      {mod.description && (
        <div className="bg-white rounded-xl border border-navy-100 p-3">
          <p className="text-[12px] font-mono uppercase text-navy-400 font-bold mb-1">Module Description</p>
          <p className="text-xs text-navy-700 whitespace-pre-wrap">{mod.description}</p>
        </div>
      )}
      <div className="space-y-2">
        {mod.topics.map((topic) =>
          editingTopicId === topic.id ? (
            <TopicEditForm
              key={topic.id}
              topic={topic}
              onCancel={() => setEditingTopicId(null)}
              onSaved={() => {
                setEditingTopicId(null);
                // Show the saved result straight away, so the author can check the change.
                setPreviewTopicId(topic.id);
                onChanged();
              }}
            />
          ) : (
            <div key={topic.id} className="bg-white border border-navy-100 rounded-lg overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2">
                <button
                  onClick={() => setPreviewTopicId(previewTopicId === topic.id ? null : topic.id)}
                  aria-expanded={previewTopicId === topic.id}
                  aria-label={`${previewTopicId === topic.id ? 'Hide' : 'Show'} preview of topic "${topic.title}"`}
                  className="flex items-center gap-1.5 min-w-0 text-left group"
                >
                  <ChevronDown
                    className={cn(
                      'w-3.5 h-3.5 shrink-0 text-navy-400 transition-transform',
                      previewTopicId === topic.id && 'rotate-180',
                    )}
                  />
                  <span className="text-xs text-navy-950 truncate group-hover:text-crimson-600">{topic.title}</span>
                  <span className="text-[12px] text-navy-400 font-mono">{formatDuration(topic.durationSeconds)}</span>
                  {extrasSummary(topic) && <span className="text-[11px] text-navy-400 truncate">· {extrasSummary(topic)}</span>}
                </button>
                {/* Labelled rather than icon-only: bare grey icons were easy to miss, and
                    authors did not realise a saved topic could be previewed or changed. */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setPreviewTopicId(previewTopicId === topic.id ? null : topic.id)}
                    aria-expanded={previewTopicId === topic.id}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold hover:bg-navy-50',
                      previewTopicId === topic.id ? 'text-crimson-600' : 'text-navy-600 hover:text-navy-950',
                    )}
                  >
                    <Eye className="w-3.5 h-3.5" /> {previewTopicId === topic.id ? 'Hide preview' : 'Preview'}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmingDeleteId(null);
                      setEditingTopicId(topic.id);
                    }}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-navy-600 hover:text-navy-950 hover:bg-navy-50"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => setConfirmingDeleteId(topic.id)}
                    aria-label={`Delete topic "${topic.title}"`}
                    className="rounded-md p-1.5 text-navy-400 hover:text-crimson-600 hover:bg-crimson-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* A topic takes its uploaded documents with it when deleted, so ask first. */}
              {confirmingDeleteId === topic.id && (
                <div className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-crimson-200 bg-crimson-50 px-3 py-2">
                  <span className="text-xs font-semibold text-crimson-800">
                    Delete “{topic.title}” and its documents? This can&apos;t be undone.
                  </span>
                  <Button
                    size="sm"
                    loading={removeTopic.isPending}
                    onClick={() => removeTopic.mutate(topic.id, { onSuccess: () => setConfirmingDeleteId(null) })}
                  >
                    Delete
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmingDeleteId(null)}>
                    Keep
                  </Button>
                </div>
              )}
              {previewTopicId === topic.id && (
                <TopicPreview
                  topic={topic}
                  onEdit={() => {
                    setConfirmingDeleteId(null);
                    setEditingTopicId(topic.id);
                  }}
                />
              )}
            </div>
          ),
        )}
      </div>

      <div>
        <p className="text-[12px] font-mono uppercase text-navy-400 font-bold mb-2">Module Quiz</p>
        <ModuleQuizEditor mod={mod} trackId={trackId} />
      </div>

      <div className="bg-white rounded-xl border border-navy-200 p-3 space-y-2">
        <p className="text-[12px] font-mono uppercase text-navy-400 font-bold">Add Lesson Topic</p>
        <p className="text-[12px] text-navy-500">Only a title is required — everything else can be filled in later.</p>

        {justSavedTitle && (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            Saved “{justSavedTitle}” — it&apos;s in the list above, opened for preview.
          </p>
        )}
        {addTopicError && (
          <p className="text-[13px] font-semibold text-crimson-700 bg-crimson-50 border border-crimson-200 rounded-lg px-2.5 py-1.5">
            {addTopicError}
          </p>
        )}

        <div>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setJustSavedTitle(null); // starting a new topic — drop the previous confirmation
            }}
            placeholder="Topic title"
            className="input"
          />
          {title.length > 0 && title.trim().length < 3 && <p className="text-[12px] text-crimson-600 mt-1">Title needs at least 3 characters.</p>}
        </div>
        <div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Topic description (optional)"
            rows={3}
            className="input resize-y"
          />
          {topicDescTooShort && <p className="text-[12px] text-crimson-600 mt-1">Description needs at least 5 characters.</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
          <DurationInput value={durationSeconds} onChange={setDurationSeconds} />
          <input value={tools} onChange={(e) => setTools(e.target.value)} placeholder="Tools (comma separated)" className="input" />
        </div>
        <VideoSourceInput videoUrl={videoUrl} onVideoUrlChange={setVideoUrl} />
        <TopicExtrasFields
          documents={documents}
          onDocumentsChange={(next) => patch({ documents: next })}
          resources={resources}
          onResourcesChange={(next) => patch({ resources: next })}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" disabled={!canAddTopic} loading={addTopic.isPending} onClick={() => addTopic.mutate()}>
            <Plus className="w-3.5 h-3.5" /> Add Topic
          </Button>
          {/* Without this the button just sits greyed out with no stated reason. */}
          {!canAddTopic && (
            <span className="text-[12px] text-navy-400">
              {title.trim().length < 3
                ? 'Enter a topic title to enable this.'
                : topicDescTooShort
                  ? 'Finish or clear the description to enable this.'
                  : 'Finish or remove the unfinished link to enable this.'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** "2 documents · 3 links" — what a collapsed topic holds beyond its video, or null if nothing. */
function extrasSummary(topic: Topic): string | null {
  const docs = topic.documents?.length ?? 0;
  const links = topic.resources?.length ?? 0;
  const parts = [
    docs ? `${docs} document${docs === 1 ? '' : 's'}` : null,
    links ? `${links} link${links === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function TopicEditForm({ topic, onCancel, onSaved }: { topic: Topic; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(topic.title);
  const [description, setDescription] = useState(topic.description);
  const [durationSeconds, setDurationSeconds] = useState(topic.durationSeconds);
  const [videoUrl, setVideoUrl] = useState(topic.videoUrl);
  const [tools, setTools] = useState(topic.tools.join(', '));
  const [documents, setDocuments] = useState<UploadedFile[]>(
    (topic.documents ?? []).map((d) => ({ id: d.id, originalName: d.originalName, sizeBytes: d.sizeBytes, url: d.url })),
  );
  const [resources, setResources] = useState<ResourceRow[]>(topic.resources ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/tracks/topics/${topic.id}`, {
        title,
        description: description.trim(),
        durationSeconds,
        videoUrl,
        tools: toolsToArray(tools),
        resources: cleanResources(resources),
        // The full set, so a document removed here is removed from the lesson too.
        documentIds: documents.map((d) => d.id),
      }),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save topic.'),
  });

  // Mirrors the add form: title required, description optional but not half-written.
  const descTooShort = description.trim().length > 0 && description.trim().length < 5;
  const editResourceProblem = resourceProblem(resources);
  const canSave = title.trim().length >= 3 && !descTooShort && !editResourceProblem;

  return (
    <div className="bg-white border border-navy-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-mono uppercase text-navy-400 font-bold">Editing Topic</p>
        <button onClick={onCancel} aria-label="Cancel editing topic" className="text-navy-400 hover:text-navy-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="text-xs text-crimson-600">{error}</p>}
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Topic title" className="input" />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Topic description (optional)"
        rows={3}
        className="input resize-y"
      />
      {descTooShort && <p className="text-[12px] text-crimson-600">Description needs at least 5 characters.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
        <DurationInput value={durationSeconds} onChange={setDurationSeconds} />
        <input value={tools} onChange={(e) => setTools(e.target.value)} placeholder="Tools (comma separated)" className="input" />
      </div>
      <VideoSourceInput videoUrl={videoUrl} onVideoUrlChange={setVideoUrl} />
      <TopicExtrasFields
        documents={documents}
        onDocumentsChange={setDocuments}
        resources={resources}
        onResourcesChange={setResources}
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={!canSave} loading={save.isPending} onClick={() => save.mutate()}>
          Save Changes
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

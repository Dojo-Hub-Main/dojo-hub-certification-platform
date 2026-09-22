'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, X } from 'lucide-react';
import { CategoryDto, StoredFileKind, TrackAccess, TrackDifficulty, TrackSummaryDto } from '@dojo-hub/shared';
import { api, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { FileDropzone, type UploadedFile } from '@/components/student/FileDropzone';
import { EmojiPicker } from '@/components/admin/EmojiPicker';

export default function CurriculumProgramsPage() {
  const queryClient = useQueryClient();
  const { data: tracks = [], isLoading } = useQuery<TrackSummaryDto[]>({
    queryKey: ['tracks', 'admin'],
    queryFn: () => api.get<TrackSummaryDto[]>('/tracks/admin'),
  });
  const { data: categories = [] } = useQuery<CategoryDto[]>({ queryKey: ['categories'], queryFn: () => api.get<CategoryDto[]>('/categories') });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [difficulty, setDifficulty] = useState<TrackDifficulty>('BEGINNER');
  // Free opens as soon as a student enrols; paid waits for an administrator to approve.
  const [access, setAccess] = useState<TrackAccess>('FREE');
  const [durationWeeks, setDurationWeeks] = useState(8);
  const [icon, setIcon] = useState('📘');
  // Cover photo is optional — an empty list leaves the generated illustration in place.
  const [cover, setCover] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post('/tracks', { title, description, icon, categoryId, difficulty, access, durationWeeks, coverImageUrl: cover[0]?.url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tracks'] });
      setTitle('');
      setDescription('');
      setCover([]);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to create program.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/tracks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tracks'] }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 animate-fadeIn items-start">
      <Card className="p-6 space-y-4">
        <h3 className="font-bold text-navy-950">+ New Program</h3>
        <p className="text-xs text-navy-500">Define a new on-chain certification program pathway.</p>
        {error && <p className="text-xs text-crimson-600">{error}</p>}
        <Field label="Program Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="e.g. Cybersecurity Specialist Track" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
              <option value="">Select...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Weeks Duration">
            <input type="number" value={durationWeeks} onChange={(e) => setDurationWeeks(parseInt(e.target.value, 10) || 1)} className="input" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Difficulty">
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as TrackDifficulty)} className="input">
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
          </Field>
          <Field label="Launcher Emoji">
            <EmojiPicker value={icon} onChange={setIcon} />
          </Field>
        </div>
        <Field label="Enrolment">
          <select value={access} onChange={(e) => setAccess(e.target.value as TrackAccess)} className="input">
            <option value="FREE">Free — students start straight away</option>
            <option value="PAID">Paid — you approve each student</option>
          </select>
          <p className="mt-1 text-[12px] text-navy-400">
            No price is held here. For a paid course, students request a place and you approve them once payment is settled.
          </p>
        </Field>
        <Field label="Cover Photo (optional)">
          <FileDropzone kind={StoredFileKind.DOCUMENT} accept="image/*" files={cover} onChange={setCover} noun="an image" />
          <p className="mt-1 text-[12px] text-navy-400">
            A real photo makes the course card far more inviting. Leave blank to keep the generated artwork.
          </p>
        </Field>
        <Field label="Syllabus Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input" placeholder="Objectives and requirements scope of the program..." />
        </Field>
        <Button
          className="w-full"
          loading={create.isPending}
          disabled={!title || !categoryId || description.length < 10}
          onClick={() => {
            setError(null);
            create.mutate();
          }}
        >
          Deploy Program Path
        </Button>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold text-navy-950 mb-1">Active Certification Programs ({tracks.length})</h3>
        <p className="text-xs text-navy-500 mb-4">Manage high-level details and configure program parameters.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          {tracks.map((t) =>
            editingId === t.id ? (
              <ProgramEditForm
                key={t.id}
                track={t}
                categories={categories}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  queryClient.invalidateQueries({ queryKey: ['tracks'] });
                }}
              />
            ) : (
            <div key={t.id} className="border border-navy-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{t.icon}</span>
                <div className="flex gap-1.5">
                  <Badge tone={t.status === 'PUBLISHED' ? 'green' : 'amber'}>{t.status === 'PUBLISHED' ? 'Live' : 'Draft'}</Badge>
                  <Badge tone={t.access === 'PAID' ? 'red' : 'blue'}>{t.access === 'PAID' ? 'Paid' : 'Free'}</Badge>
                  <Badge tone="navy">{t.category.name}</Badge>
                </div>
              </div>
              <h4 className="font-bold text-sm text-navy-950">{t.title}</h4>
              <p className="text-xs text-navy-500 line-clamp-2">{t.description}</p>
              <p className="text-[12px] text-navy-400">
                {t.durationWeeks} Weeks duration • {t.difficulty}
              </p>
              <div className="flex gap-2 pt-1">
                <Link href={`/curriculum/${t.id}`} className="flex-1">
                  <Button size="sm" variant="dark" className="w-full">
                    Manage Courses
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`Edit program "${t.title}"`}
                  onClick={() => setEditingId(t.id)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Delete program "${t.title}"`}
                  onClick={() => {
                    if (confirm(`Delete "${t.title}" and all its content? This cannot be undone.`)) remove.mutate(t.id);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            ),
          )}
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500 block">{label}</label>
      {children}
    </div>
  );
}

/**
 * Inline editor for a program's own details. Modules and lessons are edited on the
 * dedicated Manage Courses screen; this covers everything else, including replacing
 * the cover photo on courses that were created before covers existed.
 */
function ProgramEditForm({
  track,
  categories,
  onCancel,
  onSaved,
}: {
  track: TrackSummaryDto;
  categories: CategoryDto[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [description, setDescription] = useState(track.description);
  const [categoryId, setCategoryId] = useState(track.category.id);
  const [difficulty, setDifficulty] = useState<TrackDifficulty>(track.difficulty);
  const [access, setAccess] = useState<TrackAccess>(track.access ?? 'FREE');
  const [durationWeeks, setDurationWeeks] = useState(track.durationWeeks);
  const [icon, setIcon] = useState(track.icon);
  const [cover, setCover] = useState<UploadedFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Existing photo stays unless a new one is uploaded or it is explicitly cleared.
  const [keepExisting, setKeepExisting] = useState(Boolean(track.coverImageUrl));
  const nextCover = cover[0]?.url ?? (keepExisting ? track.coverImageUrl : null);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/tracks/${track.id}`, {
        title,
        description,
        icon,
        categoryId,
        difficulty,
        access,
        durationWeeks,
        coverImageUrl: nextCover,
      }),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to save program.'),
  });

  const canSave = title.trim().length >= 3 && description.trim().length >= 10;

  return (
    <div className="border-2 border-crimson-500/40 rounded-xl p-4 space-y-3 bg-navy-50/40">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500">Editing Program</p>
        <button onClick={onCancel} aria-label="Cancel editing program" className="text-navy-400 hover:text-navy-800">
          <X className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="text-xs text-crimson-600">{error}</p>}

      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Program title" className="input" />

      <div className="grid grid-cols-2 gap-2">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category" className="input">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={durationWeeks}
          onChange={(e) => setDurationWeeks(parseInt(e.target.value, 10) || 1)}
          aria-label="Weeks duration"
          className="input"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as TrackDifficulty)}
          aria-label="Difficulty"
          className="input"
        >
          <option value="BEGINNER">Beginner</option>
          <option value="INTERMEDIATE">Intermediate</option>
          <option value="ADVANCED">Advanced</option>
        </select>
        <EmojiPicker value={icon} onChange={setIcon} />
      </div>

      <select
        value={access}
        onChange={(e) => setAccess(e.target.value as TrackAccess)}
        aria-label="Enrolment"
        className="input"
      >
        <option value="FREE">Free — students start straight away</option>
        <option value="PAID">Paid — you approve each student</option>
      </select>

      <div>
        <p className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500 mb-1">Cover Photo</p>
        {nextCover && cover.length === 0 && (
          <div className="mb-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- stored object URL */}
            <img src={nextCover} alt="Current cover" className="w-24 h-14 object-cover rounded-lg border border-navy-200" />
            <button onClick={() => setKeepExisting(false)} className="text-xs text-crimson-600 hover:underline">
              Remove photo
            </button>
          </div>
        )}
        <FileDropzone kind={StoredFileKind.DOCUMENT} accept="image/*" files={cover} onChange={setCover} noun="an image" />
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="Syllabus description"
        className="input resize-y"
      />

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={!canSave} loading={save.isPending} onClick={() => save.mutate()}>
          Save Changes
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

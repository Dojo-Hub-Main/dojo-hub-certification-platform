'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BookOpen, Clock, Mail, Plus, RotateCcw, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';

/**
 * Evaluator access, in one place: who evaluates which courses, and who has been invited
 * but has not accepted yet. Evaluator access starts only when an invitation is accepted,
 * so inviting is the only way to create one.
 */

type Course = { id: string; title: string; status: string; evaluatorCount: number };
type Evaluator = {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED';
  courses: { id: string; title: string; status: string }[];
};
type Invitation = {
  id: string;
  name: string;
  email: string;
  hasAccount: boolean;
  courses: { id: string; title: string }[];
  expiresAt: string;
  invitedAt: string;
};

export function EvaluatorAccessPanel() {
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ evaluators: Evaluator[]; courses: Course[] }>({
    queryKey: ['evaluators'],
    queryFn: () => api.get('/evaluators'),
  });
  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: ['evaluators', 'invitations'],
    queryFn: () => api.get('/evaluators/invitations'),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['evaluators'] });
    queryClient.invalidateQueries({ queryKey: ['users', 'directory'] });
  };
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

  const invite = useMutation({
    mutationFn: (body: { name: string; email: string; trackIds: string[] }) => api.post('/evaluators/invitations', body),
    onSuccess: () => {
      setInviting(false);
      setError(null);
      refresh();
    },
    onError: fail,
  });
  const resend = useMutation({
    mutationFn: (id: string) => api.post(`/evaluators/invitations/${id}/resend`),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.delete(`/evaluators/invitations/${id}`),
    onSuccess: refresh,
    onError: fail,
  });
  const setCourses = useMutation({
    mutationFn: ({ id, trackIds }: { id: string; trackIds: string[] }) => api.patch(`/evaluators/${id}/courses`, { trackIds }),
    onSuccess: () => {
      setEditing(null);
      setError(null);
      refresh();
    },
    onError: fail,
  });

  const courses = data?.courses ?? [];
  const evaluators = data?.evaluators ?? [];
  const uncovered = courses.filter((c) => c.evaluatorCount === 0 && c.status === 'PUBLISHED');

  return (
    <Card className="p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-navy-950">Evaluator access</h2>
          <p className="text-sm text-navy-500 mt-0.5">
            Invite evaluators and choose the courses each one reviews. Access begins when they accept their invitation.
          </p>
        </div>
        <Button size="sm" onClick={() => { setInviting((v) => !v); setError(null); }}>
          <Plus className="w-3.5 h-3.5" /> Invite evaluator
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-crimson-700 bg-crimson-50 border border-crimson-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {inviting && (
        <InviteForm
          courses={courses}
          pending={invite.isPending}
          onCancel={() => setInviting(false)}
          onSubmit={(body) => invite.mutate(body)}
        />
      )}

      {uncovered.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            <span className="font-semibold">No evaluator on {uncovered.length} published course{uncovered.length === 1 ? '' : 's'}:</span>{' '}
            {uncovered.map((c) => c.title).join(', ')}. Submissions there are reviewed by administrators.
          </p>
        </div>
      )}

      {/* --------------------------------------------------------- invitations */}
      {invitations.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500">
            Invited, not yet accepted
          </h3>
          <ul className="divide-y divide-navy-100 rounded-xl border border-navy-200 overflow-hidden">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3 bg-white">
                <Mail className="w-4 h-4 text-navy-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy-950 truncate">
                    {i.name} <span className="font-normal text-navy-500">· {i.email}</span>
                  </p>
                  <p className="text-xs text-navy-500 truncate">
                    {i.courses.map((c) => c.title).join(', ') || 'No course'} ·{' '}
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" /> expires {new Date(i.expiresAt).toLocaleDateString()}
                    </span>
                    {i.hasAccount && ' · adds to an existing account'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" loading={resend.isPending} onClick={() => resend.mutate(i.id)}>
                    <RotateCcw className="w-3.5 h-3.5" /> Resend
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={cancel.isPending}
                    onClick={() => {
                      if (confirm(`Cancel the invitation to ${i.email}? Their link will stop working.`)) cancel.mutate(i.id);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --------------------------------------------------------- evaluators */}
      <section className="space-y-2">
        <h3 className="text-[12px] font-mono uppercase tracking-wider font-bold text-navy-500">
          Evaluators and their courses
        </h3>
        {isLoading && <p className="text-sm text-navy-400">Loading…</p>}
        {!isLoading && evaluators.length === 0 && (
          <p className="text-sm text-navy-500">
            No evaluators yet. Use <span className="font-semibold">Invite evaluator</span> to add the first one.
          </p>
        )}
        <ul className="space-y-2">
          {evaluators.map((e) => (
            <li key={e.id} className="rounded-xl border border-navy-200 bg-white overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy-950 truncate">
                    {e.name} <span className="font-normal text-navy-500">· {e.email}</span>
                    {e.status === 'SUSPENDED' && (
                      <Badge tone="red" className="ml-2">
                        Suspended
                      </Badge>
                    )}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-navy-500 mt-0.5">
                    <BookOpen className="w-3 h-3 shrink-0" />
                    {e.courses.length > 0 ? e.courses.map((c) => c.title).join(', ') : 'No course assigned — sees nothing to review'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setError(null);
                    setEditing(editing === e.id ? null : e.id);
                  }}
                >
                  {editing === e.id ? 'Close' : 'Change courses'}
                </Button>
              </div>

              {editing === e.id && (
                <CoursePicker
                  courses={courses}
                  selected={e.courses.map((c) => c.id)}
                  pending={setCourses.isPending}
                  onCancel={() => setEditing(null)}
                  onSave={(trackIds) => setCourses.mutate({ id: e.id, trackIds })}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}

function InviteForm({
  courses,
  pending,
  onCancel,
  onSubmit,
}: {
  courses: Course[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: { name: string; email: string; trackIds: string[] }) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [trackIds, setTrackIds] = useState<string[]>([]);

  const ready = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email) && trackIds.length > 0;

  return (
    <form
      className="rounded-xl border border-navy-200 bg-navy-50/60 p-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name: name.trim(), email: email.trim(), trackIds });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-navy-500">Full name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input text-sm py-2" placeholder="e.g. Grace Nakato" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-navy-500">Email address</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input text-sm py-2"
            placeholder="name@example.com"
          />
        </label>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-[11px] font-mono uppercase tracking-wider font-bold text-navy-500">
          Courses they will review
        </legend>
        <CourseCheckboxes courses={courses} selected={trackIds} onChange={setTrackIds} />
      </fieldset>

      <p className="text-xs text-navy-500">
        They get an email to {email.trim() ? email.trim() : 'this address'}. If it already has an account, evaluator access is
        added to it — no second account.
      </p>

      <div className="flex gap-2">
        <Button size="sm" type="submit" loading={pending} disabled={!ready}>
          Send invitation
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {!ready && <span className="text-xs text-navy-400 self-center">Name, email and at least one course are needed.</span>}
      </div>
    </form>
  );
}

function CoursePicker({
  courses,
  selected,
  pending,
  onCancel,
  onSave,
}: {
  courses: Course[];
  selected: string[];
  pending: boolean;
  onCancel: () => void;
  onSave: (trackIds: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  return (
    <div className="border-t border-navy-100 bg-navy-50/60 p-3.5 space-y-3">
      <CourseCheckboxes courses={courses} selected={picked} onChange={setPicked} />
      <div className="flex flex-wrap gap-2 items-center">
        <Button size="sm" loading={pending} onClick={() => onSave(picked)}>
          Save courses
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {picked.length === 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-800">
            <AlertTriangle className="w-3.5 h-3.5" /> With no course they will have nothing to review.
          </span>
        )}
      </div>
    </div>
  );
}

function CourseCheckboxes({
  courses,
  selected,
  onChange,
}: {
  courses: Course[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  if (courses.length === 0) return <p className="text-xs text-navy-500">No courses exist yet.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {courses.map((c) => {
        const on = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onChange(on ? selected.filter((id) => id !== c.id) : [...selected, c.id])}
            className={
              on
                ? 'inline-flex items-center gap-1.5 rounded-full border border-crimson-500 bg-crimson-50 px-3 py-1 text-xs font-semibold text-crimson-700'
                : 'inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-white px-3 py-1 text-xs font-semibold text-navy-600 hover:border-navy-400'
            }
          >
            {c.title}
            {c.status !== 'PUBLISHED' && <span className="text-[10px] font-mono uppercase text-navy-400">draft</span>}
            {on && <X className="w-3 h-3" />}
          </button>
        );
      })}
    </div>
  );
}

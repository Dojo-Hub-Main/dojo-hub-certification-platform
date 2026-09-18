'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Search } from 'lucide-react';
import { SubmissionDto, UserRole } from '@dojo-hub/shared';
import { api, ApiError } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { Skeleton } from '@/components/ui/Skeleton';
import { SubmissionReviewPanel } from '@/components/evaluator/SubmissionReviewPanel';
import { EvaluatorAccessPanel } from '@/components/admin/EvaluatorAccessPanel';

interface DirectoryEntry {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roles?: UserRole[];
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  studentProfile?: { currentLevel: { name: string } } | null;
  stats: { certificates?: number; cumulativeEnrollments?: number; activeEnrollments?: number; evaluationsDone?: number; pendingPlatformWide?: number };
}

const ROLE_OPTIONS = [
  { value: UserRole.STUDENT, label: 'Disciple Candidates' },
  { value: UserRole.EVALUATOR, label: 'Senior Supervisors' },
  { value: UserRole.ADMIN, label: 'Platform Admins' },
];

/** Matches the labels used in the sidebar and in the emails the API sends. */
const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.EVALUATOR]: 'Senior Supervisor',
  [UserRole.ADMIN]: 'Platform Admin',
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { user: me } = useAuth();
  const [role, setRole] = useState<UserRole>(UserRole.STUDENT);
  const [search, setSearch] = useState('');

  const { data: users = [], isLoading } = useQuery<DirectoryEntry[]>({
    queryKey: ['users', 'directory', role, search],
    queryFn: () => api.get<DirectoryEntry[]>(`/users?role=${role}&search=${encodeURIComponent(search)}`),
  });

  // Roles are a set now: adding one keeps the others, and removing one leaves the rest.
  const addRole = useMutation({
    mutationFn: ({ id, role: added }: { id: string; role: UserRole }) => api.post(`/users/${id}/roles`, { role: added }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'directory'] }),
    onError: (e) => alert(e instanceof ApiError ? e.message : 'Failed to add access.'),
  });
  const removeRole = useMutation({
    mutationFn: ({ id, role: removed }: { id: string; role: UserRole }) => api.delete(`/users/${id}/roles/${removed}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'directory'] }),
    onError: (e) => alert(e instanceof ApiError ? e.message : 'Failed to remove access.'),
  });
  const rolesOf = (u: DirectoryEntry) => (u.roles?.length ? u.roles : [u.role]);

  const changeEmail = useMutation({
    mutationFn: ({ id, email }: { id: string; email: string }) =>
      api.patch(`/users/${id}/email`, { email }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'directory'] }),
    onError: (e) => alert(e instanceof ApiError ? e.message : 'Failed to change email.'),
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/suspend`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'directory'] }),
  });
  const reactivate = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/reactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'directory'] }),
  });
  // No self-service reset exists yet, so an admin setting a password is the only
  // recovery route for someone locked out of their account.
  const resetPassword = useMutation({
    mutationFn: ({ id, newPassword }: { id: string; newPassword: string }) =>
      api.patch(`/users/${id}/password`, { newPassword }),
    onSuccess: () => alert('Password updated. Give the new password to the user — they can change it later under Profile & Settings.'),
    onError: (e) => alert(e instanceof ApiError ? e.message : 'Failed to reset password.'),
  });

  const terminate = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/terminate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users', 'directory'] }),
    onError: (e) => alert(e instanceof ApiError ? e.message : 'Failed to terminate account.'),
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-950 tracking-tight">Dojo User Governance</h1>
          <p className="text-sm text-navy-500 mt-1">Manage student and supervisor accounts and access permissions.</p>
        </div>
        <div className="relative w-full sm:w-72">
          {/* input-icon, not pl-10 — a pl-* utility ties on specificity with `.input`
              and loses on source order, dropping the text back under the icon. */}
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..." className="input input-icon" />
        </div>
      </div>

      <SlidingTabs options={ROLE_OPTIONS} value={role} onChange={setRole} />

      <Card className="overflow-hidden">
        {isLoading && (
          <div className="divide-y divide-black/[0.05]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-6">
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/4" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
                <Skeleton className="h-2.5 w-16 hidden sm:block" />
                <Skeleton className="h-2.5 w-24 hidden sm:block" />
                <Skeleton className="h-7 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        )}
        {!isLoading && (
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-[12px] font-mono uppercase text-navy-400">
            <tr>
              <th className="text-left px-6 py-3">Name &amp; Contact</th>
              <th className="text-left px-6 py-3">Joined</th>
              <th className="text-left px-6 py-3">Stats</th>
              <th className="text-right px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.05]">
            {users.map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-black/[0.015]">
                <td className="px-6 py-4">
                  <p className="font-bold text-navy-950">{u.name}</p>
                  <p className="text-xs text-navy-500">{u.email}</p>
                  {u.status === 'SUSPENDED' && (
                    <Badge tone="red" className="mt-1">
                      Suspended
                    </Badge>
                  )}
                </td>
                <td className="px-6 py-4 text-xs text-navy-500 font-mono">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-xs text-navy-600 space-y-0.5">
                  {role === 'ADMIN' ? (
                    <p className="text-navy-400">Authors courses and manages accounts.</p>
                  ) : role === 'STUDENT' ? (
                    <>
                      <p>
                        Level: <strong className="text-navy-950">{u.studentProfile?.currentLevel.name}</strong>
                      </p>
                      <p>Certificates: {u.stats.certificates ?? 0}</p>
                      <p>
                        Enrollments: {u.stats.activeEnrollments ?? 0} active / {u.stats.cumulativeEnrollments ?? 0} total
                      </p>
                    </>
                  ) : (
                    <>
                      <p>Evaluations completed: {u.stats.evaluationsDone ?? 0}</p>
                      <p>
                        Pending in platform queue: <strong className="text-navy-950">{u.stats.pendingPlatformWide ?? 0}</strong>
                      </p>
                    </>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2 flex-wrap">
                    {/* Each account holds a set of roles. Student and Admin can be added here;
                        Evaluator is given through an invitation the person accepts, so it can
                        only be removed here. The API enforces the same rules. */}
                    <div className="flex items-center gap-1.5 flex-wrap justify-end" aria-label={`Access for ${u.name}`}>
                      {rolesOf(u).map((held) => {
                        const own = u.id === me?.id && held === UserRole.ADMIN;
                        const only = rolesOf(u).length === 1;
                        return (
                          <span
                            key={held}
                            className="inline-flex items-center gap-1 rounded-full border border-navy-200 bg-navy-50 pl-2.5 pr-1 py-0.5 text-[12px] font-semibold text-navy-800"
                          >
                            {ROLE_LABEL[held]}
                            <button
                              type="button"
                              aria-label={`Remove ${ROLE_LABEL[held]} access from ${u.name}`}
                              disabled={own || only || removeRole.isPending}
                              title={
                                own
                                  ? 'You cannot remove your own administrator access'
                                  : only
                                    ? 'An account needs at least one role'
                                    : `Remove ${ROLE_LABEL[held]} access`
                              }
                              onClick={() => {
                                if (
                                  confirm(
                                    `Remove ${ROLE_LABEL[held]} access from ${u.name} (${u.email})?\n\n` +
                                      `Their other access stays as it is.`,
                                  )
                                ) {
                                  removeRole.mutate({ id: u.id, role: held });
                                }
                              }}
                              className="w-5 h-5 rounded-full flex items-center justify-center text-navy-400 hover:text-crimson-600 hover:bg-crimson-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-navy-400 disabled:cursor-not-allowed"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                      {[UserRole.STUDENT, UserRole.ADMIN]
                        .filter((r) => !rolesOf(u).includes(r))
                        .map((missing) => (
                          <button
                            key={missing}
                            type="button"
                            disabled={addRole.isPending || u.status === 'SUSPENDED'}
                            onClick={() => {
                              if (
                                confirm(
                                  `Give ${u.name} (${u.email}) ${ROLE_LABEL[missing]} access?\n\n` +
                                    `They keep the access they already have and can switch workspace from their account menu.` +
                                    (missing === UserRole.ADMIN
                                      ? '\n\nPlatform Admins can create courses and manage every account.'
                                      : ''),
                                )
                              ) {
                                addRole.mutate({ id: u.id, role: missing });
                              }
                            }}
                            className="rounded-full border border-dashed border-navy-300 px-2.5 py-0.5 text-[12px] font-semibold text-navy-500 hover:border-crimson-400 hover:text-crimson-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            + {ROLE_LABEL[missing]}
                          </button>
                        ))}
                    </div>

                    {!rolesOf(u).includes(UserRole.ADMIN) && (u.status === 'ACTIVE' ? (
                      <Button size="sm" variant="secondary" loading={suspend.isPending} onClick={() => suspend.mutate(u.id)}>
                        Suspend
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" loading={reactivate.isPending} onClick={() => reactivate.mutate(u.id)}>
                        Reactivate
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      loading={changeEmail.isPending}
                      onClick={() => {
                        const next = prompt(
                          `New email address for ${u.name} (currently ${u.email}).`
                            + '\n\n'
                            + `A confirmation link is sent to the new address, and the account cannot sign in until it is confirmed. Records and history are unaffected.`,
                          u.email,
                        );
                        if (next === null) return;
                        const email = next.trim();
                        if (!email || email === u.email) return;
                        changeEmail.mutate({ id: u.id, email });
                      }}
                    >
                      Change Email
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={resetPassword.isPending}
                      onClick={() => {
                        const newPassword = prompt(
                          `Set a new password for ${u.name} (${u.email}).

Minimum 8 characters. Share it with them directly — it is not emailed.`,
                        );
                        if (newPassword === null) return;
                        if (newPassword.trim().length < 8) {
                          alert('Password must be at least 8 characters.');
                          return;
                        }
                        resetPassword.mutate({ id: u.id, newPassword: newPassword.trim() });
                      }}
                    >
                      Reset Password
                    </Button>
                    {!rolesOf(u).includes(UserRole.ADMIN) && (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={terminate.isPending}
                        onClick={() => {
                          if (confirm(`Permanently terminate ${u.name}'s account? This cannot be undone.`)) terminate.mutate(u.id);
                        }}
                      >
                        Terminate
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
        {!isLoading && users.length === 0 && <p className="p-6 text-sm text-navy-400 text-center">No accounts found.</p>}
      </Card>

      {role === UserRole.EVALUATOR && <EvaluatorAccessPanel />}
      {role === UserRole.EVALUATOR && <PendingQueuePanel />}
    </div>
  );
}

function PendingQueuePanel() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: submissions = [], isLoading } = useQuery<(SubmissionDto & { student?: { name: string; email: string } })[]>({
    queryKey: ['submissions', 'queue', 'PENDING'],
    queryFn: () => api.get('/submissions/queue?status=PENDING'),
    refetchInterval: 20_000,
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-bold text-navy-950 uppercase tracking-wide">Platform Pending Queue</h2>
        {submissions.length > 0 && (
          <span className="w-5 h-5 rounded-full bg-crimson-600 text-white text-[12px] font-bold flex items-center justify-center">
            {submissions.length}
          </span>
        )}
      </div>
      <p className="text-xs text-navy-500 mb-4 -mt-2">
        Any supervisor can pick up work from this shared queue. As an admin, you can review and decide on any of it directly.
      </p>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      )}

      {!isLoading && submissions.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-sm text-navy-400">The queue is empty — nothing pending review right now.</p>
        </Card>
      )}

      <div className="space-y-3">
        {submissions.map((sub) => (
          <Card key={sub.id} className="overflow-hidden">
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-navy-800 to-navy-950 text-white flex items-center justify-center text-xs font-bold shrink-0 ring-2 ring-white shadow-sm">
                  {sub.student?.name.split(' ').map((n) => n[0]).join('') ?? '??'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-navy-950 truncate">{sub.student?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-navy-500 truncate">{sub.title}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Badge tone={sub.type === 'CAPSTONE' ? 'red' : 'blue'}>{sub.type === 'CAPSTONE' ? 'Capstone' : 'Topic Unit'}</Badge>
                <span className="text-[12px] text-navy-400 hidden sm:inline font-mono">{new Date(sub.submittedAt).toLocaleDateString()}</span>
                <Button size="sm" variant={expandedId === sub.id ? 'dark' : 'outline'} onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}>
                  <ClipboardCheck className="w-3.5 h-3.5" /> Review
                </Button>
              </div>
            </div>
            {expandedId === sub.id && <SubmissionReviewPanel submission={sub} />}
          </Card>
        ))}
      </div>
    </div>
  );
}

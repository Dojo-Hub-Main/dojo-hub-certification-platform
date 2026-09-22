'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Clock, Mail, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Students waiting for a place on a paid course. Payment is arranged off the platform;
 * approving here is what actually opens the lessons and emails the student.
 */

type Request = {
  id: string;
  requestedAt: string;
  student: { id: string; name: string; email: string };
  course: { id: string; title: string; access: string };
};

function waitingFor(iso: string): string {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function EnrolmentRequestsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const { data: requests = [], isLoading } = useQuery<Request[]>({
    queryKey: ['enrolment-requests'],
    queryFn: () => api.get<Request[]>('/enrollments/requests'),
    refetchInterval: 60_000,
  });

  const done = () => {
    setError(null);
    setDecliningId(null);
    setReason('');
    queryClient.invalidateQueries({ queryKey: ['enrolment-requests'] });
  };
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/enrollments/requests/${id}/approve`),
    onSuccess: done,
    onError: fail,
  });
  const decline = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) =>
      api.post(`/enrollments/requests/${id}/decline`, { reason: why }),
    onSuccess: done,
    onError: fail,
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-950 tracking-tight">Enrolment requests</h1>
        <p className="text-sm text-navy-500 mt-1">
          Students waiting for a place on a paid course. Take payment as you normally do, then approve them here —
          that opens the lessons and emails them.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-crimson-700 bg-crimson-50 border border-crimson-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {isLoading && (
        <Card className="p-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </Card>
      )}

      {!isLoading && requests.length === 0 && (
        <Card className="p-10 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto" />
          <p className="mt-3 font-bold text-navy-950">Nothing waiting</p>
          <p className="text-sm text-navy-500 mt-1">
            Requests appear here as soon as a student asks to join a paid course.
          </p>
        </Card>
      )}

      {!isLoading && requests.length > 0 && (
        <Card className="divide-y divide-navy-100 overflow-hidden">
          {requests.map((r) => (
            <div key={r.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-navy-950">{r.student.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-navy-500">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <a href={`mailto:${r.student.email}`} className="hover:text-crimson-600 truncate">
                      {r.student.email}
                    </a>
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-navy-700 mt-1.5">
                    <BookOpen className="w-4 h-4 text-crimson-600 shrink-0" />
                    {r.course.title}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone="amber">
                    <Clock className="w-3 h-3" /> Asked {waitingFor(r.requestedAt)}
                  </Badge>
                  <div className="flex gap-2">
                    <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(r.id)}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setError(null);
                        setReason('');
                        setDecliningId(decliningId === r.id ? null : r.id);
                      }}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Decline
                    </Button>
                  </div>
                </div>
              </div>

              {decliningId === r.id && (
                <div className="rounded-xl border border-navy-200 bg-navy-50/60 p-3 space-y-2">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-navy-500">
                      Reason (optional — the student is told)
                    </span>
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="input text-sm py-2"
                      placeholder="e.g. We could not find your payment"
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      loading={decline.isPending}
                      onClick={() => decline.mutate({ id: r.id, why: reason })}
                    >
                      Decline this request
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDecliningId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

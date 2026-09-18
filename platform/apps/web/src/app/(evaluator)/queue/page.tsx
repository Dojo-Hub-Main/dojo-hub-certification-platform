'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, ClipboardCheck, Clock, RotateCcw } from 'lucide-react';
import { SubmissionDto, SubmissionStatus } from '@dojo-hub/shared';
import { api, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SlidingTabs } from '@/components/ui/SlidingTabs';
import { SubmissionReviewPanel } from '@/components/evaluator/SubmissionReviewPanel';
import { SkeletonRow } from '@/components/ui/Skeleton';

interface QuizAttemptPending {
  id: string;
  userId: string;
  objectiveScore: number;
  objectiveTotal: number;
  subjectiveAnswerText: string | null;
  moduleQuiz?: { title: string } | null;
  trackAssessment?: { title: string } | null;
}

/** "3 hours ago" style stamp — makes recency scannable without parsing dates. */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

interface QueueStats {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
  gradedToday: number;
  oldestPendingAt: string | null;
}

const TILE_TONES = {
  amber: 'bg-amber-50 border-amber-200 text-amber-700',
  green: 'bg-green-50 border-green-200 text-green-700',
  red: 'bg-crimson-50 border-crimson-200 text-crimson-700',
  navy: 'bg-navy-50 border-navy-200 text-navy-700',
} as const;

function StatTile({
  label,
  value,
  tone,
  icon,
  hint,
  onClick,
}: {
  label: string;
  value: number;
  tone: keyof typeof TILE_TONES;
  icon: React.ReactNode;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-2xl border border-black/[0.06] p-4 hover:border-crimson-300 hover:shadow-md transition-all"
    >
      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border ${TILE_TONES[tone]}`}>
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-3xl font-extrabold text-navy-950 mt-3">{value}</p>
      <p className="text-xs text-navy-500 mt-1">{hint}</p>
    </button>
  );
}

const FILTER_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All Submissions' },
] as const;

export default function EvaluatorQueuePage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<SubmissionStatus | 'ALL'>('PENDING');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: submissions = [], isLoading } = useQuery<(SubmissionDto & { student?: { name: string; email: string } })[]>({
    queryKey: ['submissions', 'queue', filter],
    queryFn: () => api.get(`/submissions/queue${filter === 'ALL' ? '' : `?status=${filter}`}`),
    refetchInterval: 20_000,
  });

  const { data: pendingQuizzes = [] } = useQuery<QuizAttemptPending[]>({
    queryKey: ['quizzes', 'pending'],
    queryFn: () => api.get<QuizAttemptPending[]>('/quizzes/attempts/pending'),
  });

  // Which courses this evaluator covers — the queue below shows only these.
  const { data: myCourses = [] } = useQuery<{ id: string; title: string }[]>({
    queryKey: ['evaluators', 'my-courses'],
    queryFn: () => api.get<{ id: string; title: string }[]>('/evaluators/my-courses'),
  });

  const { data: stats } = useQuery<QueueStats>({
    queryKey: ['submissions', 'queue', 'stats'],
    queryFn: () => api.get<QueueStats>('/submissions/queue/stats'),
    refetchInterval: 20_000,
  });

  return (
    <div className="space-y-8 animate-fadeIn">
      <Card className="relative overflow-hidden p-6 flex items-center justify-between bg-gradient-to-br from-navy-950 to-navy-900 border-navy-900">
        <div className="absolute -top-20 -right-10 w-56 h-56 bg-crimson-600/20 blur-3xl rounded-full pointer-events-none" />
        <div className="relative">
          <Badge tone="red">Operational Terminal</Badge>
          <h1 className="text-2xl font-extrabold text-white mt-2 tracking-tight">Dojo Evaluation Hub &amp; Review Pipeline</h1>
          <p className="text-sm text-navy-300">Process student coursework validations and audit evidence.</p>
          <p className="text-xs text-navy-400 mt-2 max-w-xl">
            {myCourses.length > 0 ? (
              <>
                Your courses: <span className="text-navy-200 font-semibold">{myCourses.map((c) => c.title).join(', ')}</span>
              </>
            ) : (
              'You have no courses assigned yet, so nothing appears here. Ask an administrator to assign your courses.'
            )}
          </p>
        </div>
        <Badge tone="red" className="relative text-sm px-3.5 py-2">
          {stats?.pending ?? 0} Awaiting Review
        </Badge>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Awaiting Review"
          value={stats?.pending ?? 0}
          tone="amber"
          icon={<Clock className="w-5 h-5" />}
          hint={stats?.oldestPendingAt ? `Oldest waiting since ${new Date(stats.oldestPendingAt).toLocaleDateString()}` : 'Queue is clear'}
          onClick={() => setFilter('PENDING')}
        />
        <StatTile
          label="Approved"
          value={stats?.approved ?? 0}
          tone="green"
          icon={<CheckCircle2 className="w-5 h-5" />}
          hint="Passed competencies"
          onClick={() => setFilter('APPROVED')}
        />
        <StatTile
          label="Revisions Requested"
          value={stats?.rejected ?? 0}
          tone="red"
          icon={<RotateCcw className="w-5 h-5" />}
          hint="Sent back to students"
          onClick={() => setFilter('REJECTED')}
        />
        <StatTile
          label="Graded Today"
          value={stats?.gradedToday ?? 0}
          tone="navy"
          icon={<Activity className="w-5 h-5" />}
          hint={`${stats?.total ?? 0} submissions all-time`}
          onClick={() => setFilter('ALL')}
        />
      </div>

      <div>
        <SlidingTabs options={[...FILTER_OPTIONS]} value={filter} onChange={setFilter} className="mb-4" />

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-0">
                <SkeletonRow />
              </Card>
            ))}
          </div>
        )}
        <div className="space-y-3">
          {submissions.map((sub, i) => (
            <Card key={sub.id} className="overflow-hidden">
              <div className="flex items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-navy-800 to-navy-950 text-white flex items-center justify-center text-sm font-bold shrink-0 ring-2 ring-white shadow-sm">
                    {sub.student?.name.split(' ').map((n) => n[0]).join('') ?? '??'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold text-navy-950 truncate">{sub.student?.name ?? 'Unknown'}</p>
                      {i === 0 && sub.status === 'PENDING' && filter === 'PENDING' && <Badge tone="amber">Newest</Badge>}
                    </div>
                    <p className="text-sm text-navy-600 truncate">{sub.title}</p>
                    <p className="text-xs text-navy-400 mt-0.5">{relativeTime(sub.submittedAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge tone={sub.type === 'CAPSTONE' ? 'red' : 'blue'}>{sub.type === 'CAPSTONE' ? 'Capstone' : 'Module Work'}</Badge>
                  {sub.status !== 'PENDING' && <Badge tone={sub.status === 'APPROVED' ? 'green' : 'red'}>{sub.status}</Badge>}
                  <span className="text-xs text-navy-400 hidden lg:inline font-mono whitespace-nowrap">
                    {new Date(sub.submittedAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <Button size="sm" variant={expandedId === sub.id ? 'dark' : 'outline'} onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}>
                    <ClipboardCheck className="w-4 h-4" /> Review
                  </Button>
                </div>
              </div>
              {expandedId === sub.id && <SubmissionReviewPanel submission={sub} />}
            </Card>
          ))}
          {!isLoading && submissions.length === 0 && (
            <Card className="py-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="text-base font-bold text-navy-950">
                {filter === 'PENDING' ? "You're all caught up" : 'Nothing here yet'}
              </p>
              <p className="text-sm text-navy-500 mt-1">
                {filter === 'PENDING'
                  ? 'No submissions are waiting for review. New ones appear at the top automatically.'
                  : 'No submissions match this filter.'}
              </p>
            </Card>
          )}
        </div>
      </div>

      {pendingQuizzes.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-navy-950 mb-3 uppercase tracking-wide">Pending Written-Assessment Grading</h2>
          <div className="space-y-3">
            {pendingQuizzes.map((attempt) => (
              <QuizGradeRow key={attempt.id} attempt={attempt} onGraded={() => queryClient.invalidateQueries({ queryKey: ['quizzes', 'pending'] })} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuizGradeRow({ attempt, onGraded }: { attempt: QuizAttemptPending; onGraded: () => void }) {
  const [score, setScore] = useState(85);
  const [feedback, setFeedback] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grade = useMutation({
    mutationFn: () => api.patch(`/quizzes/attempts/${attempt.id}/grade`, { score, feedback }),
    onSuccess: onGraded,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Failed to grade.'),
  });

  const title = attempt.moduleQuiz?.title ?? attempt.trackAssessment?.title ?? 'Assessment';

  return (
    <Card className="p-4">
      <button className="w-full flex items-center justify-between text-left cursor-pointer" onClick={() => setOpen(!open)}>
        <div>
          <p className="text-sm font-bold text-navy-950">{title}</p>
          <p className="text-xs text-navy-500">
            Objective: {attempt.objectiveScore}/{attempt.objectiveTotal}
          </p>
        </div>
        <Badge tone="blue">Pending</Badge>
      </button>
      {open && (
        <div className="mt-4 space-y-3 animate-fadeIn">
          <p className="text-xs bg-navy-50 p-3 rounded-lg text-navy-700">{attempt.subjectiveAnswerText}</p>
          <div>
            <div className="flex justify-between text-[12px] text-navy-400 mb-1 font-mono">
              <span>0%</span>
              <span className="font-bold text-navy-950">{score}%</span>
              <span>100%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={score}
              onChange={(e) => setScore(parseInt(e.target.value, 10))}
              aria-label="Assessment score percentage"
              className="w-full accent-crimson-600"
            />
          </div>
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Feedback..." className="w-full input" />
          {error && <p className="text-xs text-crimson-600">{error}</p>}
          <Button
            size="sm"
            loading={grade.isPending}
            onClick={() => {
              if (feedback.trim().length < 5) return setError('Feedback is required.');
              grade.mutate();
            }}
          >
            Submit Grade
          </Button>
        </div>
      )}
    </Card>
  );
}

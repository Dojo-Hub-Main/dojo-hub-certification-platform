'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Award, ChevronLeft, Lock } from 'lucide-react';
import { AttemptTargetType, CredentialDto, SubmissionDto, TopicProgressDto, TrackDto } from '@dojo-hub/shared';
import { api } from '@/lib/api-client';
import { useMyEnrollments } from '@/lib/hooks';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { UpNext, VideoPlayer } from './VideoPlayer';
import { LessonResources } from './LessonResources';
import { SubmissionWorkspace } from './SubmissionWorkspace';
import { SyllabusPanel } from './SyllabusPanel';
import { AssessmentWizard } from './AssessmentWizard';
import { Modal } from '../ui/Modal';
import { Skeleton, SkeletonRow } from '../ui/Skeleton';

export function CoursePlayer({ trackId }: { trackId: string }) {
  const queryClient = useQueryClient();
  const { data: track, isLoading } = useQuery<TrackDto>({ queryKey: ['track', trackId], queryFn: () => api.get<TrackDto>(`/tracks/${trackId}`) });
  const { data: enrollments = [] } = useMyEnrollments();
  const enrollment = enrollments.find((e) => e.trackId === trackId);

  const { data: progress = [] } = useQuery<TopicProgressDto[]>({
    queryKey: ['progress', trackId],
    queryFn: () => api.get<TopicProgressDto[]>(`/progress/tracks/${trackId}`),
  });
  const watchedIds = new Set(progress.filter((p) => p.watched).map((p) => p.topicId));

  const { data: submissions = [] } = useQuery<SubmissionDto[]>({
    queryKey: ['submissions', 'mine'],
    queryFn: () => api.get<SubmissionDto[]>('/submissions/mine'),
  });

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [confirmUnenroll, setConfirmUnenroll] = useState(false);
  const [quizModal, setQuizModal] = useState<{ type: AttemptTargetType; fetchParam: string } | null>(null);
  // Set only when a lesson is reached by finishing the one before it, so that lesson starts
  // playing by itself; choosing a lesson from the syllabus leaves the student to press play.
  const [autoPlayTopicId, setAutoPlayTopicId] = useState<string | null>(null);

  const allTopics = track?.modules.flatMap((m) => m.topics) ?? [];
  const topiclessModules = track?.modules.filter((m) => m.topics.length === 0) ?? [];

  const selectedModule = selectedModuleId ? (topiclessModules.find((m) => m.id === selectedModuleId) ?? null) : null;
  const defaultTopic = allTopics.find((t) => !watchedIds.has(t.id)) ?? allTopics[0] ?? null;
  const selectedTopic = selectedModule
    ? null
    : ((selectedTopicId ? allTopics.find((t) => t.id === selectedTopicId) : null) ?? defaultTopic);

  // A brief-only track (every module topic-less) has nothing to auto-select, so open the first module.
  const activeModule = selectedModule ?? (!selectedTopic && topiclessModules.length > 0 ? topiclessModules[0] : null);

  const enroll = useMutation({
    mutationFn: () => api.post(`/enrollments/tracks/${trackId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['enrollments', 'me'] }),
  });
  const unenroll = useMutation({
    mutationFn: () => api.delete(`/enrollments/tracks/${trackId}`),
    onSuccess: () => {
      // Progress and submissions for this track are wiped server-side, so every
      // cached view of them has to be refetched rather than showing stale state.
      queryClient.invalidateQueries({ queryKey: ['enrollments', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['progress', trackId] });
      queryClient.invalidateQueries({ queryKey: ['submissions', 'mine'] });
      setConfirmUnenroll(false);
      setSelectedTopicId(null);
      setSelectedModuleId(null);
    },
  });
  // Certificates are per course now: finish it, claim it. The API re-checks completion,
  // so this button is a convenience rather than the thing granting the certificate.
  const { data: credentials = [] } = useQuery<CredentialDto[]>({
    queryKey: ['credentials', 'me'],
    queryFn: () => api.get<CredentialDto[]>('/credentials/me'),
  });
  const certificate = credentials.find((c) => c.trackId === trackId && c.status === 'ACTIVE');

  const claimCertificate = useMutation({
    mutationFn: () => api.post<CredentialDto>(`/credentials/tracks/${trackId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credentials', 'me'] }),
  });

  const markWatched = useMutation({
    mutationFn: (topicId: string) => api.post(`/progress/topics/${topicId}/watched`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['progress', trackId] });
      queryClient.invalidateQueries({ queryKey: ['enrollments', 'me'] });
    },
  });

  if (isLoading || !track) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-8 w-28 rounded-xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24 rounded-full" />
          <Skeleton className="h-7 w-2/5" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
          <div className="bg-white rounded-2xl border border-black/[0.06] divide-y divide-navy-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
          <Skeleton className="h-[420px] rounded-2xl" />
        </div>
      </div>
    );
  }

  // A paid course grants nothing until an administrator approves the request, so
  // "enrolled" and "has access" are no longer the same thing.
  const isPaid = track.access === 'PAID';
  const awaitingApproval = enrollment?.approval === 'PENDING';
  const requestDeclined = enrollment?.approval === 'DECLINED';
  const isEnrolled = !!enrollment && !awaitingApproval && !requestDeclined;
  const joinLabel = isPaid ? 'Request a place' : 'Enroll in this Track';

  /**
   * What follows a lesson, as on LinkedIn Learning: the next lesson in the module, or — at
   * the end of a module — its chapter quiz if it has one, otherwise the first lesson of
   * the next module. Nothing after the course's last lesson.
   */
  const nextAfter = (topicId: string): { upNext: UpNext; go: () => void } | null => {
    const mod = track.modules.find((m) => m.topics.some((t) => t.id === topicId));
    if (!mod) return null;
    const lastInModule = mod.topics[mod.topics.length - 1]?.id === topicId;
    if (lastInModule && mod.quizEnabled && mod.hasQuiz) {
      return {
        upNext: { kind: 'quiz', title: `${mod.title} quiz` },
        go: () => setQuizModal({ type: 'MODULE_QUIZ', fetchParam: mod.id }),
      };
    }
    const at = allTopics.findIndex((t) => t.id === topicId);
    const following = at >= 0 ? allTopics[at + 1] : undefined;
    if (!following) return null;
    return {
      upNext: { kind: 'lesson', title: following.title },
      go: () => {
        setSelectedModuleId(null);
        setSelectedTopicId(following.id);
        setAutoPlayTopicId(following.id);
      },
    };
  };
  const next = selectedTopic && isEnrolled ? nextAfter(selectedTopic.id) : null;

  // Mirrors the rule the API enforces: an assessment-backed course is finished by passing
  // it (which sets the status), and a course without one is finished when every lesson is
  // watched. Checked here as well as on the status so a student who finished a course
  // before that rule existed still sees the claim prompt.
  const allLessonsWatched =
    allTopics.length > 0 && allTopics.every((t) => watchedIds.has(t.id));
  const courseFinished =
    enrollment?.status === 'COMPLETED' || (!track.assessment && allLessonsWatched);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <Link href="/learning" className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-950 font-semibold">
          <ChevronLeft className="w-4 h-4" /> Back to My Learning
        </Link>
        {awaitingApproval ? (
          <Badge tone="amber">Waiting for approval</Badge>
        ) : isEnrolled ? (
          <Button size="sm" variant="outline" onClick={() => setConfirmUnenroll(true)}>
            Unenroll
          </Button>
        ) : (
          <Button size="sm" onClick={() => enroll.mutate()} loading={enroll.isPending}>
            {requestDeclined ? 'Ask again' : joinLabel}
          </Button>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge tone="red">{track.category.name}</Badge>
          <Badge tone="gray">{track.difficulty}</Badge>
          {!isEnrolled && <Badge tone="amber">Syllabus Only</Badge>}
          {isPaid && <Badge tone="red">Paid course</Badge>}
        </div>
        <h1 className="text-2xl font-extrabold text-navy-950">{track.title}</h1>
        <p className="text-sm text-navy-500 mt-1">{track.description}</p>
      </div>

      {awaitingApproval && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 space-y-1">
          <p className="font-bold">Your place is waiting for approval</p>
          <p>
            This is a paid course. Dojo Hub will confirm your place once payment is settled, and you will be emailed
            the moment the lessons open. Nothing else is needed from you here.
          </p>
        </div>
      )}

      {requestDeclined && (
        <div className="bg-crimson-50 border border-crimson-200 rounded-xl p-4 text-sm text-crimson-800 space-y-1">
          <p className="font-bold">Your request was not approved</p>
          <p>Check your email for the reason. If you have already paid, ask again below or contact Dojo Hub.</p>
        </div>
      )}

      {!isEnrolled && !awaitingApproval && !requestDeclined && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          {isPaid
            ? "You're browsing the syllabus. This is a paid course — request a place, and Dojo Hub will open the lessons once payment is settled."
            : "You're browsing the syllabus. Enroll to watch the lessons, track progress, submit competency evidence and take assessments."}
        </div>
      )}

      {isEnrolled && courseFinished && (
        <div className="rounded-2xl bg-gradient-to-br from-navy-950 to-navy-900 border border-navy-900 p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-start gap-3">
            <Award className="w-8 h-8 text-crimson-400 shrink-0" />
            <div>
              <p className="font-bold text-white tracking-tight">
                {certificate ? 'Your certificate is ready' : 'You have completed this course'}
              </p>
              <p className="text-sm text-navy-300 mt-0.5">
                {certificate
                  ? 'Find it in My Certificates — it carries a QR code anyone can verify.'
                  : 'Claim your certificate for this course. It carries a QR code anyone can verify.'}
              </p>
            </div>
          </div>
          {certificate ? (
            <Link href="/certificates" className="shrink-0">
              <Button>View my certificate</Button>
            </Link>
          ) : (
            <Button
              className="shrink-0"
              onClick={() => claimCertificate.mutate()}
              loading={claimCertificate.isPending}
            >
              Get my certificate
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        <SyllabusPanel
          track={track}
          watchedTopicIds={watchedIds}
          submissions={submissions}
          selectedTopicId={selectedTopic?.id ?? null}
          selectedModuleId={activeModule?.id ?? null}
          onSelectTopic={(topic) => {
            setSelectedModuleId(null);
            setSelectedTopicId(topic.id);
            setAutoPlayTopicId(null);
          }}
          onSelectModule={(moduleId) => {
            setSelectedTopicId(null);
            setSelectedModuleId(moduleId);
          }}
          onOpenQuiz={(moduleId) => setQuizModal({ type: 'MODULE_QUIZ', fetchParam: moduleId })}
          canTakeQuizzes={isEnrolled}
          onOpenAssessment={() => setQuizModal({ type: 'TRACK_ASSESSMENT', fetchParam: trackId })}
        />

        <div className="bg-white rounded-2xl border border-navy-200 p-5 space-y-6">
          {selectedTopic ? (
            isEnrolled ? (
              <>
                <VideoPlayer
                  key={selectedTopic.id}
                  topic={selectedTopic}
                  watched={watchedIds.has(selectedTopic.id)}
                  onCompleted={() => {
                    // Pin the lesson on screen first. Without an explicit choice the page
                    // shows the first unwatched lesson, which becomes the next one the moment
                    // this is recorded — jumping away before "Up next" can run.
                    setSelectedModuleId(null);
                    setSelectedTopicId(selectedTopic.id);
                    markWatched.mutate(selectedTopic.id);
                  }}
                  upNext={next?.upNext ?? null}
                  onAdvance={next?.go}
                  autoPlay={autoPlayTopicId === selectedTopic.id}
                />
                <LessonResources resources={selectedTopic.resources} documents={selectedTopic.documents} />
                <SubmissionWorkspace topicId={selectedTopic.id} topicTitle={selectedTopic.title} />
              </>
            ) : selectedTopic.isFreePreview ? (
              /* The one lesson a course gives away. No completion control — progress
                 only counts once enrolled — and a nudge to enrol for the rest. */
              <>
                <VideoPlayer key={selectedTopic.id} topic={selectedTopic} />
                <LessonResources resources={selectedTopic.resources} />
                <div className="bg-navy-950 text-white rounded-xl p-5 text-center">
                  <p className="font-bold tracking-tight">That was the free lesson</p>
                  <p className="mt-1 text-sm text-navy-300 max-w-sm mx-auto">
                    Enrol to watch the rest of this course, track your progress and work
                    towards your certificate.
                  </p>
                  <Button className="mt-4" onClick={() => enroll.mutate()} loading={enroll.isPending}>
                    {joinLabel}
                  </Button>
                </div>
              </>
            ) : (
              /* The API sends no videoUrl for locked lessons, so there is nothing to play
                 here — this panel explains why rather than showing an empty player. */
              <div className="text-center py-10 px-4 bg-navy-50 rounded-xl border border-navy-200">
                <div className="w-12 h-12 mx-auto rounded-full bg-navy-950 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <h3 className="mt-4 font-bold text-navy-950">{selectedTopic.title}</h3>
                <p className="mt-1.5 text-sm text-navy-500 max-w-sm mx-auto">
                  Enrol in this course to watch this lesson, track your progress and submit
                  work towards your certificate.
                </p>
                <Button className="mt-5" onClick={() => enroll.mutate()} loading={enroll.isPending}>
                  {joinLabel}
                </Button>
              </div>
            )
          ) : activeModule ? (
            <>
              <div>
                <Badge tone="blue">Project Brief</Badge>
                <h3 className="font-bold text-navy-950 mt-2">{activeModule.title}</h3>
                <p className="text-sm text-navy-600 mt-2 whitespace-pre-wrap">{activeModule.description}</p>
                {activeModule.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {activeModule.tools.map((tool) => (
                      <Badge key={tool} tone="indigo">
                        {tool}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {isEnrolled && <SubmissionWorkspace moduleId={activeModule.id} topicTitle={activeModule.title} />}
            </>
          ) : (
            <p className="text-sm text-navy-400">This track has no published lessons yet.</p>
          )}
        </div>
      </div>

      {confirmUnenroll && (
        <Modal
          open
          onClose={() => setConfirmUnenroll(false)}
          title="Unenroll from this course?"
          subtitle="This cannot be undone."
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="flex gap-3 bg-crimson-50 border border-crimson-200 rounded-xl p-4">
              <AlertTriangle className="w-5 h-5 text-crimson-600 shrink-0 mt-0.5" />
              <div className="text-sm text-crimson-800 space-y-2">
                <p className="font-bold">Your progress in this course will be erased.</p>
                <p>
                  You will <span className="font-semibold">not</span> resume where you stopped. If you enrol again later, you start this
                  course from the very beginning.
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-mono uppercase tracking-wider font-bold text-navy-500 mb-2">What gets deleted</p>
              <ul className="text-sm text-navy-700 space-y-1.5">
                <li className="flex gap-2">
                  <span className="text-crimson-600">•</span>
                  {watchedIds.size > 0 ? `${watchedIds.size} completed lesson${watchedIds.size === 1 ? '' : 's'}` : 'Your lesson progress'}
                </li>
                <li className="flex gap-2">
                  <span className="text-crimson-600">•</span>
                  Work you submitted for this course, including supervisor feedback and scores
                </li>
              </ul>
              <p className="text-xs text-navy-500 mt-3">
                Certificates you have already earned are kept — they are tied to your certification level, not to this course.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <Button variant="secondary" onClick={() => setConfirmUnenroll(false)}>
                Stay Enrolled
              </Button>
              <Button variant="danger" loading={unenroll.isPending} onClick={() => unenroll.mutate()}>
                Unenroll &amp; Erase
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {quizModal && <AssessmentWizard type={quizModal.type} fetchParam={quizModal.fetchParam} onClose={() => setQuizModal(null)} />}
    </div>
  );
}

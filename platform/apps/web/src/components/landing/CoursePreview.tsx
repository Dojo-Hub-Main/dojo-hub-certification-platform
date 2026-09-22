'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronLeft, Clock, Layers, Lock, Play, PlayCircle } from 'lucide-react';
import { TrackDto } from '@dojo-hub/shared';
import { api } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useMyEnrollments } from '@/lib/hooks';
import { formatDuration } from '@/lib/video';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { TrackCover } from '@/components/student/TrackCover';
import { VideoPlayer } from '@/components/student/VideoPlayer';
import { Modal } from '@/components/ui/Modal';
import { PublicNav } from './PublicNav';

/**
 * Public, unauthenticated course page. Shows the full syllabus, and gives away the
 * course's first video so a visitor can judge the teaching before creating an account.
 * Every lesson after that is locked — the API sends no video URL for them — and watching
 * them takes an account and an enrolment.
 */
export function CoursePreview({
  trackId,
  initiallySignedIn = false,
}: {
  trackId: string;
  initiallySignedIn?: boolean;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const { data: track, isLoading, isError } = useQuery<TrackDto>({
    queryKey: ['track', 'public', trackId],
    queryFn: () => api.get<TrackDto>(`/tracks/${trackId}/preview`),
  });

  const { data: enrollments = [] } = useMyEnrollments();
  const enrolment = enrollments.find((e) => e.trackId === trackId);
  const awaitingApproval = enrolment?.approval === 'PENDING';
  const isEnrolled = !!enrolment && !awaitingApproval;
  const isPaid = track?.access === 'PAID';

  // Enrolling from here is an explicit click on a button that says so, then straight
  // into the course — the alternative was sending them to the player to find a second
  // Enrol button, which is a dead end dressed up as a call to action.
  const enroll = useMutation({
    mutationFn: () => api.post(`/enrollments/tracks/${trackId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enrollments', 'me'] });
      router.push(`/learning/${trackId}`);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <PublicNav initiallySignedIn={initiallySignedIn} />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-4">
          <Skeleton className="h-8 w-2/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !track) {
    return (
      <div className="min-h-screen bg-white">
        <PublicNav initiallySignedIn={initiallySignedIn} />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 text-center">
          <h1 className="text-2xl font-extrabold text-navy-950">Course not found</h1>
          <p className="text-navy-500 mt-2">This course may have been unpublished.</p>
          <Link href="/#courses" className="inline-block mt-6">
            <Button variant="outline">Browse all courses</Button>
          </Link>
        </div>
      </div>
    );
  }

  // The API marks exactly one lesson as the giveaway; the UI never picks it itself.
  const freeTopic = track.modules.flatMap((m) => m.topics).find((t) => t.isFreePreview) ?? null;
  const coursePath = `/courses/${track.id}`;
  const lessonCount = track.modules.reduce((sum, m) => sum + m.topics.length, 0);
  const totalSeconds = track.modules.reduce(
    (sum, m) => sum + m.topics.reduce((s, t) => s + t.durationSeconds, 0),
    0,
  );

  return (
    <div className="min-h-screen bg-white">
      <PublicNav initiallySignedIn={initiallySignedIn} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Link
          href="/#courses"
          className="inline-flex items-center gap-1 text-xs font-semibold text-navy-500 hover:text-navy-950"
        >
          <ChevronLeft className="w-4 h-4" /> All courses
        </Link>

        <div className="mt-6 grid lg:grid-cols-[1fr_20rem] gap-8 items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="red">{track.category.name}</Badge>
              <Badge tone="gray">{track.difficulty}</Badge>
            </div>

            <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-navy-950 text-balance">
              {track.title}
            </h1>
            <p className="mt-3 text-navy-600 leading-relaxed max-w-2xl">{track.description}</p>

            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-500">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-crimson-600" />
                {track.modules.length} module{track.modules.length === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-crimson-600" />
                {lessonCount} lesson{lessonCount === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-crimson-600" />
                {track.durationWeeks} weeks
              </span>
            </div>

            {/* ------------------------------------------------- syllabus */}
            <h2 className="mt-10 text-xl font-extrabold tracking-tight text-navy-950">
              What you will cover
            </h2>

            <div className="mt-4 space-y-3">
              {track.modules.map((mod, i) => (
                <div key={mod.id} className="border border-black/[0.07] rounded-2xl overflow-hidden">
                  <div className="bg-navy-50/70 px-4 py-3 flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-navy-950 text-white text-[12px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-navy-950">{mod.title}</p>
                      <p className="text-[12px] text-navy-500">
                        {mod.topics.length > 0
                          ? `${mod.topics.length} lesson${mod.topics.length === 1 ? '' : 's'}`
                          : 'Project brief — submit work directly'}
                      </p>
                    </div>
                  </div>

                  {mod.topics.length > 0 && (
                    <ul className="divide-y divide-black/[0.05]">
                      {mod.topics.map((topic) =>
                        topic.isFreePreview ? (
                          <li key={topic.id}>
                            <button
                              onClick={() => setPreviewOpen(true)}
                              className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-crimson-50/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-crimson-500/60"
                            >
                              <Play className="w-3.5 h-3.5 text-crimson-600 shrink-0 fill-crimson-600" />
                              <span className="text-sm font-semibold text-navy-950 flex-1 min-w-0 truncate">
                                {topic.title}
                              </span>
                              <Badge tone="red">Free preview</Badge>
                              <span className="text-[12px] font-mono text-navy-400 shrink-0">
                                {formatDuration(topic.durationSeconds)}
                              </span>
                            </button>
                          </li>
                        ) : (
                          <li key={topic.id} className="px-4 py-2.5 flex items-center gap-3">
                            <Lock className="w-3.5 h-3.5 text-navy-300 shrink-0" />
                            <span className="text-sm text-navy-700 flex-1 min-w-0 truncate">
                              {topic.title}
                            </span>
                            <span className="text-[12px] font-mono text-navy-400 shrink-0">
                              {formatDuration(topic.durationSeconds)}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ---------------------------------------------------- enrol card */}
          <aside className="lg:sticky lg:top-24 border border-black/[0.07] rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(5,7,12,0.04)]">
            <div className="aspect-[16/9] bg-navy-100">
              {track.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded URL
                <img
                  src={track.coverImageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <TrackCover category={track.category.name} icon={track.icon} className="h-full" />
              )}
            </div>

            <div className="p-5 space-y-4">
              <div>
                <p className="text-2xl font-extrabold text-navy-950">{isPaid ? 'Paid course' : 'Free'}</p>
                <p className="text-xs text-navy-500">
                  {isPaid
                    ? 'Request a place and Dojo Hub will be in touch about fees.'
                    : totalSeconds > 0
                      ? `${Math.round(totalSeconds / 60)} minutes of lessons`
                      : 'Project-based course'}
                </p>
              </div>

              {user && awaitingApproval ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-bold">Waiting for approval</p>
                  <p className="text-xs mt-0.5">
                    Dojo Hub will open the lessons once your payment is settled, and you will be emailed.
                  </p>
                </div>
              ) : user && isEnrolled ? (
                <Link href={`/learning/${track.id}`} className="block">
                  <Button className="w-full">
                    <PlayCircle className="w-4 h-4" /> Go to this course
                  </Button>
                </Link>
              ) : user ? (
                <Button
                  className="w-full"
                  onClick={() => enroll.mutate()}
                  loading={enroll.isPending}
                >
                  {isPaid ? 'Request a place' : 'Enroll in this course'}
                </Button>
              ) : (
                <>
                  {/* Both links carry this course as `next`, so someone who signs up or
                      signs in from here is returned to it rather than being dropped on a
                      dashboard having lost the course they came for. */}
                  <Link href={`/register?next=${encodeURIComponent(coursePath)}`} className="block">
                    <Button className="w-full">Sign up to enrol</Button>
                  </Link>
                  <p className="text-xs text-navy-500 text-center">
                    An account keeps your progress and carries your name on the certificate.
                  </p>
                  <p className="text-xs text-navy-500 text-center">
                    Already have one?{' '}
                    <Link
                      href={`/login?next=${encodeURIComponent(coursePath)}`}
                      className="font-bold text-crimson-600 hover:underline"
                    >
                      Sign in
                    </Link>
                  </p>
                </>
              )}

              {freeTopic && !isEnrolled && (
                <button
                  onClick={() => setPreviewOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-crimson-600 hover:underline"
                >
                  <Play className="w-3.5 h-3.5 fill-crimson-600" /> Watch the free lesson first
                </button>
              )}

              <ul className="pt-2 border-t border-black/[0.06] space-y-2 text-xs text-navy-600">
                <li className="flex items-start gap-2">
                  <BookOpen className="w-3.5 h-3.5 mt-0.5 text-crimson-600 shrink-0" />
                  Full access to every lesson once enrolled
                </li>
                <li className="flex items-start gap-2">
                  <Layers className="w-3.5 h-3.5 mt-0.5 text-crimson-600 shrink-0" />
                  Work reviewed by a supervisor, not auto-marked
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="w-3.5 h-3.5 mt-0.5 text-crimson-600 shrink-0" />
                  Learn at your own pace — no deadlines
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>

      {freeTopic && previewOpen && (
        <Modal
          open
          onClose={() => setPreviewOpen(false)}
          title="Free lesson"
          subtitle={track.title}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-5">
            <VideoPlayer topic={freeTopic} />

            <div className="bg-navy-950 text-white rounded-xl p-5 text-center">
              <p className="font-bold tracking-tight">Want the rest of the course?</p>
              <p className="mt-1 text-sm text-navy-300">
                {user
                  ? 'Enrol to unlock every lesson and work towards your certificate.'
                  : 'Create a free account, enrol, and work towards your certificate.'}
              </p>
              {user ? (
                <Button className="mt-4" onClick={() => enroll.mutate()} loading={enroll.isPending}>
                  {isPaid ? 'Request a place' : 'Enroll in this course'}
                </Button>
              ) : (
                <Link href={`/register?next=${encodeURIComponent(coursePath)}`} className="inline-block mt-4">
                  <Button>Create a free account</Button>
                </Link>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

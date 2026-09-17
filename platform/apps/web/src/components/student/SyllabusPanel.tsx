'use client';

import { CheckCircle2, Circle, Clock, AlertCircle, ClipboardList, GraduationCap } from 'lucide-react';
import { SubmissionDto, TopicDto, TrackDto } from '@dojo-hub/shared';
import { Badge } from '../ui/Badge';
import { cn } from '../ui/cn';

type TopicStatus = 'approved' | 'pending' | 'rejected' | 'watched' | 'none';

function topicStatus(topicId: string, watchedIds: Set<string>, submissions: SubmissionDto[]): TopicStatus {
  const sub = submissions.find((s) => s.topicId === topicId);
  if (sub?.status === 'APPROVED') return 'approved';
  if (sub?.status === 'PENDING') return 'pending';
  if (sub?.status === 'REJECTED') return 'rejected';
  if (watchedIds.has(topicId)) return 'watched';
  return 'none';
}

const STATUS_ICON: Record<TopicStatus, React.ReactNode> = {
  approved: <CheckCircle2 className="w-4 h-4 text-green-600" />,
  pending: <Clock className="w-4 h-4 text-navy-600 animate-pulse" />,
  rejected: <AlertCircle className="w-4 h-4 text-red-500" />,
  watched: <CheckCircle2 className="w-4 h-4 text-green-600" />,
  none: <Circle className="w-4 h-4 text-navy-300" />,
};

export function SyllabusPanel({
  track,
  watchedTopicIds,
  submissions,
  selectedTopicId,
  selectedModuleId,
  onSelectTopic,
  onSelectModule,
  onOpenQuiz,
  onOpenAssessment,
  canTakeQuizzes = true,
}: {
  track: TrackDto;
  watchedTopicIds: Set<string>;
  submissions: SubmissionDto[];
  selectedTopicId: string | null;
  selectedModuleId: string | null;
  onSelectTopic: (topic: TopicDto) => void;
  onSelectModule: (moduleId: string) => void;
  onOpenQuiz: (moduleId: string) => void;
  onOpenAssessment: () => void;
  /** False before enrolment — quizzes are part of what enrolling unlocks, like the lessons. */
  canTakeQuizzes?: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl border border-navy-200 divide-y divide-navy-100 overflow-hidden">
      {track.modules.map((mod) => {
        const completedInMod = mod.topics.filter((t) => watchedTopicIds.has(t.id)).length;
        const isBriefOnly = mod.topics.length === 0;
        const moduleSubmission = submissions.find((s) => s.moduleId === mod.id);
        const moduleStatus: TopicStatus =
          moduleSubmission?.status === 'APPROVED'
            ? 'approved'
            : moduleSubmission?.status === 'PENDING'
              ? 'pending'
              : moduleSubmission?.status === 'REJECTED'
                ? 'rejected'
                : 'none';
        return (
          <div key={mod.id}>
            <div
              className={cn(
                'p-4 bg-navy-50/60',
                isBriefOnly && 'cursor-pointer hover:bg-navy-100/70 transition-colors',
                isBriefOnly && selectedModuleId === mod.id && 'bg-crimson-50/60',
              )}
              {...(isBriefOnly
                ? {
                    role: 'button',
                    tabIndex: 0,
                    onClick: () => onSelectModule(mod.id),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectModule(mod.id);
                      }
                    },
                  }
                : {})}
            >
              <div className="flex items-center gap-2">
                {isBriefOnly && STATUS_ICON[moduleStatus]}
                <p className="text-xs font-bold text-navy-950">{mod.title}</p>
              </div>
              {mod.topics.length > 0 ? (
                <p className="text-[12px] text-navy-500 mt-0.5">
                  {completedInMod}/{mod.topics.length} units complete
                </p>
              ) : (
                mod.description && <p className="text-[12px] text-navy-500 mt-0.5 line-clamp-2">{mod.description}</p>
              )}
              {isBriefOnly && (
                <p
                  className={cn(
                    'text-[12px] font-semibold mt-1',
                    moduleStatus === 'approved' && 'text-green-700',
                    moduleStatus === 'pending' && 'text-navy-600',
                    moduleStatus === 'rejected' && 'text-red-600',
                    moduleStatus === 'none' && 'text-crimson-600',
                  )}
                >
                  {moduleStatus === 'approved'
                    ? 'Passed — supervisor approved your work'
                    : moduleStatus === 'pending'
                      ? 'Submitted — awaiting supervisor review'
                      : moduleStatus === 'rejected'
                        ? 'Revision requested — resubmit your work'
                        : 'Project brief — open to submit work'}
                </p>
              )}
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
            <div className="divide-y divide-navy-100">
              {mod.topics.map((topic) => {
                const status = topicStatus(topic.id, watchedTopicIds, submissions);
                return (
                  <button
                    key={topic.id}
                    onClick={() => onSelectTopic(topic)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-navy-50 transition-colors',
                      selectedTopicId === topic.id && 'bg-crimson-50/60',
                    )}
                  >
                    {STATUS_ICON[status]}
                    <span className="text-xs text-navy-700 flex-1 truncate">{topic.title}</span>
                    <span className="text-[12px] text-navy-400 font-mono shrink-0">
                      {Math.floor(topic.durationSeconds / 60)}:{String(topic.durationSeconds % 60).padStart(2, '0')}
                    </span>
                  </button>
                );
              })}
              {canTakeQuizzes && mod.quizEnabled && mod.hasQuiz && (
                <button
                  onClick={() => onOpenQuiz(mod.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-navy-50 transition-colors bg-navy-100/40"
                >
                  <ClipboardList className="w-4 h-4 text-navy-600 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-navy-800">Chapter Quiz</span>
                    <span className="block text-[11px] text-navy-500">
                      {mod.quizQuestionCount
                        ? `${mod.quizQuestionCount} question${mod.quizQuestionCount === 1 ? '' : 's'} · optional`
                        : 'optional self-check'}
                    </span>
                  </span>
                </button>
              )}
            </div>
          </div>
        );
      })}

      {track.examEnabled && track.assessment && (
        <button onClick={onOpenAssessment} className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-navy-50 bg-crimson-50/40">
          <GraduationCap className="w-5 h-5 text-crimson-600" />
          <div>
            <p className="text-xs font-bold text-crimson-700">Take Final Course Assessment</p>
            <p className="text-[12px] text-navy-500">Optional self-check — doesn&apos;t affect certification progress</p>
          </div>
        </button>
      )}
    </div>
  );
}


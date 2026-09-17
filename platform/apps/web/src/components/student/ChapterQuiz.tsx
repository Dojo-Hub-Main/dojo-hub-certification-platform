'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Check, CheckCircle2, ChevronDown, PlayCircle, RotateCcw, Trophy, XCircle } from 'lucide-react';
import {
  QuizAnswerCheckDto,
  QuizDto,
  QuizGradeResultDto,
  QuizQuestionPublicDto,
  QuizReviewLessonDto,
} from '@dojo-hub/shared';
import { api, ApiError } from '@/lib/api-client';
import { youTubeEmbedUrl, youTubeId } from '@/lib/video';
import { Button } from '../ui/Button';
import { LessonResources } from './LessonResources';

/**
 * A chapter quiz run the way LinkedIn Learning runs one.
 *
 * The student picks an answer and submits it. A right answer turns green with its
 * explanation. A wrong one turns red with feedback written for that option — never the
 * right answer — and the lesson to review is offered, so they can watch or read it again
 * and try another option. They can also move on without solving it. A question counts as
 * correct if the answer standing when they leave it is correct.
 *
 * Every hook sits at the top of each component, before any early return.
 */

type Answer = number | number[];

/** What the student has submitted so far on one question. */
type QuestionProgress = {
  /** Single-answer questions: the verdict on each option tried. */
  tried: Record<number, QuizAnswerCheckDto>;
  /** Tick-all questions: the last combination submitted and its verdict. */
  lastMulti?: { picked: number[]; verdict: QuizAnswerCheckDto };
  solved: boolean;
};

const EMPTY_PROGRESS: QuestionProgress = { tried: {}, solved: false };

function sameSet(a: number[], b: number[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function formatLength(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function ChapterQuiz({ quiz, onClose }: { quiz: QuizDto; onClose: () => void }) {
  const queryClient = useQueryClient();
  const questions = quiz.objectiveQuestions;

  const [phase, setPhase] = useState<'intro' | 'question' | 'results' | 'review'>('intro');
  const [index, setIndex] = useState(0);
  const [selection, setSelection] = useState<Record<string, Answer>>({});
  const [progress, setProgress] = useState<Record<string, QuestionProgress>>({});
  // The answer standing on each question — what is scored when the quiz is finished.
  const [submitted, setSubmitted] = useState<Record<string, Answer>>({});
  const [result, setResult] = useState<QuizGradeResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useMutation({
    mutationFn: ({ questionId, answer }: { questionId: string; answer: Answer }) =>
      api.post<QuizAnswerCheckDto>(`/quizzes/questions/${questionId}/check`, { answer }),
  });

  const finish = useMutation({
    mutationFn: (answers: Record<string, Answer>) =>
      api.post<QuizGradeResultDto>(`/quizzes/module-quiz/${quiz.id}/attempts`, {
        objectiveAnswers: answers,
        gradingMode: 'MANUAL',
      }),
    onSuccess: (data) => {
      setResult(data);
      setPhase('results');
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['enrollments', 'me'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not finish the quiz. Please try again.'),
  });

  const restart = () => {
    setIndex(0);
    setSelection({});
    setProgress({});
    setSubmitted({});
    setResult(null);
    setError(null);
    setPhase('question');
  };

  // ------------------------------------------------------------------ intro
  if (phase === 'intro') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-navy-700">
          {questions.length} question{questions.length === 1 ? '' : 's'} · pass mark {quiz.passThreshold}%
        </p>
        <div className="bg-navy-50 rounded-xl border border-navy-200 p-4 text-xs text-navy-600 space-y-1.5">
          <p>Submit each answer to see straight away whether it&apos;s right.</p>
          <p>Got one wrong? Review the lesson and try another answer, or move on.</p>
          <p>This is an optional self-check. It doesn&apos;t affect your certificate.</p>
        </div>
        <Button className="w-full" disabled={questions.length === 0} onClick={() => setPhase('question')}>
          Start quiz
        </Button>
      </div>
    );
  }

  // ------------------------------------------------------------------ results
  if (phase === 'results' && result) {
    const passed = !!result.passed;
    return (
      <div className="py-4 text-center space-y-4">
        <div
          className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${passed ? 'bg-green-100 text-green-700' : 'bg-navy-100 text-navy-600'}`}
        >
          {passed ? <Trophy className="w-8 h-8" /> : <BookOpen className="w-8 h-8" />}
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold text-navy-950">
            You answered {result.objectiveScore} of {result.objectiveTotal} question{result.objectiveTotal === 1 ? '' : 's'}{' '}
            correctly.
          </p>
          <p className="text-sm text-navy-600">
            {passed
              ? 'Nice work — you passed this quiz.'
              : 'Keep practicing! Review your answers and retake the quiz.'}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Button variant="outline" onClick={() => setPhase('review')}>
            Review all answers
          </Button>
          <Button variant="outline" onClick={restart}>
            <RotateCcw className="w-4 h-4" /> Retake quiz
          </Button>
          <Button onClick={onClose}>Continue learning</Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ review
  if (phase === 'review' && result) {
    return (
      <div className="space-y-4">
        <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
          {questions.map((q, i) => {
            const r = result.perQuestionResults.find((x) => x.questionId === q.id);
            return <ReviewedQuestion key={q.id} number={i + 1} question={q} result={r} />;
          })}
        </div>
        <div className="flex flex-wrap gap-2 justify-between">
          <Button variant="outline" onClick={() => setPhase('results')}>
            Back to results
          </Button>
          <Button onClick={onClose}>Continue learning</Button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ question
  const q = questions[index];
  if (!q) return null;

  const isMulti = !!q.allowMultiple;
  const p = progress[q.id] ?? EMPTY_PROGRESS;
  const chosen = selection[q.id];
  const isLast = index === questions.length - 1;

  const hasWrongTry = isMulti ? !!p.lastMulti && !p.lastMulti.verdict.correct : Object.values(p.tried).some((v) => !v.correct);

  const canSubmit = (() => {
    if (p.solved || check.isPending) return false;
    if (isMulti) {
      const picked = Array.isArray(chosen) ? chosen : [];
      if (picked.length === 0) return false;
      // Resubmitting the exact combination that was just marked wrong would tell them nothing.
      return !(p.lastMulti && sameSet(p.lastMulti.picked, picked));
    }
    return typeof chosen === 'number' && !p.tried[chosen];
  })();

  const submit = () => {
    if (!canSubmit || chosen === undefined) return;
    setError(null);
    const answer = chosen;
    check.mutate(
      { questionId: q.id, answer },
      {
        onSuccess: (verdict) => {
          setSubmitted((prev) => ({ ...prev, [q.id]: answer }));
          setProgress((prev) => {
            const cur = prev[q.id] ?? EMPTY_PROGRESS;
            return {
              ...prev,
              [q.id]: isMulti
                ? { ...cur, lastMulti: { picked: answer as number[], verdict }, solved: verdict.correct }
                : { ...cur, tried: { ...cur.tried, [answer as number]: verdict }, solved: verdict.correct },
            };
          });
        },
        onError: () => setError("Couldn't check that answer just now. Please submit it again."),
      },
    );
  };

  const next = () => {
    setError(null);
    if (isLast) finish.mutate(submitted);
    else setIndex(index + 1);
  };

  const toggle = (optionIndex: number) => {
    if (p.solved) return;
    if (isMulti) {
      const picked = Array.isArray(chosen) ? chosen : [];
      const updated = picked.includes(optionIndex)
        ? picked.filter((i) => i !== optionIndex)
        : [...picked, optionIndex].sort((a, b) => a - b);
      setSelection({ ...selection, [q.id]: updated });
    } else if (!p.tried[optionIndex]) {
      setSelection({ ...selection, [q.id]: optionIndex });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs text-navy-500">
          Question {index + 1} of {questions.length}
        </p>
        <p className="text-base text-navy-950">{q.question}</p>
        {isMulti && <p className="text-xs font-semibold text-navy-500">Select all that apply.</p>}
      </div>

      <ul className="rounded-xl border border-navy-200 divide-y divide-navy-100 overflow-hidden">
        {q.options?.map((opt, i) => (
          <OptionRow
            key={i}
            label={opt}
            multi={isMulti}
            selected={isMulti ? Array.isArray(chosen) && chosen.includes(i) : chosen === i}
            verdict={isMulti ? undefined : p.tried[i]}
            solvedMulti={isMulti && p.solved && Array.isArray(chosen) && chosen.includes(i)}
            disabled={p.solved || (!isMulti && !!p.tried[i])}
            onClick={() => toggle(i)}
          />
        ))}
      </ul>

      {/* Tick-all questions are marked as a whole, so their verdict sits beneath the list. */}
      {isMulti && p.lastMulti && (
        <div
          role="status"
          className={`rounded-xl border p-3 space-y-1 ${p.lastMulti.verdict.correct ? 'bg-green-50 border-green-200' : 'bg-crimson-50 border-crimson-200'}`}
        >
          <p
            className={`flex items-center gap-1.5 text-sm font-semibold ${p.lastMulti.verdict.correct ? 'text-green-700' : 'text-crimson-700'}`}
          >
            {p.lastMulti.verdict.correct ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {p.lastMulti.verdict.correct ? 'Correct' : 'Incorrect'}
          </p>
          <p className="text-xs text-navy-600">
            {p.lastMulti.verdict.correct
              ? p.lastMulti.verdict.feedback
              : 'Not every correct option is ticked, or one of your ticks is wrong. Change your selection and try again.'}
          </p>
        </div>
      )}

      {hasWrongTry && !p.solved && q.reviewTopic && <ReviewLesson lesson={q.reviewTopic} />}

      {error && <p className="text-xs text-crimson-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-sm text-navy-500">
          {!p.solved && hasWrongTry
            ? isMulti
              ? 'Change your selection to try again.'
              : 'Select another answer to try again.'
            : ''}
        </p>
        <div className="flex gap-2 ml-auto">
          {p.solved ? (
            <Button onClick={next} loading={finish.isPending}>
              {isLast ? 'See results' : 'Next question'}
            </Button>
          ) : (
            <>
              {hasWrongTry && (
                <Button variant="outline" onClick={next} loading={finish.isPending}>
                  {isLast ? 'Finish quiz' : 'Next question'}
                </Button>
              )}
              <Button onClick={submit} disabled={!canSubmit} loading={check.isPending}>
                Submit
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** One answer option: selectable until tried, then marked with its verdict and feedback. */
function OptionRow({
  label,
  multi,
  selected,
  verdict,
  solvedMulti,
  disabled,
  onClick,
}: {
  label: string;
  multi: boolean;
  selected: boolean;
  verdict?: QuizAnswerCheckDto;
  solvedMulti: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const right = verdict?.correct || solvedMulti;
  const wrong = verdict && !verdict.correct;
  // Once a question is solved, the options nobody picked fade out, as on LinkedIn.
  const faded = disabled && !verdict && !solvedMulti;

  let marker;
  if (right) marker = <CheckCircle2 className="w-6 h-6 text-green-600" aria-hidden />;
  else if (wrong) marker = <XCircle className="w-6 h-6 text-crimson-600" aria-hidden />;
  else
    marker = (
      <span
        aria-hidden
        className={`w-6 h-6 border-2 flex items-center justify-center ${multi ? 'rounded-md' : 'rounded-full'} ${
          faded
            ? 'border-navy-100 bg-navy-100'
            : selected
              ? 'border-green-700 bg-green-700'
              : 'border-navy-400 bg-white'
        }`}
      >
        {selected &&
          !faded &&
          (multi ? <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} /> : <span className="w-2 h-2 rounded-full bg-white" />)}
      </span>
    );

  return (
    <li>
      <button
        type="button"
        role={multi ? 'checkbox' : 'radio'}
        aria-checked={selected}
        aria-disabled={disabled}
        onClick={disabled ? undefined : onClick}
        className={`w-full flex items-start gap-3 px-4 py-3.5 text-left ${
          disabled ? 'cursor-default' : 'hover:bg-navy-50'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-crimson-500/60`}
      >
        <span className="shrink-0 mt-px">{marker}</span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block text-sm text-navy-950">{label}</span>
          {verdict && (
            <>
              <span className={`block text-sm font-semibold ${verdict.correct ? 'text-green-700' : 'text-crimson-700'}`}>
                {verdict.correct ? 'Correct' : 'Incorrect'}
              </span>
              {verdict.feedback && <span className="block text-sm text-navy-600">{verdict.feedback}</span>}
            </>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * "Review this video" — the lesson a question points back to, opened inside the quiz so
 * the student keeps their place. A lesson without a video offers its reading instead.
 */
function ReviewLesson({ lesson }: { lesson: QuizReviewLessonDto }) {
  const [open, setOpen] = useState(false);
  const ytId = lesson.videoUrl ? youTubeId(lesson.videoUrl) : null;
  const hasVideo = !!lesson.videoUrl;
  const hasReading = !!lesson.description || lesson.documents.length > 0 || lesson.resources.length > 0;

  return (
    <div className="rounded-xl bg-navy-50 border border-navy-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-4 p-3 text-left hover:bg-navy-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-crimson-500/60"
      >
        <span className="relative w-28 aspect-video shrink-0 rounded-md overflow-hidden bg-navy-800 flex items-center justify-center">
          {ytId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
          )}
          <span className="relative flex items-center gap-1 text-white text-xs font-semibold">
            {hasVideo ? <PlayCircle className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
            {hasVideo ? 'Replay' : 'Read'}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-navy-500">{hasVideo ? 'Review this video' : 'Review this lesson'}</span>
          <span className="block text-sm font-semibold text-navy-950 truncate">{lesson.title}</span>
          <span className="block text-xs text-navy-500">
            {hasVideo ? formatLength(lesson.durationSeconds) : 'Reading'}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-navy-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="border-t border-navy-100 bg-white p-3 space-y-3">
          {hasVideo && (
            <div className="aspect-video bg-black rounded-lg overflow-hidden">
              {ytId ? (
                <iframe
                  src={youTubeEmbedUrl(ytId)}
                  title={lesson.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              ) : (
                <video src={lesson.videoUrl} controls className="w-full h-full" />
              )}
            </div>
          )}
          {lesson.description && <p className="text-xs text-navy-700 whitespace-pre-wrap">{lesson.description}</p>}
          <LessonResources resources={lesson.resources} documents={lesson.documents} />
          {!hasVideo && !hasReading && (
            <p className="text-xs text-navy-500">This lesson has no material to show here yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** A question on the "Review all answers" screen: the student's final answer and the key. */
function ReviewedQuestion({
  number,
  question,
  result,
}: {
  number: number;
  question: QuizQuestionPublicDto;
  result?: QuizGradeResultDto['perQuestionResults'][number];
}) {
  const selected = result?.selected;
  const picked = (i: number) => (Array.isArray(selected) ? selected.includes(i) : selected === i);
  const isKey = (i: number) =>
    result?.allowMultiple ? (result.correctIndices ?? []).includes(i) : result?.correctIndex === i;

  return (
    <div className="rounded-xl border border-navy-200 p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-navy-950">
          <span className="text-navy-400 mr-1.5">{number}.</span>
          {question.question}
        </p>
        <span
          className={`shrink-0 text-xs font-semibold ${result?.correct ? 'text-green-700' : 'text-crimson-700'}`}
        >
          {result?.correct ? 'Correct' : selected === null || selected === undefined ? 'Skipped' : 'Incorrect'}
        </span>
      </div>
      <ul className="space-y-1">
        {question.options?.map((opt, i) => {
          const key = isKey(i);
          const mine = picked(i);
          return (
            <li key={i} className="flex items-start gap-2 text-xs">
              {key ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" aria-hidden />
              ) : mine ? (
                <XCircle className="w-4 h-4 text-crimson-600 shrink-0" aria-hidden />
              ) : (
                <span className="w-4 h-4 shrink-0" />
              )}
              <span className={key ? 'text-green-800 font-semibold' : mine ? 'text-crimson-700' : 'text-navy-600'}>
                {opt}
                {mine && <span className="ml-1.5 font-mono text-[10px] uppercase tracking-wider">your answer</span>}
                {mine && result?.optionFeedback?.[i] && (
                  <span className="block font-normal text-navy-600 mt-0.5">{result.optionFeedback[i]}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {result?.explanation && <p className="text-xs text-navy-600 border-t border-navy-100 pt-2">{result.explanation}</p>}
    </div>
  );
}

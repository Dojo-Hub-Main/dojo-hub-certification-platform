'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, Clock, Sparkles, Users } from 'lucide-react';
import { AttemptTargetType, QuizDto, QuizGradeResultDto } from '@dojo-hub/shared';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

type Step = 'intro' | 'objective' | 'objective-done' | 'subjective' | 'results';

export function AssessmentWizard({
  type,
  fetchParam,
  onClose,
}: {
  type: AttemptTargetType;
  fetchParam: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const fetchPath = type === 'MODULE_QUIZ' ? `/quizzes/modules/${fetchParam}` : `/quizzes/tracks/${fetchParam}/assessment`;

  const { data: quiz, isLoading } = useQuery<QuizDto>({ queryKey: ['quiz', type, fetchParam], queryFn: () => api.get<QuizDto>(fetchPath) });

  const [step, setStep] = useState<Step>('intro');
  const [qIndex, setQIndex] = useState(0);
  const [objectiveAnswers, setObjectiveAnswers] = useState<Record<string, number>>({});
  const [subjectiveText, setSubjectiveText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizGradeResultDto | null>(null);

  const submit = useMutation({
    mutationFn: (gradingMode: 'AI' | 'MANUAL') => {
      const submitPath =
        type === 'MODULE_QUIZ' ? `/quizzes/module-quiz/${quiz!.id}/attempts` : `/quizzes/track-assessment/${quiz!.id}/attempts`;
      return api.post<QuizGradeResultDto>(submitPath, {
        objectiveAnswers,
        subjectiveAnswerText: subjectiveText || undefined,
        gradingMode,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      setStep('results');
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['enrollments', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['submissions', 'mine'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Submission failed. Please try again.'),
  });

  if (isLoading || !quiz) {
    return (
      <Modal open onClose={onClose} title="Loading quiz…" maxWidth="max-w-2xl">
        <div className="py-12 text-center text-sm text-navy-400 animate-pulse">Loading questions…</div>
      </Modal>
    );
  }

  const objectiveQuestions = quiz.objectiveQuestions;
  const currentQuestion = objectiveQuestions[qIndex];

  return (
    <Modal open onClose={onClose} title={quiz.title} maxWidth="max-w-2xl">
      {step === 'intro' && (
        <div className="space-y-4">
          <p className="text-sm text-navy-600">
            This quiz has {objectiveQuestions.length} objective question{objectiveQuestions.length !== 1 && 's'}
            {quiz.subjectiveQuestion && ' and one written answer'}.
          </p>
          <div className="bg-navy-50 rounded-xl border border-navy-200 p-4 text-xs space-y-1.5">
            {/* Weighting only exists when there is a written answer to weigh against. Quizzes
                built in the admin panel are multiple choice only, so stating a 40/60 split
                told every student something untrue about how they would be marked. */}
            {quiz.subjectiveQuestion ? (
              <>
                <p>
                  <span className="font-bold">Scoring:</span> multiple choice 40% / written answer 60%
                </p>
                <p>
                  <span className="font-bold">Pass mark:</span> {quiz.passThreshold}% overall
                </p>
              </>
            ) : (
              <p>
                <span className="font-bold">Pass mark:</span> {quiz.passThreshold}% of questions correct
              </p>
            )}
            <p>
              <span className="font-bold">Note:</span> this is an optional self-check — it doesn&apos;t affect your certification progress.
            </p>
          </div>
          <Button
            className="w-full"
            disabled={objectiveQuestions.length === 0 && !quiz.subjectiveQuestion}
            onClick={() => setStep(objectiveQuestions.length > 0 ? 'objective' : 'subjective')}
          >
            Start quiz
          </Button>
        </div>
      )}

      {step === 'objective' && currentQuestion && (
        <div className="space-y-4">
          <p className="text-[12px] font-mono uppercase text-navy-400">
            Question {qIndex + 1} of {objectiveQuestions.length}
          </p>
          <p className="text-sm font-bold text-navy-950">{currentQuestion.question}</p>
          <div className="space-y-2">
            {currentQuestion.options?.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => setObjectiveAnswers({ ...objectiveAnswers, [currentQuestion.id]: idx })}
                className={`w-full text-left px-4 py-2.5 rounded-xl border text-xs transition-colors ${
                  objectiveAnswers[currentQuestion.id] === idx
                    ? 'border-crimson-500 bg-crimson-50 font-semibold text-crimson-700'
                    : 'border-navy-200 hover:bg-navy-50'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="outline" size="sm" disabled={qIndex === 0} onClick={() => setQIndex(qIndex - 1)}>
              Back
            </Button>
            <Button
              size="sm"
              disabled={objectiveAnswers[currentQuestion.id] === undefined}
              onClick={() => {
                if (qIndex < objectiveQuestions.length - 1) setQIndex(qIndex + 1);
                else setStep(quiz.subjectiveQuestion ? 'subjective' : 'objective-done');
              }}
            >
              {qIndex < objectiveQuestions.length - 1 ? 'Next Question' : quiz.subjectiveQuestion ? 'Proceed to Subjective' : 'Review & Submit'}
            </Button>
          </div>
        </div>
      )}

      {step === 'subjective' && quiz.subjectiveQuestion && (
        <div className="space-y-4">
          <div className="bg-navy-50 rounded-xl border border-navy-200 p-4 text-xs space-y-2">
            <p className="font-bold text-navy-950">{quiz.subjectiveQuestion.prompt}</p>
            <p className="text-navy-500">{quiz.subjectiveQuestion.guidelines}</p>
            {!!quiz.subjectiveQuestion.sampleKeywords?.length && (
              <div className="flex flex-wrap gap-1">
                {quiz.subjectiveQuestion.sampleKeywords.map((k) => (
                  <span key={k} className="px-2 py-0.5 bg-white border border-navy-200 rounded-full text-[12px]">
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>
          <textarea
            value={subjectiveText}
            onChange={(e) => setSubjectiveText(e.target.value)}
            rows={6}
            placeholder="Write your response (minimum 30 characters)..."
            aria-label="Subjective question response"
            className="input resize-none"
          />
          {error && <p className="text-xs text-crimson-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="dark"
              size="sm"
              loading={submit.isPending}
              disabled={subjectiveText.trim().length < 30}
              onClick={() => submit.mutate('AI')}
              className="flex-col !items-start gap-0.5"
            >
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> AI Instant Grading
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={submit.isPending}
              disabled={subjectiveText.trim().length < 30}
              onClick={() => submit.mutate('MANUAL')}
            >
              <Users className="w-3.5 h-3.5" /> Manual Evaluator Review
            </Button>
          </div>
        </div>
      )}

      {!quiz.subjectiveQuestion && step === 'objective-done' && (
        <div className="space-y-4">
          <p className="text-sm text-navy-600">You&apos;ve answered every objective question. Ready to submit?</p>
          {error && <p className="text-xs text-crimson-600">{error}</p>}
          <Button className="w-full" loading={submit.isPending} onClick={() => submit.mutate('MANUAL')}>
            Submit Assessment
          </Button>
        </div>
      )}

      {step === 'results' && result && (
        <div className="space-y-4">
          {result.subjectiveStatus === 'PENDING_EVALUATOR' ? (
            <div className="bg-navy-50 border border-navy-200 rounded-xl p-4 text-center space-y-1">
              <Clock className="w-6 h-6 text-navy-600 mx-auto" />
              <p className="text-sm font-bold text-navy-800">Queued for Evaluator Review</p>
              <p className="text-xs text-navy-600">
                Objective score: {result.objectiveScore}/{result.objectiveTotal}. Your subjective answer will be graded by a supervisor.
              </p>
            </div>
          ) : (
            <div className={`rounded-xl p-4 text-center space-y-1 border ${result.passed ? 'bg-green-50 border-green-200' : 'bg-crimson-50 border-crimson-200'}`}>
              {result.passed ? (
                <CheckCircle2 className="w-6 h-6 text-green-600 mx-auto" />
              ) : (
                <XCircle className="w-6 h-6 text-crimson-600 mx-auto" />
              )}
              <p className={`text-sm font-bold ${result.passed ? 'text-green-800' : 'text-red-800'}`}>
                {result.passed ? `Passed — Weighted Score ${result.weightedScore}%` : `Not Passed — Weighted Score ${result.weightedScore}%`}
              </p>
              {result.subjectiveFeedback && <p className="text-xs text-navy-600 mt-2 text-left">{result.subjectiveFeedback}</p>}
            </div>
          )}

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {result.perQuestionResults.map((r, i) => (
              <div key={r.questionId} className={`text-xs p-2.5 rounded-lg border ${r.correct ? 'bg-green-50 border-green-100' : 'bg-crimson-50 border-red-100'}`}>
                <p className="font-semibold">
                  Question {i + 1}: {r.correct ? 'Correct' : 'Incorrect'}
                </p>
                <p className="text-navy-500 mt-0.5">{r.explanation}</p>
              </div>
            ))}
          </div>

          <Button className="w-full" variant="dark" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </Modal>
  );
}

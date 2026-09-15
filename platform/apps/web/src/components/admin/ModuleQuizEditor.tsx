'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, HelpCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ModuleDto, QuizQuestionAdminDto } from '@dojo-hub/shared';
import { api, ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

/**
 * Authoring for a module's quiz: create it, add, edit and remove questions, change its
 * title and pass mark, and hide it from students without losing the questions.
 *
 * Quizzes stay optional. A module without one simply has no quiz, and students only see
 * one once it has at least one question — the API reports an empty quiz as absent.
 */

type Draft = { question: string; options: string[]; correctIndex: number; explanation: string };

const BLANK: Draft = { question: '', options: ['', ''], correctIndex: 0, explanation: '' };

function toDraft(q: QuizQuestionAdminDto): Draft {
  return {
    question: q.question ?? '',
    options: q.options.length >= 2 ? [...q.options] : [...q.options, ...Array(2 - q.options.length).fill('')],
    correctIndex: q.correctIndex ?? 0,
    explanation: q.explanation ?? '',
  };
}

/**
 * Every option row must be filled rather than blanks being dropped on save. Dropping them
 * shifted the positions of the options after a blank, so the marked correct answer could
 * silently end up pointing at a different option — or at nothing.
 */
function validationMessage(d: Draft): string | null {
  if (d.question.trim().length < 5) return 'Write a question of at least 5 characters.';
  if (d.options.length < 2) return 'Add at least two options.';
  if (d.options.some((o) => o.trim().length === 0)) return 'Fill in every option, or remove the empty ones.';
  if (d.correctIndex >= d.options.length) return 'Mark which option is correct.';
  if (d.explanation.trim().length < 5) return 'Add an explanation of at least 5 characters.';
  return null;
}

export function ModuleQuizEditor({ mod, trackId }: { mod: ModuleDto; trackId: string }) {
  const queryClient = useQueryClient();
  const quiz = mod.quiz ?? null;

  // One form open at a time: 'new', a question id being edited, or nothing.
  const [editing, setEditing] = useState<'new' | string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [editingSettings, setEditingSettings] = useState(false);
  const [settings, setSettings] = useState({ title: '', passThreshold: 70 });
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['track', 'admin', trackId] });
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
  const done = () => {
    setError(null);
    refresh();
  };

  const createQuiz = useMutation({
    mutationFn: () => api.post('/quizzes/modules/' + mod.id, { title: mod.title + ' — Quiz', passThreshold: 70 }),
    onSuccess: done,
    onError: fail,
  });

  const payload = () => ({
    question: draft.question.trim(),
    options: draft.options.map((o) => o.trim()),
    correctIndex: draft.correctIndex,
    explanation: draft.explanation.trim(),
  });

  const saveQuestion = useMutation({
    mutationFn: () =>
      editing === 'new'
        ? api.post('/quizzes/module-quiz/' + quiz!.id + '/questions', { type: 'OBJECTIVE', ...payload() })
        : api.patch('/quizzes/questions/' + editing, payload()),
    onSuccess: () => {
      setEditing(null);
      setDraft(BLANK);
      done();
    },
    onError: fail,
  });

  const removeQuestion = useMutation({
    mutationFn: (questionId: string) => api.delete('/quizzes/questions/' + questionId),
    onSuccess: () => {
      setConfirmingDelete(null);
      done();
    },
    onError: fail,
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      api.patch('/quizzes/module-quiz/' + quiz!.id, {
        title: settings.title.trim(),
        passThreshold: settings.passThreshold,
      }),
    onSuccess: () => {
      setEditingSettings(false);
      done();
    },
    onError: fail,
  });

  const toggleEnabled = useMutation({
    mutationFn: () => api.patch('/tracks/modules/' + mod.id, { quizEnabled: !mod.quizEnabled }),
    onSuccess: done,
    onError: fail,
  });

  const openNew = () => {
    setError(null);
    setDraft(BLANK);
    setEditing('new');
  };
  const openEdit = (q: QuizQuestionAdminDto) => {
    setError(null);
    setConfirmingDelete(null);
    setDraft(toDraft(q));
    setEditing(q.id);
  };
  const closeForm = () => {
    setEditing(null);
    setDraft(BLANK);
    setError(null);
  };

  if (!quiz) {
    return (
      <div className="rounded-xl border border-dashed border-navy-200 bg-navy-50/60 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-start gap-2.5">
          <HelpCircle className="w-4 h-4 text-navy-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-navy-950">No quiz on this module</p>
            <p className="text-xs text-navy-500">
              Optional — add one only if students should be tested at the end of this module.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => createQuiz.mutate()} loading={createQuiz.isPending} className="shrink-0">
          <Plus className="w-3.5 h-3.5" /> Add quiz
        </Button>
      </div>
    );
  }

  const titleValid = settings.title.trim().length >= 3;
  const passValid = Number.isInteger(settings.passThreshold) && settings.passThreshold >= 1 && settings.passThreshold <= 100;
  const draftProblem = validationMessage(draft);

  const questionForm = (
    <div className="p-4 space-y-3 bg-navy-50/60 border-t border-navy-100">
      <p className="text-[11px] font-mono uppercase tracking-wider font-bold text-navy-500">
        {editing === 'new' ? 'New question' : 'Edit question'}
      </p>
      <input
        className="input text-sm"
        placeholder="Question"
        value={draft.question}
        onChange={(e) => setDraft({ ...draft, question: e.target.value })}
      />

      <div className="space-y-2">
        <p className="text-[11px] font-mono uppercase tracking-wider text-navy-500">
          Options — click the circle beside the correct answer
        </p>
        {draft.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <button
              type="button"
              aria-label={'Mark option ' + (i + 1) + ' as correct'}
              onClick={() => setDraft({ ...draft, correctIndex: i })}
              className={
                draft.correctIndex === i
                  ? 'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center border-green-600 bg-green-600'
                  : 'w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center border-navy-300 hover:border-navy-500'
              }
            >
              {draft.correctIndex === i && <CheckCircle2 className="w-3 h-3 text-white" />}
            </button>
            <input
              className="input text-sm py-2"
              placeholder={'Option ' + (i + 1)}
              value={opt}
              onChange={(e) => {
                const options = [...draft.options];
                options[i] = e.target.value;
                setDraft({ ...draft, options });
              }}
            />
            {draft.options.length > 2 && (
              <button
                type="button"
                aria-label={'Remove option ' + (i + 1)}
                onClick={() => {
                  const options = draft.options.filter((_, oi) => oi !== i);
                  // Keep the mark on the same option when an earlier one is removed.
                  let correctIndex = draft.correctIndex;
                  if (i < correctIndex) correctIndex -= 1;
                  else if (i === correctIndex) correctIndex = 0;
                  setDraft({ ...draft, options, correctIndex });
                }}
                className="p-1.5 text-navy-400 hover:text-crimson-600 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setDraft({ ...draft, options: [...draft.options, ''] })}
          className="text-xs font-bold text-crimson-600 hover:underline"
        >
          + Add option
        </button>
      </div>

      <textarea
        className="input text-sm resize-y"
        rows={2}
        placeholder="Explanation — shown to students after they submit"
        value={draft.explanation}
        onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
      />

      {editing !== 'new' && (
        <p className="text-[11px] text-navy-500">
          Changes apply to students who take the quiz from now on. Scores already recorded stay as they were.
        </p>
      )}

      {draftProblem && <p className="text-xs text-navy-500">{draftProblem}</p>}

      <div className="flex gap-2">
        <Button size="sm" onClick={() => saveQuestion.mutate()} loading={saveQuestion.isPending} disabled={!!draftProblem}>
          {editing === 'new' ? 'Save question' : 'Save changes'}
        </Button>
        <Button size="sm" variant="outline" onClick={closeForm}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-navy-200 bg-white overflow-hidden">
      {/* ------------------------------------------------------------ header / settings */}
      {editingSettings ? (
        <div className="bg-navy-50 px-4 py-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <label className="space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-navy-500">Quiz title</span>
              <input
                className="input text-sm py-2"
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-navy-500">Pass mark %</span>
              <input
                type="number"
                min={1}
                max={100}
                className="input text-sm py-2"
                value={Number.isNaN(settings.passThreshold) ? '' : settings.passThreshold}
                onChange={(e) => setSettings({ ...settings, passThreshold: parseInt(e.target.value, 10) })}
              />
            </label>
          </div>
          {!titleValid && <p className="text-xs text-navy-500">The title needs at least 3 characters.</p>}
          {!passValid && <p className="text-xs text-navy-500">The pass mark must be a whole number from 1 to 100.</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => saveSettings.mutate()} loading={saveSettings.isPending} disabled={!titleValid || !passValid}>
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingSettings(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-navy-50 px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-navy-950 truncate">{quiz.title}</p>
            <p className="text-[11px] text-navy-500">
              {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'} · pass mark {quiz.passThreshold}%
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Badge tone={mod.quizEnabled && quiz.questions.length > 0 ? 'green' : 'gray'}>
              {!mod.quizEnabled ? 'Hidden' : quiz.questions.length === 0 ? 'Not visible yet' : 'Live'}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setError(null);
                setSettings({ title: quiz.title, passThreshold: quiz.passThreshold });
                setEditingSettings(true);
              }}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit settings
            </Button>
            <Button size="sm" variant="outline" onClick={() => toggleEnabled.mutate()} loading={toggleEnabled.isPending}>
              {mod.quizEnabled ? 'Hide from students' : 'Show to students'}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="px-4 pt-3 text-xs font-semibold text-crimson-700" role="alert">
          {error}
        </p>
      )}

      {quiz.questions.length === 0 && editing !== 'new' && (
        <p className="px-4 py-3 text-xs text-navy-500">
          No questions yet. Students won&apos;t see this quiz until it has at least one.
        </p>
      )}

      {/* -------------------------------------------------------------------- questions */}
      <ul className="divide-y divide-navy-100">
        {quiz.questions.map((q, i) =>
          editing === q.id ? (
            <li key={q.id}>{questionForm}</li>
          ) : (
            <li key={q.id} className="px-4 py-3 flex items-start gap-3">
              <span className="text-[11px] font-mono text-navy-400 mt-0.5 shrink-0 tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-navy-950">{q.question ?? q.prompt}</p>
                {q.type === 'OBJECTIVE' && (
                  <ul className="mt-1.5 space-y-0.5">
                    {q.options.map((opt, oi) => (
                      <li
                        key={oi}
                        className={
                          oi === q.correctIndex
                            ? 'text-xs flex items-center gap-1.5 text-green-700 font-semibold'
                            : 'text-xs flex items-center gap-1.5 text-navy-500'
                        }
                      >
                        {oi === q.correctIndex ? <CheckCircle2 className="w-3 h-3 shrink-0" /> : <span className="w-3 shrink-0" />}
                        {opt}
                      </li>
                    ))}
                  </ul>
                )}

                {confirmingDelete === q.id && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-crimson-200 bg-crimson-50 px-3 py-2">
                    <span className="text-xs font-semibold text-crimson-800">Delete this question? This can&apos;t be undone.</span>
                    <Button size="sm" onClick={() => removeQuestion.mutate(q.id)} loading={removeQuestion.isPending}>
                      Delete
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(null)}>
                      Keep
                    </Button>
                  </div>
                )}
              </div>

              {q.type === 'OBJECTIVE' && (
                <button
                  onClick={() => openEdit(q)}
                  aria-label={'Edit question ' + (i + 1)}
                  className="p-1.5 rounded-lg text-navy-400 hover:text-navy-950 hover:bg-navy-50 shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => {
                  setEditing(null);
                  setConfirmingDelete(q.id);
                }}
                aria-label={'Delete question ' + (i + 1)}
                className="p-1.5 rounded-lg text-navy-400 hover:text-crimson-600 hover:bg-crimson-50 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ),
        )}
      </ul>

      {editing === 'new' ? (
        questionForm
      ) : (
        <div className="p-3 border-t border-navy-100">
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="w-3.5 h-3.5" /> Add question
          </Button>
        </div>
      )}
    </div>
  );
}

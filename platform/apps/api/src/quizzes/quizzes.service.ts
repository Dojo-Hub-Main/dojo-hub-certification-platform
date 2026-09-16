import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttemptTargetType,
  AuditLogSeverity,
  NotificationType,
  QuizQuestionType,
  SubjectiveGradedBy,
  SubjectiveStatus,
} from '@dojo-hub/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { AiGradingService } from '../ai-grading/ai-grading.service';
import { RequestUser } from '../common/types/request-user.interface';
import {
  CreateModuleQuizDto,
  CreateTrackAssessmentDto,
} from './dto/create-quiz.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateModuleQuizDto, UpdateQuestionDto } from './dto/update-question.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { GradeAttemptDto } from './dto/grade-attempt.dto';

@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly enrollmentsService: EnrollmentsService,
    private readonly aiGradingService: AiGradingService,
  ) {}

  // -------------------------------------------------------------------------
  // Authoring (admin)
  // -------------------------------------------------------------------------

  async createModuleQuiz(
    actor: RequestUser,
    moduleId: string,
    dto: CreateModuleQuizDto,
  ) {
    const quiz = await this.prisma.moduleQuiz.create({
      data: { ...dto, moduleId },
    });
    await this.auditService.log({
      actor,
      action: `Created chapter quiz "${quiz.title}"`,
      entityType: 'ModuleQuiz',
      entityId: quiz.id,
    });
    return quiz;
  }

  async createTrackAssessment(
    actor: RequestUser,
    trackId: string,
    dto: CreateTrackAssessmentDto,
  ) {
    const assessment = await this.prisma.trackAssessment.create({
      data: { ...dto, trackId },
    });
    await this.auditService.log({
      actor,
      action: `Created final course assessment "${assessment.title}"`,
      entityType: 'TrackAssessment',
      entityId: assessment.id,
    });
    return assessment;
  }

  async addQuestion(
    actor: RequestUser,
    target: { moduleQuizId?: string; trackAssessmentId?: string },
    dto: CreateQuestionDto,
  ) {
    // A written question has no answer key, so any key fields sent with one are dropped.
    const { allowMultiple, correctIndex, correctIndices, ...fields } = dto;
    const answerKey =
      dto.type === QuizQuestionType.OBJECTIVE
        ? this.resolveAnswerKey(
            dto.options ?? [],
            allowMultiple ?? false,
            correctIndex,
            correctIndices,
          )
        : { allowMultiple: false, correctIndex: null, correctIndices: [] };

    // Next position comes from the highest existing one, not the count. After a delete
    // the count no longer matches the positions in use, so count-based ordering handed
    // a new question a slot another question already held.
    const last = await this.prisma.quizQuestion.findFirst({
      where: target,
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const question = await this.prisma.quizQuestion.create({
      data: {
        ...target,
        ...fields,
        ...answerKey,
        order: last ? last.order + 1 : 0,
        options: dto.options ?? [],
        sampleKeywords: dto.sampleKeywords ?? [],
      },
    });
    await this.auditService.log({
      actor,
      action: 'Added a quiz question',
      entityType: 'QuizQuestion',
      entityId: question.id,
    });
    return question;
  }

  async removeQuestion(actor: RequestUser, questionId: string) {
    const removed = await this.prisma.quizQuestion.findUnique({
      where: { id: questionId },
    });
    if (!removed) throw new NotFoundException('Question not found.');

    // Delete and renumber together, so the remaining questions stay numbered 0..n-1
    // with no gap where this one was.
    await this.prisma.$transaction([
      this.prisma.quizQuestion.delete({ where: { id: questionId } }),
      this.prisma.quizQuestion.updateMany({
        where: {
          moduleQuizId: removed.moduleQuizId,
          trackAssessmentId: removed.trackAssessmentId,
          order: { gt: removed.order },
        },
        data: { order: { decrement: 1 } },
      }),
    ]);
    await this.auditService.log({
      actor,
      action: 'Removed a quiz question',
      entityType: 'QuizQuestion',
      entityId: questionId,
      severity: AuditLogSeverity.WARNING,
    });
    return { success: true };
  }

  /**
   * Edits a saved question. Only the fields sent are changed.
   *
   * Scores already recorded are left alone: an attempt stores its score at the moment it
   * was graded, so editing a question changes what future students see without rewriting
   * the result of anyone who has already taken it.
   */
  async updateQuestion(
    actor: RequestUser,
    questionId: string,
    dto: UpdateQuestionDto,
  ) {
    const existing = await this.prisma.quizQuestion.findUnique({
      where: { id: questionId },
    });
    if (!existing) throw new NotFoundException('Question not found.');

    // Validate against the question as it will be after the edit, not just the fields
    // sent. Removing an option can leave a stored correct answer pointing past the end,
    // and switching between one and several correct answers needs the matching key.
    const { allowMultiple, correctIndex, correctIndices, ...fields } = dto;
    const answerKey =
      existing.type === QuizQuestionType.OBJECTIVE
        ? this.resolveAnswerKey(
            dto.options ?? existing.options,
            allowMultiple ?? existing.allowMultiple,
            correctIndex ?? existing.correctIndex,
            correctIndices ?? existing.correctIndices,
          )
        : {};

    const question = await this.prisma.quizQuestion.update({
      where: { id: questionId },
      data: { ...fields, ...answerKey },
    });

    await this.auditService.log({
      actor,
      action: 'Edited a quiz question',
      entityType: 'QuizQuestion',
      entityId: questionId,
    });
    return question;
  }

  async updateModuleQuiz(
    actor: RequestUser,
    quizId: string,
    dto: UpdateModuleQuizDto,
  ) {
    const quiz = await this.prisma.moduleQuiz.update({
      where: { id: quizId },
      data: dto,
    });
    await this.auditService.log({
      actor,
      action: `Updated chapter quiz "${quiz.title}"`,
      entityType: 'ModuleQuiz',
      entityId: quizId,
    });
    return quiz;
  }

  /**
   * A quiz belongs to a course, and lessons in a course are locked until the student
   * enrols. Without this, anyone signed in could sit a course's quizzes without joining it.
   * A module quiz that an admin has hidden is also closed to new attempts, not just
   * removed from the syllabus.
   */
  private async assertCanAttempt(
    actor: RequestUser,
    type: AttemptTargetType,
    targetId: string,
  ) {
    let trackId: string;

    if (type === AttemptTargetType.MODULE_QUIZ) {
      const quiz = await this.prisma.moduleQuiz.findUnique({
        where: { id: targetId },
        include: { module: { select: { trackId: true, quizEnabled: true } } },
      });
      if (!quiz) throw new NotFoundException('Quiz not found.');
      if (!quiz.module.quizEnabled) {
        throw new BadRequestException('This quiz is not currently available.');
      }
      trackId = quiz.module.trackId;
    } else {
      const assessment = await this.prisma.trackAssessment.findUnique({
        where: { id: targetId },
        select: { trackId: true },
      });
      if (!assessment) throw new NotFoundException('Assessment not found.');
      trackId = assessment.trackId;
    }

    const enrolment = await this.prisma.enrollment.findUnique({
      where: { userId_trackId: { userId: actor.id, trackId } },
      select: { id: true },
    });
    if (!enrolment) {
      throw new BadRequestException('Enrol in this course to take its quizzes.');
    }
  }

  /**
   * The stored answer key for a multiple-choice question. Exactly one of the two keys is
   * kept — correctIndex for one correct answer, correctIndices for several — so marking
   * never has to guess which applies. An answer pointing at an option that does not
   * exist could never be scored correct, so that is refused here.
   */
  private resolveAnswerKey(
    options: string[],
    allowMultiple: boolean,
    correctIndex: number | null | undefined,
    correctIndices: number[] | undefined,
  ): { allowMultiple: boolean; correctIndex: number | null; correctIndices: number[] } {
    const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < options.length;

    if (allowMultiple) {
      const key = [...new Set(correctIndices ?? [])].sort((a, b) => a - b);
      if (key.length === 0) {
        throw new BadRequestException('Tick at least one correct option.');
      }
      if (!key.every(inRange)) {
        throw new BadRequestException(
          'Every correct answer must be one of the options provided.',
        );
      }
      return { allowMultiple: true, correctIndex: null, correctIndices: key };
    }

    if (correctIndex === null || correctIndex === undefined) {
      throw new BadRequestException('Mark which option is correct.');
    }
    if (!inRange(correctIndex)) {
      throw new BadRequestException(
        'The correct answer must be one of the options provided.',
      );
    }
    return { allowMultiple: false, correctIndex, correctIndices: [] };
  }

  /**
   * One correct answer: the chosen option must be it. Several: all-or-nothing — the
   * student must tick every correct option and no others, the same rule LinkedIn Learning
   * and most course platforms use, so ticking everything can never score.
   */
  private static isAnsweredCorrectly(
    q: { allowMultiple: boolean; correctIndex: number | null; correctIndices: number[] },
    selected: unknown,
  ): boolean {
    if (!q.allowMultiple) return selected === q.correctIndex;
    if (!Array.isArray(selected)) return false;
    const ticked = new Set(selected);
    return (
      ticked.size === q.correctIndices.length &&
      q.correctIndices.every((i) => ticked.has(i))
    );
  }

  // -------------------------------------------------------------------------
  // Student-facing reads (answer keys stripped)
  // -------------------------------------------------------------------------

  async getModuleQuiz(moduleId: string) {
    const quiz = await this.prisma.moduleQuiz.findUnique({
      where: { moduleId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!quiz)
      throw new NotFoundException('This module does not have a chapter quiz.');
    return this.toPublicQuizDto(quiz, AttemptTargetType.MODULE_QUIZ, moduleId);
  }

  async getTrackAssessment(trackId: string) {
    const assessment = await this.prisma.trackAssessment.findUnique({
      where: { trackId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!assessment)
      throw new NotFoundException(
        'This track does not have a final assessment.',
      );
    return this.toPublicQuizDto(
      assessment,
      AttemptTargetType.TRACK_ASSESSMENT,
      trackId,
    );
  }

  /**
   * Reshapes a raw quiz/assessment + its flat question list into the QuizDto
   * shape the student-facing wizard actually consumes (objectiveQuestions[]
   * plus a single optional subjectiveQuestion), with answer keys stripped.
   */
  private toPublicQuizDto<
    Q extends {
      id: string;
      type: QuizQuestionType;
      correctIndex: number | null;
      correctIndices: number[];
      explanation: string | null;
    },
    T extends {
      id: string;
      title: string;
      passThreshold: number;
      questions: Q[];
    },
  >(quiz: T, targetType: AttemptTargetType, targetId: string) {
    // The explanation is withheld as well as the answer key. It is shown after marking,
    // via perQuestionResults, but sending it with the questions put it in the browser
    // before the student answered — and an explanation usually names the right option.
    const stripped = quiz.questions.map(
      ({ correctIndex, correctIndices, explanation, ...rest }) => rest,
    );
    return {
      id: quiz.id,
      targetType,
      targetId,
      title: quiz.title,
      passThreshold: quiz.passThreshold,
      objectiveQuestions: stripped.filter(
        (q) => q.type === QuizQuestionType.OBJECTIVE,
      ),
      subjectiveQuestion:
        stripped.find((q) => q.type === QuizQuestionType.SUBJECTIVE) ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Attempts
  // -------------------------------------------------------------------------

  /**
   * Marks a single answer while the student is still taking the quiz, so a mistake is
   * explained while the question is still in front of them rather than at the end.
   *
   * Chapter quizzes only. They are an optional self-check that changes no record, so
   * showing the answer key one question at a time costs nothing. The final course
   * assessment decides whether a course is completed, so it is marked only on submission.
   */
  async checkAnswer(
    actor: RequestUser,
    questionId: string,
    answer: number | number[],
  ) {
    const question = await this.prisma.quizQuestion.findUnique({
      where: { id: questionId },
    });
    if (!question) throw new NotFoundException('Question not found.');
    if (!question.moduleQuizId || question.type !== QuizQuestionType.OBJECTIVE) {
      throw new ForbiddenException(
        'Answers are only revealed question by question on chapter quizzes.',
      );
    }

    await this.assertCanAttempt(
      actor,
      AttemptTargetType.MODULE_QUIZ,
      question.moduleQuizId,
    );

    return {
      questionId,
      correct: QuizzesService.isAnsweredCorrectly(question, answer),
      correctIndex: question.correctIndex,
      correctIndices: question.correctIndices,
      explanation: question.explanation ?? '',
    };
  }

  async submitAttempt(
    actor: RequestUser,
    type: AttemptTargetType,
    targetId: string,
    dto: SubmitAttemptDto,
  ) {
    await this.assertCanAttempt(actor, type, targetId);

    const questions = await this.prisma.quizQuestion.findMany({
      where:
        type === AttemptTargetType.MODULE_QUIZ
          ? { moduleQuizId: targetId }
          : { trackAssessmentId: targetId },
    });
    if (questions.length === 0) throw new NotFoundException('Quiz not found.');

    const objectiveQuestions = questions.filter(
      (q) => q.type === QuizQuestionType.OBJECTIVE,
    );
    const subjectiveQuestion = questions.find(
      (q) => q.type === QuizQuestionType.SUBJECTIVE,
    );

    let objectiveScore = 0;
    const perQuestionResults = objectiveQuestions.map((q) => {
      const correct = QuizzesService.isAnsweredCorrectly(
        q,
        dto.objectiveAnswers[q.id],
      );
      if (correct) objectiveScore += 1;
      return { questionId: q.id, correct, explanation: q.explanation ?? '' };
    });

    if (
      subjectiveQuestion &&
      (!dto.subjectiveAnswerText || dto.subjectiveAnswerText.trim().length < 30)
    ) {
      throw new BadRequestException(
        'A subjective answer of at least 30 characters is required.',
      );
    }

    const quizMeta =
      type === AttemptTargetType.MODULE_QUIZ
        ? await this.prisma.moduleQuiz.findUniqueOrThrow({
            where: { id: targetId },
          })
        : await this.prisma.trackAssessment.findUniqueOrThrow({
            where: { id: targetId },
          });

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        userId: actor.id,
        type,
        moduleQuizId:
          type === AttemptTargetType.MODULE_QUIZ ? targetId : undefined,
        trackAssessmentId:
          type === AttemptTargetType.TRACK_ASSESSMENT ? targetId : undefined,
        objectiveAnswers: dto.objectiveAnswers,
        objectiveScore,
        objectiveTotal: objectiveQuestions.length,
        subjectiveAnswerText: dto.subjectiveAnswerText,
        subjectiveStatus: subjectiveQuestion
          ? SubjectiveStatus.UNGRADED
          : SubjectiveStatus.GRADED,
      },
    });

    if (!subjectiveQuestion) {
      const objectivePct = objectiveQuestions.length
        ? (objectiveScore / objectiveQuestions.length) * 100
        : 100;
      return this.finalize(
        attempt.id,
        actor,
        quizMeta,
        type,
        targetId,
        Math.round(objectivePct),
        null,
        null,
        perQuestionResults,
        undefined,
        objectiveScore,
        objectiveQuestions.length,
      );
    }

    if (dto.gradingMode === 'AI' && this.aiGradingService.isAvailable()) {
      const result = await this.aiGradingService.gradeSubjective({
        prompt: subjectiveQuestion.prompt ?? '',
        guidelines: subjectiveQuestion.guidelines ?? '',
        sampleKeywords: subjectiveQuestion.sampleKeywords,
        studentAnswer: dto.subjectiveAnswerText!,
      });

      await this.prisma.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          subjectiveScore: result.score,
          subjectiveFeedback: result.feedback,
          subjectiveGradedBy: SubjectiveGradedBy.AI,
          subjectiveStatus: SubjectiveStatus.GRADED,
        },
      });

      const objectivePct = objectiveQuestions.length
        ? (objectiveScore / objectiveQuestions.length) * 100
        : 100;
      return this.finalize(
        attempt.id,
        actor,
        quizMeta,
        type,
        targetId,
        Math.round(objectivePct),
        result.score,
        result.feedback,
        perQuestionResults,
        undefined,
        objectiveScore,
        objectiveQuestions.length,
      );
    }

    // Manual evaluator queue path
    await this.prisma.quizAttempt.update({
      where: { id: attempt.id },
      data: { subjectiveStatus: SubjectiveStatus.PENDING_EVALUATOR },
    });

    await this.auditService.log({
      actor,
      action: `Submitted "${quizMeta.title}" for manual evaluator grading`,
      entityType: 'QuizAttempt',
      entityId: attempt.id,
    });

    return {
      attemptId: attempt.id,
      objectiveScore,
      objectiveTotal: objectiveQuestions.length,
      objectivePercentage: objectiveQuestions.length
        ? Math.round((objectiveScore / objectiveQuestions.length) * 100)
        : 100,
      subjectiveScore: null,
      subjectiveStatus: SubjectiveStatus.PENDING_EVALUATOR,
      subjectiveFeedback: null,
      weightedScore: null,
      passed: null,
      perQuestionResults,
    };
  }

  async gradeAttemptManually(
    actor: RequestUser,
    attemptId: string,
    dto: GradeAttemptDto,
  ) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
    });
    if (!attempt) throw new NotFoundException('Attempt not found.');
    if (attempt.subjectiveStatus !== SubjectiveStatus.PENDING_EVALUATOR) {
      throw new ForbiddenException(
        'This attempt is not awaiting manual grading.',
      );
    }

    await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: {
        subjectiveScore: dto.score,
        subjectiveFeedback: dto.feedback,
        subjectiveGradedBy: SubjectiveGradedBy.EVALUATOR,
        subjectiveStatus: SubjectiveStatus.GRADED,
      },
    });

    const quizMeta =
      attempt.type === AttemptTargetType.MODULE_QUIZ
        ? await this.prisma.moduleQuiz.findUniqueOrThrow({
            where: { id: attempt.moduleQuizId! },
          })
        : await this.prisma.trackAssessment.findUniqueOrThrow({
            where: { id: attempt.trackAssessmentId! },
          });

    const objectivePct = attempt.objectiveTotal
      ? Math.round((attempt.objectiveScore / attempt.objectiveTotal) * 100)
      : 100;
    const studentUser = await this.prisma.user.findUniqueOrThrow({
      where: { id: attempt.userId },
    });

    return this.finalize(
      attemptId,
      {
        id: studentUser.id,
        name: studentUser.name,
        email: studentUser.email,
        role: studentUser.role,
      },
      quizMeta,
      attempt.type,
      (attempt.moduleQuizId ?? attempt.trackAssessmentId)!,
      objectivePct,
      dto.score,
      dto.feedback,
      [],
      actor,
      attempt.objectiveScore,
      attempt.objectiveTotal,
    );
  }

  async pendingManualGrading() {
    return this.prisma.quizAttempt.findMany({
      where: { subjectiveStatus: SubjectiveStatus.PENDING_EVALUATOR },
      orderBy: { createdAt: 'asc' },
      include: {
        moduleQuiz: { include: { module: { include: { track: true } } } },
        trackAssessment: { include: { track: true } },
      },
    });
  }

  private async finalize(
    attemptId: string,
    student: RequestUser,
    quizMeta: { title: string; passThreshold: number },
    type: AttemptTargetType,
    targetId: string,
    objectivePct: number,
    subjectiveScore: number | null,
    subjectiveFeedback: string | null,
    perQuestionResults: {
      questionId: string;
      correct: boolean;
      explanation: string;
    }[],
    graderActor?: RequestUser,
    objectiveScore = 0,
    objectiveTotal = 0,
  ) {
    const weightedScore =
      subjectiveScore === null
        ? objectivePct
        : Math.round(objectivePct * 0.4 + subjectiveScore * 0.6);
    const passed = weightedScore >= quizMeta.passThreshold;

    if (passed && type === AttemptTargetType.TRACK_ASSESSMENT) {
      const assessment = await this.prisma.trackAssessment.findUnique({
        where: { id: targetId },
      });
      if (assessment)
        await this.enrollmentsService.markCompleted(
          student.id,
          assessment.trackId,
        );
    }

    await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { weightedScore, passed },
    });

    await this.notificationsService.notify({
      userId: student.id,
      type: NotificationType.SUBMISSION_GRADED,
      title: passed
        ? `You passed "${quizMeta.title}"!`
        : `"${quizMeta.title}" needs another attempt`,
      body: passed
        ? `Weighted score ${weightedScore}% — nice work. This is a self-check only, it doesn't affect your certification progress.`
        : `Weighted score ${weightedScore}% — the pass threshold is ${quizMeta.passThreshold}%. This is a self-check only; review the feedback and try again whenever you like.`,
    });

    if (graderActor) {
      await this.auditService.log({
        actor: graderActor,
        action: `Manually graded "${quizMeta.title}" for ${student.name}: ${weightedScore}% (${passed ? 'passed' : 'failed'})`,
        entityType: 'QuizAttempt',
        entityId: attemptId,
        severity: AuditLogSeverity.SUCCESS,
      });
    }

    return {
      attemptId,
      objectiveScore,
      objectiveTotal,
      objectivePercentage: objectivePct,
      subjectiveScore,
      subjectiveStatus: SubjectiveStatus.GRADED,
      subjectiveFeedback,
      weightedScore,
      passed,
      perQuestionResults,
    };
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  AuditLogSeverity,
  NotificationType,
  SubmissionStatus,
  SubmissionType,
  UserRole,
} from '@dojo-hub/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { CredentialsService } from '../credentials/credentials.service';
import { RequestUser } from '../common/types/request-user.interface';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';

const WEB = process.env.WEB_URL ?? 'https://dojo-hub-web.onrender.com';

const FULL_INCLUDE = {
  files: true,
  rubricChecks: true,
  level: true,
  topic: { include: { module: { include: { track: true } } } },
  module: { include: { track: true } },
  evaluator: true,
};

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
    private readonly credentialsService: CredentialsService,
  ) {}

  async create(actor: RequestUser, dto: CreateSubmissionDto) {
    if (dto.type === SubmissionType.CAPSTONE) {
      if (!dto.levelId)
        throw new BadRequestException(
          'levelId is required for capstone submissions.',
        );

      const profile = await this.prisma.studentProfile.findUnique({
        where: { userId: actor.id },
      });
      if (!profile || profile.currentLevelId !== dto.levelId) {
        throw new BadRequestException(
          'You can only submit a capstone project for your current certification level.',
        );
      }

      const existingPending = await this.prisma.submission.findFirst({
        where: {
          studentId: actor.id,
          type: SubmissionType.CAPSTONE,
          levelId: dto.levelId,
          status: SubmissionStatus.PENDING,
        },
      });
      if (existingPending) {
        throw new BadRequestException(
          'You already have a pending capstone submission for this level.',
        );
      }
    } else {
      if (!dto.topicId && !dto.moduleId)
        throw new BadRequestException(
          'Either topicId or moduleId is required for competency submissions.',
        );
      const existing = await this.prisma.submission.findFirst({
        where: {
          studentId: actor.id,
          type: SubmissionType.COMPETENCY,
          ...(dto.topicId
            ? { topicId: dto.topicId }
            : { moduleId: dto.moduleId }),
          status: { in: [SubmissionStatus.PENDING, SubmissionStatus.APPROVED] },
        },
      });
      if (existing) {
        throw new BadRequestException(
          `You already have a pending or approved submission for this ${dto.topicId ? 'topic' : 'module'}.`,
        );
      }
    }

    const rubricRequirements =
      dto.type === SubmissionType.COMPETENCY
        ? await this.collectRubricRequirements(dto.topicId, dto.moduleId)
        : [];

    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.submission.create({
        data: {
          type: dto.type,
          studentId: actor.id,
          levelId:
            dto.type === SubmissionType.CAPSTONE ? dto.levelId : undefined,
          topicId:
            dto.type === SubmissionType.COMPETENCY ? dto.topicId : undefined,
          moduleId:
            dto.type === SubmissionType.COMPETENCY ? dto.moduleId : undefined,
          title: dto.title,
          submissionText: dto.submissionText,
          links: (dto.links ?? []) as unknown as Prisma.InputJsonValue,
          status: SubmissionStatus.PENDING,
        },
      });

      if (dto.fileIds?.length) {
        await tx.storedFile.updateMany({
          where: { id: { in: dto.fileIds }, uploadedById: actor.id },
          data: { submissionId: created.id },
        });
      }

      if (rubricRequirements.length > 0) {
        await tx.submissionRubricCheck.createMany({
          data: rubricRequirements.map((requirement) => ({
            submissionId: created.id,
            requirement,
            checked: false,
          })),
        });
      }

      return created;
    });

    await this.auditService.log({
      actor,
      action: `Submitted ${dto.type === SubmissionType.CAPSTONE ? 'capstone project' : 'competency evidence'}: "${dto.title}"`,
      entityType: 'Submission',
      entityId: submission.id,
    });

    await this.notifyReviewers(actor, dto.title, submission.id);

    const created = await this.prisma.submission.findUniqueOrThrow({
      where: { id: submission.id },
      include: FULL_INCLUDE,
    });
    return this.sanitizeSubmission(created);
  }

  /**
   * Submissions land in one shared queue rather than being assigned, so every
   * active evaluator (and admin, who can also grade) is told when work arrives.
   */
  private async notifyReviewers(
    actor: RequestUser,
    submissionTitle: string,
    submissionId: string,
  ) {
    const [student, reviewers] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: actor.id },
        select: { name: true },
      }),
      this.prisma.user.findMany({
        where: {
          roles: { hasSome: [UserRole.EVALUATOR, UserRole.ADMIN] },
          // Nobody is told to review their own work.
          id: { not: actor.id },
          status: AccountStatus.ACTIVE,
        },
        select: { id: true },
      }),
    ]);

    const studentName = student?.name ?? 'A student';

    await Promise.all(
      reviewers.map((reviewer) =>
        this.notificationsService.notify({
          userId: reviewer.id,
          type: NotificationType.SUBMISSION_RECEIVED,
          title: 'New submission awaiting review',
          body: `${studentName} submitted "${submissionTitle}" for review.`,
          metadata: { submissionId },
          email: {
            subject: `New submission to review: ${submissionTitle}`,
            block: {
              heading: 'A submission is waiting for your review',
              intro: `${studentName} has submitted work for assessment. It is now in your grading queue.`,
              facts: [
                { label: 'Student', value: studentName },
                { label: 'Submission', value: submissionTitle },
              ],
              ctaLabel: 'Open the grading queue',
              ctaUrl: `${WEB}/queue`,
              outro: 'Work through the competency rubric before approving — every item must be checked.',
            },
          },
        }),
      ),
    );

    // The student gets their own confirmation that the work actually landed.
    await this.notificationsService.notify({
      userId: actor.id,
      type: NotificationType.SUBMISSION_RECEIVED,
      title: 'Submission received',
      body: `We received "${submissionTitle}". A supervisor will review it shortly.`,
      metadata: { submissionId },
      email: {
        subject: `We received your submission: ${submissionTitle}`,
        block: {
          heading: 'Your submission was received',
          intro:
            'Thanks — your work is now with a supervisor for assessment. You will be emailed as soon as it has been reviewed.',
          facts: [{ label: 'Submission', value: submissionTitle }],
          ctaLabel: 'View your learning',
          ctaUrl: `${WEB}/learning`,
          outro: 'No action is needed from you right now.',
        },
      },
    });
  }

  async queue(status?: SubmissionStatus) {
    const submissions = await this.prisma.submission.findMany({
      where: status ? { status } : {},
      include: FULL_INCLUDE,
      // Newest first — supervisors work the most recent arrivals at the top.
      orderBy: { submittedAt: 'desc' },
    });
    const studentIds = [...new Set(submissions.map((s) => s.studentId))];
    const students = await this.prisma.user.findMany({
      where: { id: { in: studentIds } },
    });
    const studentMap = new Map(students.map((s) => [s.id, s]));

    return submissions.map((s) =>
      this.sanitizeSubmission({ ...s, student: studentMap.get(s.studentId) }),
    );
  }

  /** Headline counts for the supervisor dashboard, so reviewers see workload at a glance. */
  async queueStats() {
    const [byStatus, oldestPending, gradedToday] = await Promise.all([
      this.prisma.submission.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.submission.findFirst({
        where: { status: SubmissionStatus.PENDING },
        orderBy: { submittedAt: 'asc' },
        select: { submittedAt: true },
      }),
      this.prisma.submission.count({
        where: {
          evaluatedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    const countFor = (status: SubmissionStatus) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    return {
      pending: countFor(SubmissionStatus.PENDING),
      approved: countFor(SubmissionStatus.APPROVED),
      rejected: countFor(SubmissionStatus.REJECTED),
      total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
      gradedToday,
      oldestPendingAt: oldestPending?.submittedAt ?? null,
    };
  }

  async mine(studentId: string) {
    const submissions = await this.prisma.submission.findMany({
      where: { studentId },
      include: FULL_INCLUDE,
      orderBy: { submittedAt: 'desc' },
    });
    return submissions.map((s) => this.sanitizeSubmission(s));
  }

  async getById(id: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      include: FULL_INCLUDE,
    });
    if (!submission) throw new NotFoundException('Submission not found.');
    return this.sanitizeSubmission(submission);
  }

  /**
   * Strips passwordHash from nested evaluator/student user objects, and flattens their
   * names to the `evaluatorName`/`studentName` fields the client DTO actually reads.
   */
  private sanitizeSubmission<
    T extends {
      evaluator?: { passwordHash: string; name: string } | null;
      student?: { passwordHash: string; name: string; email: string };
    },
  >(submission: T) {
    const { evaluator, student, ...rest } = submission;
    return {
      ...rest,
      evaluatorName: evaluator?.name ?? null,
      ...(student !== undefined && {
        studentName: student?.name ?? null,
        studentEmail: student?.email ?? null,
      }),
      ...(evaluator !== undefined && {
        evaluator: evaluator ? this.omitPasswordHash(evaluator) : evaluator,
      }),
      ...(student !== undefined && {
        student: student ? this.omitPasswordHash(student) : student,
      }),
    };
  }

  private omitPasswordHash<T extends { passwordHash: string }>(
    user: T,
  ): Omit<T, 'passwordHash'> {
    const { passwordHash: _passwordHash, ...rest } = user;
    return rest;
  }

  async toggleRubricCheck(
    actor: RequestUser,
    submissionId: string,
    checkId: string,
    checked: boolean,
  ) {
    const check = await this.prisma.submissionRubricCheck.findUnique({
      where: { id: checkId },
    });
    if (!check || check.submissionId !== submissionId)
      throw new NotFoundException('Rubric item not found.');

    const updated = await this.prisma.submissionRubricCheck.update({
      where: { id: checkId },
      data: { checked },
    });
    return updated;
  }

  async grade(
    actor: RequestUser,
    submissionId: string,
    dto: GradeSubmissionDto,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { rubricChecks: true },
    });
    if (!submission) throw new NotFoundException('Submission not found.');
    if (submission.status !== SubmissionStatus.PENDING) {
      throw new BadRequestException(
        'This submission has already been evaluated.',
      );
    }

    if (dto.decision === 'APPROVE' && submission.rubricChecks.length > 0) {
      const allChecked = submission.rubricChecks.every((c) => c.checked);
      if (!allChecked) {
        throw new ForbiddenException(
          'Every rubric requirement must be checked off before you can approve this submission.',
        );
      }
    }

    const status =
      dto.decision === 'APPROVE'
        ? SubmissionStatus.APPROVED
        : SubmissionStatus.REJECTED;

    await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        status,
        score: dto.score,
        feedback: dto.feedback,
        evaluatorId: actor.id,
        evaluatedAt: new Date(),
      },
    });

    await this.auditService.log({
      actor,
      action: `${dto.decision === 'APPROVE' ? 'Approved' : 'Requested revision on'} submission "${submission.title}" (score ${dto.score})`,
      entityType: 'Submission',
      entityId: submissionId,
      severity:
        dto.decision === 'APPROVE'
          ? AuditLogSeverity.SUCCESS
          : AuditLogSeverity.WARNING,
    });

    let credential: Awaited<ReturnType<CredentialsService['issue']>> | null =
      null;
    let levelUp = false;

    if (
      dto.decision === 'APPROVE' &&
      submission.type === SubmissionType.CAPSTONE &&
      submission.levelId
    ) {
      credential = await this.credentialsService.issue(
        submission.studentId,
        submission.levelId,
        actor.id,
      );

      const advanceResult = await this.usersService.advanceToNextLevel(
        submission.studentId,
      );
      levelUp = advanceResult.leveledUp;
    }

    const approved = dto.decision === 'APPROVE';

    await this.notificationsService.notify({
      userId: submission.studentId,
      type: NotificationType.SUBMISSION_GRADED,
      title: approved
        ? `"${submission.title}" was approved!`
        : `"${submission.title}" needs revisions`,
      body: dto.feedback,
      email: {
        subject: approved
          ? `Approved: ${submission.title}`
          : `Revisions requested: ${submission.title}`,
        block: {
          heading: approved ? 'Your work was approved' : 'Your work needs revisions',
          intro: approved
            ? 'A supervisor has reviewed your submission and passed it.'
            : 'A supervisor has reviewed your submission and asked for changes before it can pass.',
          facts: [
            { label: 'Submission', value: submission.title },
            { label: 'Feedback', value: dto.feedback },
          ],
          ctaLabel: approved ? 'View your progress' : 'Review the feedback',
          ctaUrl: `${WEB}/learning`,
          outro: approved
            ? undefined
            : 'Update your work using the feedback above, then submit it again.',
        },
      },
    });

    return {
      submission: await this.getById(submissionId),
      credential,
      levelUp,
    };
  }

  private async collectRubricRequirements(
    topicId?: string,
    moduleId?: string,
  ): Promise<string[]> {
    const resolvedModuleId =
      moduleId ??
      (
        await this.prisma.topic.findUnique({
          where: { id: topicId },
          select: { moduleId: true },
        })
      )?.moduleId;
    if (!resolvedModuleId) return [];

    const competencies = await this.prisma.competency.findMany({
      where: { moduleId: resolvedModuleId },
    });
    return competencies.flatMap((c) => c.validationRequirements);
  }
}

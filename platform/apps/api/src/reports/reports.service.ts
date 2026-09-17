import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  EnrollmentStatus,
  SubmissionStatus,
  SubmissionType,
  UserRole,
} from '@dojo-hub/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only inventory of what is actually in the database, so seed data can be
   * identified before anything is deleted.
   *
   * "Seed" is decided by the @dojo.edu domain the seed script uses for every account it
   * creates, and by whether a course was one of the three it publishes. Nothing real uses
   * that domain, so the split is exact rather than a guess.
   *
   * Submissions are counted against the seed accounts explicitly rather than inferred from
   * the users, because Submission.studentId carries no foreign key — deleting a seeded
   * student would leave their submissions behind, still counted in the evaluator queue.
   */
  async inventory() {
    const SEED_DOMAIN = '@dojo.edu';
    const SEED_COURSE_TITLES = [
      'The Hardware Course',
      'The Software Course',
      'The Data Science Course',
    ];

    const [users, tracks, submissions, credentials, enrolments] = await Promise.all([
      this.prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, roles: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.track.findMany({
        select: {
          id: true,
          title: true,
          status: true,
          _count: { select: { modules: true } },
        },
        orderBy: { title: 'asc' },
      }),
      this.prisma.submission.findMany({
        select: {
          id: true,
          type: true,
          status: true,
          studentId: true,
          title: true,
          submittedAt: true,
          evaluator: { select: { name: true } },
        },
        orderBy: { submittedAt: 'asc' },
      }),
      this.prisma.credential.findMany({
        select: { id: true, studentId: true, issuedAt: true, trackId: true, levelId: true },
      }),
      this.prisma.enrollment.findMany({ select: { id: true, userId: true, trackId: true } }),
    ]);

    const seedUserIds = new Set(
      users.filter((u) => u.email.endsWith(SEED_DOMAIN)).map((u) => u.id),
    );
    const seedTrackIds = new Set(
      tracks.filter((t) => SEED_COURSE_TITLES.includes(t.title)).map((t) => t.id),
    );

    // A submission whose student no longer exists is debris from an earlier deletion —
    // invisible in the user list but still inflating the queue counts.
    const liveUserIds = new Set(users.map((u) => u.id));

    return {
      accounts: users.map((u) => ({
        ...u,
        isSeed: seedUserIds.has(u.id),
      })),
      courses: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        moduleCount: t._count.modules,
        isSeed: seedTrackIds.has(t.id),
        enrolments: enrolments.filter((e) => e.trackId === t.id).length,
      })),
      submissions: submissions.map((sub) => ({
        id: sub.id,
        title: sub.title,
        type: sub.type,
        status: sub.status,
        submittedAt: sub.submittedAt,
        evaluatorName: sub.evaluator?.name ?? null,
        owner: seedUserIds.has(sub.studentId)
          ? 'seed'
          : liveUserIds.has(sub.studentId)
            ? 'real'
            : 'orphaned',
      })),
      credentials: credentials.map((c) => ({
        id: c.id,
        issuedAt: c.issuedAt,
        kind: c.trackId ? 'course' : 'level',
        owner: seedUserIds.has(c.studentId)
          ? 'seed'
          : liveUserIds.has(c.studentId)
            ? 'real'
            : 'orphaned',
      })),
      totals: {
        accounts: users.length,
        seedAccounts: seedUserIds.size,
        courses: tracks.length,
        seedCourses: seedTrackIds.size,
        submissions: submissions.length,
        enrolments: enrolments.length,
        credentials: credentials.length,
      },
    };
  }

  async platformMetrics() {
    const [
      totalStudents,
      totalEvaluators,
      totalAdmins,
      suspendedAccounts,
      pendingSubmissions,
      certificatesAwarded,
      certificatesPending,
    ] = await Promise.all([
      // Counted by role held, so one person with several roles appears in each count.
      this.prisma.user.count({ where: { roles: { has: UserRole.STUDENT } } }),
      this.prisma.user.count({ where: { roles: { has: UserRole.EVALUATOR } } }),
      this.prisma.user.count({ where: { roles: { has: UserRole.ADMIN } } }),
      this.prisma.user.count({ where: { status: AccountStatus.SUSPENDED } }),
      this.prisma.submission.count({
        where: { status: SubmissionStatus.PENDING },
      }),
      this.prisma.credential.count(),
      this.prisma.submission.count({
        where: {
          type: SubmissionType.CAPSTONE,
          status: SubmissionStatus.PENDING,
        },
      }),
    ]);

    const [totalEnrollments, completedEnrollments] = await Promise.all([
      this.prisma.enrollment.count(),
      this.prisma.enrollment.count({
        where: { status: EnrollmentStatus.COMPLETED },
      }),
    ]);

    const platformCompletionRate =
      totalEnrollments > 0
        ? Math.round((completedEnrollments / totalEnrollments) * 1000) / 10
        : 0;

    const tracks = await this.prisma.track.findMany({
      include: { category: true },
    });
    const perTrack = await Promise.all(
      tracks.map(async (track) => {
        const [
          enrollments,
          activeLearners,
          completed,
          submissionsTotal,
          submissionsReviewed,
        ] = await Promise.all([
          this.prisma.enrollment.count({ where: { trackId: track.id } }),
          this.prisma.enrollment.count({
            where: { trackId: track.id, status: EnrollmentStatus.IN_PROGRESS },
          }),
          this.prisma.enrollment.count({
            where: { trackId: track.id, status: EnrollmentStatus.COMPLETED },
          }),
          this.prisma.submission.count({
            where: {
              type: SubmissionType.COMPETENCY,
              topic: { module: { trackId: track.id } },
            },
          }),
          this.prisma.submission.count({
            where: {
              type: SubmissionType.COMPETENCY,
              topic: { module: { trackId: track.id } },
              status: { not: SubmissionStatus.PENDING },
            },
          }),
        ]);

        return {
          trackId: track.id,
          trackTitle: track.title,
          category: track.category.name,
          enrollments,
          activeLearners,
          submissionsTotal,
          submissionsReviewed,
          completionRate:
            enrollments > 0
              ? Math.round((completed / enrollments) * 1000) / 10
              : 0,
          certsAwarded: 0,
          certsPending: 0,
        };
      }),
    );

    return {
      totalStudents,
      totalEvaluators,
      totalAdmins,
      suspendedAccounts,
      pendingSubmissions,
      certificatesAwarded,
      certificatesPending,
      platformCompletionRate,
      perTrack,
    };
  }

  async evaluatorInsights(evaluatorId?: string) {
    const where = {
      evaluatorId: evaluatorId ?? undefined,
      status: {
        in: [
          SubmissionStatus.APPROVED,
          SubmissionStatus.REJECTED,
        ] as SubmissionStatus[],
      },
    };

    const graded = await this.prisma.submission.findMany({ where });
    const totalGraded = graded.length;

    const averageGradingScore =
      totalGraded > 0
        ? Math.round(
            (graded.reduce((sum, s) => sum + (s.score ?? 0), 0) / totalGraded) *
              10,
          ) / 10
        : 0;

    const resolutionHours = graded
      .filter((s) => s.evaluatedAt)
      .map(
        (s) =>
          (new Date(s.evaluatedAt!).getTime() -
            new Date(s.submittedAt).getTime()) /
          3_600_000,
      );
    const averageResolutionHours =
      resolutionHours.length > 0
        ? Math.round(
            (resolutionHours.reduce((a, b) => a + b, 0) /
              resolutionHours.length) *
              10,
          ) / 10
        : 0;

    const approved = graded.filter(
      (s) => s.status === SubmissionStatus.APPROVED,
    ).length;
    const firstAttemptPassRate =
      totalGraded > 0 ? Math.round((approved / totalGraded) * 1000) / 10 : 0;

    return {
      averageGradingScore,
      averageResolutionHours,
      firstAttemptPassRate,
      totalGraded,
    };
  }

  async usageReportData() {
    const [metrics, students, auditLogCount] = await Promise.all([
      this.platformMetrics(),
      this.prisma.user.findMany({
        where: { roles: { has: UserRole.STUDENT } },
        include: { studentProfile: { include: { currentLevel: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      metrics,
      auditLogCount,
      candidates: students.map((s) => ({
        name: s.name,
        email: s.email,
        level: s.studentProfile?.currentLevel.name ?? 'Unassigned',
        status: s.status,
        joinedAt: s.createdAt,
      })),
    };
  }
}

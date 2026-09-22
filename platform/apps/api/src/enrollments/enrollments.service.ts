import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  AuditLogSeverity,
  EnrollmentApproval,
  EnrollmentStatus,
  NotificationType,
  SubmissionType,
  TrackAccess,
  TrackStatus,
  UserRole,
} from '@dojo-hub/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RequestUser } from '../common/types/request-user.interface';

const WEB = process.env.WEB_URL ?? 'https://learning.dojohubug.com';

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listMine(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        track: {
          include: { category: true, modules: { include: { topics: true } } },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    const topicIds = enrollments.flatMap((e) =>
      e.track.modules.flatMap((m) => m.topics.map((t) => t.id)),
    );
    const watched = await this.prisma.topicProgress.findMany({
      where: { userId, topicId: { in: topicIds }, watched: true },
      select: { topicId: true },
    });
    const watchedSet = new Set(watched.map((w) => w.topicId));

    return enrollments.map((e) => {
      const allTopicIds = e.track.modules.flatMap((m) =>
        m.topics.map((t) => t.id),
      );
      const completedTopicCount = allTopicIds.filter((id) =>
        watchedSet.has(id),
      ).length;
      return {
        id: e.id,
        userId: e.userId,
        trackId: e.trackId,
        status: e.status,
        // The student's own list says plainly when a paid course is still waiting.
        approval: e.approval,
        enrolledAt: e.enrolledAt,
        completedTopicCount,
        totalTopicCount: allTopicIds.length,
        track: {
          id: e.track.id,
          title: e.track.title,
          description: e.track.description,
          icon: e.track.icon,
          access: e.track.access,
          coverImageUrl: e.track.coverImageUrl,
          category: e.track.category,
          difficulty: e.track.difficulty,
          durationWeeks: e.track.durationWeeks,
          status: e.track.status,
        },
      };
    });
  }

  /**
   * Joining a course. A free course opens immediately; a paid one records a request that
   * an administrator approves once payment has been settled off the platform, so no
   * content is unlocked in the meantime.
   */
  async enroll(actor: RequestUser, trackId: string) {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
    });
    if (!track) throw new NotFoundException('Track not found.');
    if (track.status !== TrackStatus.PUBLISHED) {
      throw new BadRequestException(
        'This track is not yet published for enrollment.',
      );
    }

    const paid = track.access === TrackAccess.PAID;
    const existing = await this.prisma.enrollment.findUnique({
      where: { userId_trackId: { userId: actor.id, trackId } },
    });

    // Asking again after being declined puts the request back in front of the admins;
    // asking again while already approved or pending changes nothing.
    const alreadyWaiting = existing?.approval === EnrollmentApproval.PENDING;
    const approval = paid
      ? existing?.approval === EnrollmentApproval.APPROVED
        ? EnrollmentApproval.APPROVED
        : EnrollmentApproval.PENDING
      : EnrollmentApproval.APPROVED;

    const enrollment = await this.prisma.enrollment.upsert({
      where: { userId_trackId: { userId: actor.id, trackId } },
      update: { approval },
      create: {
        userId: actor.id,
        trackId,
        status: EnrollmentStatus.NOT_STARTED,
        approval,
      },
    });

    await this.auditService.log({
      actor,
      action: paid
        ? `Requested a place on the paid course "${track.title}"`
        : `Enrolled in "${track.title}"`,
      entityType: 'Enrollment',
      entityId: enrollment.id,
    });

    if (paid && approval === EnrollmentApproval.PENDING && !alreadyWaiting) {
      await this.notifyAdminsOfRequest(actor, track.title, enrollment.id);
    }

    return enrollment;
  }

  /** Requests waiting on an administrator, oldest first — they have been waiting longest. */
  async pendingRequests() {
    const requests = await this.prisma.enrollment.findMany({
      where: { approval: EnrollmentApproval.PENDING },
      orderBy: { enrolledAt: 'asc' },
      include: { track: { select: { id: true, title: true, access: true } } },
    });
    // Enrolments store a student id rather than a link to the account, so the names and
    // addresses are read in one go here.
    const students = await this.prisma.user.findMany({
      where: { id: { in: requests.map((r) => r.userId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(students.map((s) => [s.id, s]));

    return requests.map((r) => ({
      id: r.id,
      requestedAt: r.enrolledAt.toISOString(),
      student: byId.get(r.userId) ?? { id: r.userId, name: 'Former student', email: '' },
      course: r.track,
    }));
  }

  /** Opens the course to the student, once payment has been handled off the platform. */
  async approve(actor: RequestUser, enrollmentId: string) {
    const enrollment = await this.pendingOrThrow(enrollmentId);

    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        approval: EnrollmentApproval.APPROVED,
        approvedAt: new Date(),
        approvedById: actor.id,
      },
    });

    await this.auditService.log({
      actor,
      action: `Approved ${enrollment.user.name} for "${enrollment.track.title}"`,
      entityType: 'Enrollment',
      entityId: enrollmentId,
      severity: AuditLogSeverity.SUCCESS,
    });

    await this.notificationsService.notify({
      userId: enrollment.userId,
      type: NotificationType.ROLE_CHANGED,
      title: `You now have access to "${enrollment.track.title}"`,
      body: 'Your place has been confirmed. The lessons are ready for you.',
      email: {
        subject: `Your place on "${enrollment.track.title}" is confirmed`,
        block: {
          heading: 'Your course is ready',
          intro: `Your place on "${enrollment.track.title}" has been confirmed, and every lesson is now open to you.`,
          facts: [{ label: 'Course', value: enrollment.track.title }],
          ctaLabel: 'Start learning',
          ctaUrl: `${WEB}/learning/${enrollment.trackId}`,
          outro: 'Enjoy the course — your progress is saved as you go.',
        },
      },
    });

    return { success: true };
  }

  /** Turns a request down, with an optional reason the student is told. */
  async decline(actor: RequestUser, enrollmentId: string, reason?: string) {
    const enrollment = await this.pendingOrThrow(enrollmentId);

    await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { approval: EnrollmentApproval.DECLINED },
    });

    await this.auditService.log({
      actor,
      action: `Declined ${enrollment.user.name} for "${enrollment.track.title}"`,
      entityType: 'Enrollment',
      entityId: enrollmentId,
      severity: AuditLogSeverity.WARNING,
    });

    await this.notificationsService.notify({
      userId: enrollment.userId,
      type: NotificationType.ROLE_CHANGED,
      title: `Your request for "${enrollment.track.title}" was not approved`,
      body: reason?.trim() || 'Contact Dojo Hub if you think this is a mistake.',
      email: {
        subject: `About your request to join "${enrollment.track.title}"`,
        block: {
          heading: 'Your request was not approved',
          intro: `Your request to join "${enrollment.track.title}" has not been approved.`,
          facts: [
            { label: 'Course', value: enrollment.track.title },
            ...(reason?.trim() ? [{ label: 'Reason', value: reason.trim() }] : []),
          ],
          outro: 'If you have already paid, or think this is a mistake, reply to this email and we will sort it out.',
        },
      },
    });

    return { success: true };
  }

  private async pendingOrThrow(enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { track: { select: { id: true, title: true } } },
    });
    if (!enrollment) throw new NotFoundException('Enrolment request not found.');
    if (enrollment.approval === EnrollmentApproval.APPROVED) {
      throw new BadRequestException(
        'That student already has access to this course.',
      );
    }
    const student = await this.prisma.user.findUnique({
      where: { id: enrollment.userId },
      select: { id: true, name: true, email: true },
    });
    return { ...enrollment, user: student ?? { id: enrollment.userId, name: 'Former student', email: '' } };
  }

  /** Every administrator hears about a new request, in the app and by email. */
  private async notifyAdminsOfRequest(
    actor: RequestUser,
    courseTitle: string,
    enrollmentId: string,
  ) {
    const admins = await this.prisma.user.findMany({
      where: {
        roles: { has: UserRole.ADMIN },
        status: AccountStatus.ACTIVE,
        id: { not: actor.id },
      },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.notify({
          userId: admin.id,
          type: NotificationType.SUBMISSION_RECEIVED,
          title: 'Someone wants to join a paid course',
          body: `${actor.name} asked to join "${courseTitle}". Approve them once payment is settled.`,
          metadata: { enrollmentId },
          email: {
            subject: `Enrolment request: ${actor.name} — ${courseTitle}`,
            block: {
              heading: 'A student wants to join a paid course',
              intro: `${actor.name} has asked to join "${courseTitle}". They cannot see the lessons until you approve them.`,
              facts: [
                { label: 'Student', value: actor.name },
                { label: 'Email address', value: actor.email },
                { label: 'Course', value: courseTitle },
              ],
              ctaLabel: 'Review the request',
              ctaUrl: `${WEB}/enrolment-requests`,
              outro: 'Settle payment however you normally do, then approve them on the platform.',
            },
          },
        }),
      ),
    );
  }

  async start(actor: RequestUser, trackId: string) {
    const enrollment = await this.findEnrollment(actor.id, trackId);
    if (enrollment.status === EnrollmentStatus.NOT_STARTED) {
      return this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: EnrollmentStatus.IN_PROGRESS },
      });
    }
    return enrollment;
  }

  /**
   * Unenrolling is a hard reset, not a pause: watch progress and the coursework
   * the student submitted for this track are removed so a later re-enrolment
   * starts from zero rather than resuming mid-course.
   *
   * Capstones are deliberately left alone — they hang off a certification Level
   * rather than a track, and deleting them would invalidate issued credentials.
   */
  async unenroll(actor: RequestUser, trackId: string) {
    const enrollment = await this.findEnrollment(actor.id, trackId);

    const modules = await this.prisma.module.findMany({
      where: { trackId },
      select: { id: true, topics: { select: { id: true } } },
    });
    const moduleIds = modules.map((m) => m.id);
    const topicIds = modules.flatMap((m) => m.topics.map((t) => t.id));

    await this.prisma.$transaction([
      this.prisma.topicProgress.deleteMany({
        where: { userId: actor.id, topicId: { in: topicIds } },
      }),
      this.prisma.submission.deleteMany({
        where: {
          studentId: actor.id,
          type: SubmissionType.COMPETENCY,
          OR: [
            { topicId: { in: topicIds } },
            { moduleId: { in: moduleIds } },
          ],
        },
      }),
      this.prisma.enrollment.delete({ where: { id: enrollment.id } }),
    ]);

    await this.auditService.log({
      actor,
      action: `Unenrolled from a certification track and reset all progress for it`,
      entityType: 'Enrollment',
      entityId: enrollment.id,
      severity: AuditLogSeverity.WARNING,
    });

    return { success: true };
  }

  async markCompleted(userId: string, trackId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_trackId: { userId, trackId } },
    });
    if (!enrollment) return null;
    return this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: EnrollmentStatus.COMPLETED },
    });
  }

  private async findEnrollment(userId: string, trackId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_trackId: { userId, trackId } },
    });
    if (!enrollment)
      throw new NotFoundException('You are not enrolled in this track.');
    return enrollment;
  }
}

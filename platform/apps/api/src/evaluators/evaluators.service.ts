import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import {
  AccountStatus,
  AuditLogSeverity,
  NotificationType,
  UserRole,
} from '@dojo-hub/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RequestUser } from '../common/types/request-user.interface';
import { primaryRole, rolesOf, sortRoles } from '../common/roles';
import {
  AcceptInvitationDto,
  InviteEvaluatorDto,
  SetEvaluatorCoursesDto,
} from './dto/evaluator.dto';

/**
 * Evaluator access: who holds it, and for which courses.
 *
 * Nobody becomes an evaluator by signing up. An administrator invites an address and
 * chooses the courses; the person accepts from an emailed link, and only then does the
 * role and its courses exist. An address that already has an account keeps that account —
 * accepting adds Evaluator to it rather than creating a second one.
 */

const INVITATION_DAYS = 7;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class EvaluatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  private get webUrl() {
    return this.configService.get<string>('webUrl') ?? 'https://learning.dojohubug.com';
  }

  // -------------------------------------------------------------------------
  // Admin: inviting
  // -------------------------------------------------------------------------

  async invite(actor: RequestUser, dto: InviteEvaluatorDto) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const tracks = await this.tracksOrThrow(dto.trackIds);

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && rolesOf(existing).includes(UserRole.EVALUATOR)) {
      throw new BadRequestException(
        'That account already evaluates. Change its courses instead of inviting it again.',
      );
    }
    if (existing?.status === AccountStatus.SUSPENDED) {
      throw new BadRequestException('That account is suspended. Reactivate it first.');
    }

    // One live invitation per address: re-inviting replaces the old link rather than
    // leaving two working at once.
    await this.prisma.evaluatorInvitation.deleteMany({
      where: { email, acceptedAt: null },
    });

    const invitation = await this.prisma.evaluatorInvitation.create({
      data: {
        email,
        name: existing?.name ?? name,
        userId: existing?.id ?? null,
        trackIds: tracks.map((t) => t.id),
        token: randomUUID(),
        expiresAt: this.expiryDate(),
        invitedById: actor.id,
      },
    });

    await this.sendInvitationEmail(invitation, tracks, !!existing);
    await this.auditService.log({
      actor,
      action: `Invited ${email} to evaluate ${tracks.length} course(s)`,
      entityType: 'EvaluatorInvitation',
      entityId: invitation.id,
      severity: AuditLogSeverity.WARNING,
    });

    return this.toInvitationDto(invitation, tracks);
  }

  async resend(actor: RequestUser, invitationId: string) {
    const invitation = await this.pendingOrThrow(invitationId);
    const tracks = await this.tracksOrThrow(invitation.trackIds, { allowMissing: true });

    const refreshed = await this.prisma.evaluatorInvitation.update({
      where: { id: invitationId },
      // A new link each time, so an address that was forwarded or mistyped is not left valid.
      data: { token: randomUUID(), expiresAt: this.expiryDate() },
    });

    await this.sendInvitationEmail(refreshed, tracks, !!refreshed.userId);
    await this.auditService.log({
      actor,
      action: `Re-sent the evaluator invitation to ${refreshed.email}`,
      entityType: 'EvaluatorInvitation',
      entityId: invitationId,
    });
    return this.toInvitationDto(refreshed, tracks);
  }

  async cancel(actor: RequestUser, invitationId: string) {
    const invitation = await this.pendingOrThrow(invitationId);
    await this.prisma.evaluatorInvitation.delete({ where: { id: invitationId } });
    await this.auditService.log({
      actor,
      action: `Cancelled the evaluator invitation to ${invitation.email}`,
      entityType: 'EvaluatorInvitation',
      entityId: invitationId,
      severity: AuditLogSeverity.WARNING,
    });
    return { success: true };
  }

  /** Invitations still waiting to be accepted, newest first. Never includes the token. */
  async pendingInvitations() {
    const invitations = await this.prisma.evaluatorInvitation.findMany({
      where: { acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const tracks = await this.prisma.track.findMany({
      where: { id: { in: invitations.flatMap((i) => i.trackIds) } },
      select: { id: true, title: true },
    });
    return invitations.map((invitation) =>
      this.toInvitationDto(
        invitation,
        tracks.filter((t) => invitation.trackIds.includes(t.id)),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Accepting (no session — the emailed link is the proof)
  // -------------------------------------------------------------------------

  /** What the acceptance page shows before anyone types anything. */
  async invitationByToken(token: string) {
    const invitation = await this.prisma.evaluatorInvitation.findUnique({
      where: { token },
    });
    if (!invitation || invitation.acceptedAt) {
      throw new NotFoundException(
        'This invitation link is no longer valid. Ask an administrator to send a new one.',
      );
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException(
        'This invitation has expired. Ask an administrator to send a new one.',
      );
    }
    const tracks = await this.tracksOrThrow(invitation.trackIds, { allowMissing: true });
    // Someone may have signed up with this address after the invitation was sent.
    const account =
      (invitation.userId
        ? await this.prisma.user.findUnique({ where: { id: invitation.userId } })
        : null) ?? (await this.prisma.user.findUnique({ where: { email: invitation.email } }));

    return {
      name: invitation.name,
      email: invitation.email,
      /** True when they already have a password and only need to accept. */
      hasAccount: !!account,
      courses: tracks.map((t) => ({ id: t.id, title: t.title })),
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async accept(token: string, dto: AcceptInvitationDto) {
    const invitation = await this.prisma.evaluatorInvitation.findUnique({
      where: { token },
    });
    if (!invitation || invitation.acceptedAt) {
      throw new NotFoundException(
        'This invitation link is no longer valid. Ask an administrator to send a new one.',
      );
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException(
        'This invitation has expired. Ask an administrator to send a new one.',
      );
    }

    const existing =
      (invitation.userId
        ? await this.prisma.user.findUnique({ where: { id: invitation.userId } })
        : null) ?? (await this.prisma.user.findUnique({ where: { email: invitation.email } }));

    if (!existing && (!dto.password || dto.password.length < 8)) {
      throw new BadRequestException('Choose a password of at least 8 characters.');
    }
    if (existing?.status === AccountStatus.SUSPENDED) {
      throw new BadRequestException(
        'This account is suspended. Contact a platform administrator.',
      );
    }

    const user = await this.prisma.$transaction(async (tx) => {
      let account = existing;
      if (account) {
        const roles = sortRoles([...rolesOf(account), UserRole.EVALUATOR]);
        account = await tx.user.update({
          where: { id: account.id },
          data: { roles, role: primaryRole(roles) },
        });
      } else {
        account = await tx.user.create({
          data: {
            name: (dto.name ?? invitation.name).trim(),
            email: invitation.email,
            passwordHash: await bcrypt.hash(dto.password!, BCRYPT_ROUNDS),
            role: UserRole.EVALUATOR,
            roles: [UserRole.EVALUATOR],
            status: AccountStatus.ACTIVE,
            // Opening the emailed link proves the address, so there is nothing more to confirm.
            emailVerifiedAt: new Date(),
          },
        });
      }

      // Courses that have since been deleted are simply skipped.
      const tracks = await tx.track.findMany({
        where: { id: { in: invitation.trackIds } },
        select: { id: true },
      });
      await tx.evaluatorAssignment.createMany({
        data: tracks.map((t) => ({
          evaluatorId: account!.id,
          trackId: t.id,
          assignedById: invitation.invitedById,
        })),
        skipDuplicates: true,
      });

      await tx.evaluatorInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date(), userId: account.id },
      });
      return account;
    });

    const actor: RequestUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: UserRole.EVALUATOR,
      roles: rolesOf(user),
    };
    await this.auditService.log({
      actor,
      action: existing
        ? `Accepted evaluator access, added to an existing account (${user.email})`
        : `Accepted an evaluator invitation and created an account (${user.email})`,
      entityType: 'User',
      entityId: user.id,
      severity: AuditLogSeverity.SUCCESS,
    });

    return { success: true, email: user.email, hadAccount: !!existing };
  }

  // -------------------------------------------------------------------------
  // Admin: who evaluates what
  // -------------------------------------------------------------------------

  async listEvaluators() {
    const [evaluators, tracks] = await Promise.all([
      this.prisma.user.findMany({
        where: { roles: { has: UserRole.EVALUATOR } },
        orderBy: { createdAt: 'desc' },
        include: {
          evaluatorCourses: {
            include: { track: { select: { id: true, title: true, status: true } } },
          },
        },
      }),
      this.prisma.track.findMany({
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          status: true,
          _count: { select: { evaluators: true } },
        },
      }),
    ]);

    return {
      evaluators: evaluators.map((e) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        status: e.status,
        roles: rolesOf(e),
        courses: e.evaluatorCourses.map((a) => a.track),
      })),
      courses: tracks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        evaluatorCount: t._count.evaluators,
      })),
    };
  }

  /** Replaces an evaluator's courses with exactly this list. */
  async setCourses(actor: RequestUser, evaluatorId: string, dto: SetEvaluatorCoursesDto) {
    const evaluator = await this.prisma.user.findUnique({ where: { id: evaluatorId } });
    if (!evaluator) throw new NotFoundException('User not found.');
    if (!rolesOf(evaluator).includes(UserRole.EVALUATOR)) {
      throw new BadRequestException(
        'That account does not evaluate. Invite them as an evaluator first.',
      );
    }
    const tracks = await this.tracksOrThrow(dto.trackIds);

    await this.prisma.$transaction([
      this.prisma.evaluatorAssignment.deleteMany({
        where: { evaluatorId, trackId: { notIn: tracks.map((t) => t.id) } },
      }),
      this.prisma.evaluatorAssignment.createMany({
        data: tracks.map((t) => ({ evaluatorId, trackId: t.id, assignedById: actor.id })),
        skipDuplicates: true,
      }),
    ]);

    await this.auditService.log({
      actor,
      action: `Set the courses "${evaluator.name}" evaluates to: ${
        tracks.map((t) => t.title).join(', ') || 'none'
      }`,
      entityType: 'User',
      entityId: evaluatorId,
      severity: AuditLogSeverity.WARNING,
    });

    await this.notificationsService.notify({
      userId: evaluatorId,
      type: NotificationType.ROLE_CHANGED,
      title: 'Your courses were updated',
      body: tracks.length
        ? `You now review: ${tracks.map((t) => t.title).join(', ')}.`
        : 'You are not assigned to any course at the moment.',
    });

    return { success: true, courses: tracks.map((t) => ({ id: t.id, title: t.title })) };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private expiryDate() {
    return new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);
  }

  private async tracksOrThrow(trackIds: string[], options?: { allowMissing?: boolean }) {
    const unique = [...new Set(trackIds)];
    const tracks = await this.prisma.track.findMany({
      where: { id: { in: unique } },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    });
    if (!options?.allowMissing && tracks.length !== unique.length) {
      throw new BadRequestException('One or more of those courses no longer exists.');
    }
    return tracks;
  }

  private async pendingOrThrow(invitationId: string) {
    const invitation = await this.prisma.evaluatorInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    if (invitation.acceptedAt) {
      throw new BadRequestException('That invitation has already been accepted.');
    }
    return invitation;
  }

  /** The invitation as the admin screen sees it — everything except the token. */
  private toInvitationDto(
    invitation: {
      id: string;
      name: string;
      email: string;
      userId: string | null;
      expiresAt: Date;
      createdAt: Date;
    },
    tracks: { id: string; title: string }[],
  ) {
    return {
      id: invitation.id,
      name: invitation.name,
      email: invitation.email,
      hasAccount: !!invitation.userId,
      courses: tracks.map((t) => ({ id: t.id, title: t.title })),
      expiresAt: invitation.expiresAt.toISOString(),
      invitedAt: invitation.createdAt.toISOString(),
    };
  }

  private async sendInvitationEmail(
    invitation: { email: string; name: string; token: string; expiresAt: Date },
    tracks: { title: string }[],
    hasAccount: boolean,
  ) {
    const courses = tracks.map((t) => t.title).join(', ') || 'No course yet';
    await this.emailService.send({
      to: invitation.email,
      subject: 'You have been invited to evaluate on Dojo Hub Learning Platform',
      block: {
        heading: 'An invitation to evaluate',
        intro: hasAccount
          ? `You already have a Dojo Hub Learning Platform account. Accepting adds evaluator access to it — you keep the same email address and password, and choose which workspace to open when you sign in.`
          : `You have been invited to review and grade student work on Dojo Hub Learning Platform. Open the link below to choose a password and start evaluating.`,
        facts: [
          { label: 'Your name', value: invitation.name },
          { label: 'Email address', value: invitation.email },
          { label: 'Courses you will review', value: courses },
          { label: 'Link valid until', value: invitation.expiresAt.toDateString() },
        ],
        ctaLabel: hasAccount ? 'Accept evaluator access' : 'Set my password',
        ctaUrl: `${this.webUrl}/accept-invitation?token=${invitation.token}`,
        outro:
          'If you were not expecting this invitation, you can ignore this email and nothing will change.',
      },
    });
  }
}

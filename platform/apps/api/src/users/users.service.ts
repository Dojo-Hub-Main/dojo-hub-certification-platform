import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  AccountStatus,
  AuditLogSeverity,
  NotificationType,
  UserRole,
} from '@dojo-hub/shared';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { RequestUser } from '../common/types/request-user.interface';
import { primaryRole, rolesOf, sortRoles } from '../common/roles';

/** Human-readable role names, so audit entries and emails read like the UI does. */
const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.STUDENT]: 'Student',
  [UserRole.EVALUATOR]: 'Senior Supervisor',
  [UserRole.ADMIN]: 'Platform Admin',
};

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Fills in the role set for any account that has none. The migration does this for every
   * account that existed; this catches one created by the previous release in the moments
   * the two versions overlap during a deploy. Harmless when there is nothing to fix.
   */
  async onModuleInit() {
    try {
      const fixed = await this.prisma.$executeRaw`
        UPDATE "User" SET "roles" = ARRAY["role"]
        WHERE "roles" IS NULL OR cardinality("roles") = 0`;
      if (fixed > 0)
        this.logger.log(`Filled in roles for ${fixed} account(s).`);
    } catch (error) {
      this.logger.error('Could not backfill account roles', error as Error);
    }
  }

  async directory(role: UserRole | undefined, search: string | undefined) {
    const users = await this.prisma.user.findMany({
      where: {
        // Listed under every role held, so someone who is both a student and an
        // evaluator appears on both tabs.
        ...(role
          ? { roles: { has: role } }
          : { roles: { hasSome: [UserRole.STUDENT, UserRole.EVALUATOR] } }),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { studentProfile: { include: { currentLevel: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Pending submissions sit in one shared queue any evaluator (or admin) can act on —
    // there's no per-evaluator assignment, so this count is the same for every supervisor.
    const pendingPlatformWide = users.some((u) =>
      rolesOf(u).includes(UserRole.EVALUATOR),
    )
      ? await this.prisma.submission.count({ where: { status: 'PENDING' } })
      : 0;

    return Promise.all(
      users.map(async (user) => {
        const roles = rolesOf(user);
        // Stats describe the account in the role being browsed.
        const view = role ?? primaryRole(roles);
        if (view === UserRole.STUDENT) {
          const [certificates, cumulativeEnrollments, activeEnrollments] =
            await Promise.all([
              this.prisma.credential.count({ where: { studentId: user.id } }),
              this.prisma.enrollment.count({ where: { userId: user.id } }),
              this.prisma.enrollment.count({
                where: { userId: user.id, status: 'IN_PROGRESS' },
              }),
            ]);
          return {
            ...user,
            roles,
            passwordHash: undefined,
            stats: { certificates, cumulativeEnrollments, activeEnrollments },
          };
        }

        if (view === UserRole.EVALUATOR) {
          const evaluationsDone = await this.prisma.submission.count({
            where: {
              evaluatorId: user.id,
              status: { in: ['APPROVED', 'REJECTED'] },
            },
          });
          return {
            ...user,
            roles,
            passwordHash: undefined,
            stats: { evaluationsDone, pendingPlatformWide },
          };
        }

        return { ...user, roles, passwordHash: undefined, stats: {} };
      }),
    );
  }

  async findOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async suspend(actor: RequestUser, targetId: string) {
    const target = await this.findOrThrow(targetId);
    if (rolesOf(target).includes(UserRole.ADMIN)) {
      throw new ForbiddenException(
        'Administrator accounts cannot be suspended.',
      );
    }

    await this.prisma.user.update({
      where: { id: targetId },
      data: { status: AccountStatus.SUSPENDED },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: targetId },
      data: { revoked: true },
    });

    await this.auditService.log({
      actor,
      action: `Suspended account access for "${target.name}" (${target.email})`,
      entityType: 'User',
      entityId: targetId,
      severity: AuditLogSeverity.WARNING,
    });

    await this.notificationsService.notify({
      userId: targetId,
      type: NotificationType.ACCOUNT_SUSPENDED,
      title: 'Account suspended',
      body: 'Your Dojo Hub Learning Platform account access has been suspended by a platform administrator.',
    });

    return { success: true };
  }

  async reactivate(actor: RequestUser, targetId: string) {
    const target = await this.findOrThrow(targetId);

    await this.prisma.user.update({
      where: { id: targetId },
      data: { status: AccountStatus.ACTIVE },
    });

    await this.auditService.log({
      actor,
      action: `Reactivated account access for "${target.name}" (${target.email})`,
      entityType: 'User',
      entityId: targetId,
      severity: AuditLogSeverity.SUCCESS,
    });

    await this.notificationsService.notify({
      userId: targetId,
      type: NotificationType.ACCOUNT_REACTIVATED,
      title: 'Account reactivated',
      body: 'Your Dojo Hub Learning Platform account access has been restored.',
    });

    return { success: true };
  }

  /**
   * Grants or changes a workspace role. This is the only way an admin account can come
   * into existence: registration is deliberately limited to students and evaluators, so
   * a new tutor signs up normally, verifies their email, and is promoted here.
   *
   * Two guards exist to keep the platform from becoming unadministrable. An admin cannot
   * change their own role, which would otherwise let someone demote themselves out of the
   * only account that can undo it; and the last remaining admin cannot be demoted by
   * anyone, which would leave nobody able to author courses or manage users.
   */
  async changeRole(actor: RequestUser, targetId: string, role: UserRole) {
    // Kept only so an admin page opened before roles became a set keeps working during the
    // release; the current page adds and removes roles with addRole / removeRole. It still
    // replaces the whole set, as it always did, and still never creates an evaluator.
    if (role === UserRole.EVALUATOR) {
      throw new BadRequestException(
        'Evaluator access is now given through an evaluator invitation. Refresh this page.',
      );
    }
    const target = await this.findOrThrow(targetId);

    if (target.id === actor.id) {
      throw new ForbiddenException(
        'You cannot change your own role. Ask another administrator to do it.',
      );
    }

    if (target.role === role) {
      throw new BadRequestException(
        `This account is already a ${ROLE_LABEL[role]}.`,
      );
    }

    if (rolesOf(target).includes(UserRole.ADMIN)) {
      const admins = await this.prisma.user.count({
        where: { roles: { has: UserRole.ADMIN }, status: AccountStatus.ACTIVE },
      });
      if (admins <= 1) {
        throw new ForbiddenException(
          'This is the last administrator account. Promote another administrator first.',
        );
      }
    }

    await this.prisma.user.update({
      where: { id: targetId },
      data: { role, roles: [role] },
    });

    // The old role is baked into the access token, so anything still holding one would
    // keep the previous permissions until it expired. Dropping the refresh tokens forces
    // a fresh sign-in and a token that reflects the new role.
    await this.prisma.refreshToken.updateMany({
      where: { userId: targetId },
      data: { revoked: true },
    });

    await this.auditService.log({
      actor,
      action: `Changed role for "${target.name}" (${target.email}) from ${ROLE_LABEL[target.role]} to ${ROLE_LABEL[role]}`,
      entityType: 'User',
      entityId: targetId,
      severity: AuditLogSeverity.WARNING,
    });

    await this.notificationsService.notify({
      userId: targetId,
      type: NotificationType.ROLE_CHANGED,
      title: `You are now a ${ROLE_LABEL[role]}`,
      body: `A platform administrator changed your role to ${ROLE_LABEL[role]}. Sign in again to use your new permissions.`,
      email: {
        subject: `Your Dojo Hub Learning Platform role changed to ${ROLE_LABEL[role]}`,
        block: {
          heading: `You are now a ${ROLE_LABEL[role]}`,
          intro: `A platform administrator changed your role on Dojo Hub Learning Platform. You will need to sign in again for the change to take effect.`,
          facts: [
            { label: 'Previous role', value: ROLE_LABEL[target.role] },
            { label: 'New role', value: ROLE_LABEL[role] },
          ],
          outro:
            'If you were not expecting this, contact your platform administrator.',
        },
      },
    });

    return { success: true };
  }

  /**
   * Gives an account another role without touching the ones it has — a student made an
   * admin stays a student. The person switches between them from their account menu.
   *
   * Evaluator is deliberately not grantable here: it is given through an invitation the
   * person accepts, so nobody becomes an evaluator without knowing.
   */
  async addRole(actor: RequestUser, targetId: string, role: UserRole) {
    if (role === UserRole.EVALUATOR) {
      throw new BadRequestException(
        'Evaluator access is given through an evaluator invitation, so the person accepts it themselves.',
      );
    }
    const target = await this.findOrThrow(targetId);
    if (target.status === AccountStatus.SUSPENDED) {
      throw new BadRequestException(
        'Reactivate this account before changing its access.',
      );
    }
    const roles = rolesOf(target);
    if (roles.includes(role)) {
      throw new BadRequestException(
        `This account already has ${ROLE_LABEL[role]} access.`,
      );
    }

    const next = sortRoles([...roles, role]);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: targetId },
        data: { roles: next, role: primaryRole(next) },
      });
      // A student needs a learning profile to enrol; accounts that started as something
      // else never had one.
      if (role === UserRole.STUDENT) {
        const profile = await tx.studentProfile.findUnique({
          where: { userId: targetId },
        });
        if (!profile) {
          const beginner = await tx.level.findFirstOrThrow({
            orderBy: { order: 'asc' },
          });
          await tx.studentProfile.create({
            data: { userId: targetId, currentLevelId: beginner.id },
          });
        }
      }
    });

    await this.auditService.log({
      actor,
      action: `Gave ${ROLE_LABEL[role]} access to "${target.name}" (${target.email})`,
      entityType: 'User',
      entityId: targetId,
      severity: AuditLogSeverity.WARNING,
    });

    await this.notificationsService.notify({
      userId: targetId,
      type: NotificationType.ROLE_CHANGED,
      title: `You now have ${ROLE_LABEL[role]} access`,
      body: `A platform administrator added ${ROLE_LABEL[role]} access to your account. Choose "Switch workspace" in your account menu to open it.`,
      email: {
        subject: `You now have ${ROLE_LABEL[role]} access on Dojo Hub Learning Platform`,
        block: {
          heading: `You now have ${ROLE_LABEL[role]} access`,
          intro: `A platform administrator added ${ROLE_LABEL[role]} access to your account. Everything you already had access to stays as it was.`,
          facts: [
            {
              label: 'Your access',
              value: next.map((r) => ROLE_LABEL[r]).join(', '),
            },
          ],
          outro:
            'Sign in as usual and choose the workspace you want. If you were not expecting this, contact your platform administrator.',
        },
      },
    });

    return { success: true, roles: next };
  }

  /**
   * Takes one role away and leaves the rest. A session working in that role is cut off on
   * its next request (see JwtStrategy) and falls back to a role the account still holds.
   */
  async removeRole(actor: RequestUser, targetId: string, role: UserRole) {
    const target = await this.findOrThrow(targetId);
    const roles = rolesOf(target);
    if (!roles.includes(role)) {
      throw new BadRequestException(
        `This account does not have ${ROLE_LABEL[role]} access.`,
      );
    }
    if (roles.length === 1) {
      throw new BadRequestException(
        'An account needs at least one role. Suspend or delete the account instead.',
      );
    }
    if (role === UserRole.ADMIN) {
      if (target.id === actor.id) {
        throw new ForbiddenException(
          'You cannot remove your own administrator access. Ask another administrator to do it.',
        );
      }
      const admins = await this.prisma.user.count({
        where: { roles: { has: UserRole.ADMIN }, status: AccountStatus.ACTIVE },
      });
      if (admins <= 1) {
        throw new ForbiddenException(
          'This is the last administrator account. Give another account administrator access first.',
        );
      }
    }

    const next = roles.filter((r) => r !== role);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetId },
        data: { roles: next, role: primaryRole(next) },
      }),
      // Course assignments describe evaluator work, so they go with the role. Giving the
      // role back later starts from a clean list rather than a stale one.
      ...(role === UserRole.EVALUATOR
        ? [
            this.prisma.evaluatorAssignment.deleteMany({
              where: { evaluatorId: targetId },
            }),
          ]
        : []),
    ]);

    await this.auditService.log({
      actor,
      action: `Removed ${ROLE_LABEL[role]} access from "${target.name}" (${target.email})`,
      entityType: 'User',
      entityId: targetId,
      severity: AuditLogSeverity.WARNING,
    });

    await this.notificationsService.notify({
      userId: targetId,
      type: NotificationType.ROLE_CHANGED,
      title: `Your ${ROLE_LABEL[role]} access was removed`,
      body: `A platform administrator removed ${ROLE_LABEL[role]} access from your account. Your other access is unchanged.`,
      email: {
        subject: `Your ${ROLE_LABEL[role]} access on Dojo Hub Learning Platform was removed`,
        block: {
          heading: `Your ${ROLE_LABEL[role]} access was removed`,
          intro: `A platform administrator removed ${ROLE_LABEL[role]} access from your account.`,
          facts: [
            {
              label: 'Your access now',
              value: next.map((r) => ROLE_LABEL[r]).join(', '),
            },
          ],
          outro:
            'If you were not expecting this, contact your platform administrator.',
        },
      },
    });

    return { success: true, roles: next };
  }

  /**
   * Reassigns an account's email address.
   *
   * Exists because an address is otherwise locked to an account forever: submissions and
   * credentials deliberately outlive a deleted user (a certificate stays verifiable, with
   * the holder shown as "Former student"), so an evaluator who has graded anything cannot
   * be terminated, and their address can never be reused. Moving the account off the
   * address frees it without destroying a single record. It also fixes the more ordinary
   * case of an address mistyped at signup, which previously had no remedy at all.
   *
   * The new address is treated as unproven: verification is reset and a fresh confirmation
   * link is sent to it. Otherwise an admin could point an account at any address and have
   * it count as verified.
   */
  async changeEmail(actor: RequestUser, targetId: string, rawEmail: string) {
    const target = await this.findOrThrow(targetId);
    const email = rawEmail.trim().toLowerCase();

    if (email === target.email) {
      throw new BadRequestException(
        'This account already uses that email address.',
      );
    }

    const taken = await this.prisma.user.findUnique({ where: { email } });
    if (taken) {
      throw new ConflictException(
        'Another account already uses that email address.',
      );
    }

    const verificationToken = randomUUID();
    await this.prisma.user.update({
      where: { id: targetId },
      data: {
        email,
        emailVerifiedAt: null,
        verificationToken,
        verificationSentAt: new Date(),
      },
    });

    // The email travels inside the access token, so existing sessions would keep
    // presenting the old identity until they expired.
    await this.prisma.refreshToken.updateMany({
      where: { userId: targetId },
      data: { revoked: true },
    });

    await this.auditService.log({
      actor,
      action: `Changed email for "${target.name}" from ${target.email} to ${email}`,
      entityType: 'User',
      entityId: targetId,
      severity: AuditLogSeverity.WARNING,
    });

    const web = process.env.WEB_URL ?? 'https://dojo-hub-web.onrender.com';
    await this.emailService.send({
      to: email,
      subject: 'Confirm your new email for Dojo Hub Learning Platform',
      block: {
        heading: 'Confirm your new email address',
        intro:
          `A platform administrator changed the email address on your Dojo Hub Learning Platform ` +
          `account to this one. Confirm it to activate the account — you will not be able to sign in until you do.`,
        ctaLabel: 'Confirm my email address',
        ctaUrl: `${web}/verify-email?token=${verificationToken}`,
        outro:
          'If you were not expecting this, contact your platform administrator.',
      },
    });

    return { success: true, email };
  }

  async terminate(actor: RequestUser, targetId: string) {
    const target = await this.findOrThrow(targetId);
    const targetRoles = rolesOf(target);
    if (targetRoles.includes(UserRole.ADMIN)) {
      throw new ForbiddenException(
        'Administrator accounts cannot be terminated.',
      );
    }

    if (targetRoles.includes(UserRole.EVALUATOR)) {
      const [gradingHistory, signedCredentials] = await Promise.all([
        this.prisma.submission.count({ where: { evaluatorId: targetId } }),
        this.prisma.credential.count({
          where: {
            OR: [
              { evaluatorSignatureId: targetId },
              { adminSignatureId: targetId },
            ],
          },
        }),
      ]);
      if (gradingHistory > 0 || signedCredentials > 0) {
        throw new BadRequestException(
          'This evaluator has grading history on the platform and cannot be permanently deleted. Suspend the account instead to preserve academic records.',
        );
      }
    }

    await this.prisma.user.delete({ where: { id: targetId } });

    await this.auditService.log({
      actor,
      action: `Permanently terminated account "${target.name}" (${target.email})`,
      entityType: 'User',
      entityId: targetId,
      severity: AuditLogSeverity.ERROR,
    });

    return { success: true };
  }

  /**
   * Moves a student to the next rung of the Level ladder. Called when an evaluator
   * approves a student's capstone submission for their current level — that approval
   * is the sole trigger for advancement (no scoring/threshold math involved).
   * If the student is already at the top level, this is a no-op.
   */
  async advanceToNextLevel(studentId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.studentProfile.findUniqueOrThrow({
        where: { userId: studentId },
        include: { currentLevel: true },
      });

      const next = await tx.level.findFirst({
        where: { order: { gt: profile.currentLevel.order } },
        orderBy: { order: 'asc' },
      });

      if (!next) {
        return { currentLevel: profile.currentLevel, leveledUp: false };
      }

      await tx.studentProfile.update({
        where: { userId: studentId },
        data: { currentLevelId: next.id },
      });

      return { currentLevel: next, leveledUp: true };
    });

    if (result.leveledUp) {
      await this.notificationsService.notify({
        userId: studentId,
        type: NotificationType.LEVEL_UP,
        title: `You've advanced to ${result.currentLevel.name}!`,
        body: `Congratulations — your approved capstone has unlocked the ${result.currentLevel.name} level.`,
      });
    }

    return result;
  }

  /**
   * Sets a new password on behalf of a user. There is no self-service reset yet, so
   * this is the only recovery path when someone mistypes their password at signup.
   *
   * Every existing session is revoked: a password change must invalidate anyone
   * already holding a refresh token for that account.
   */
  async adminResetPassword(
    actor: RequestUser,
    userId: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      }),
    ]);

    await this.auditService.log({
      actor,
      action: `Reset the password for "${user.name}" (${user.email})`,
      entityType: 'User',
      entityId: userId,
      severity: AuditLogSeverity.WARNING,
    });

    return { success: true };
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { AccountStatus, AuditLogSeverity, UserRole } from '@dojo-hub/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { RequestUser } from '../common/types/request-user.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  /** Sends (or re-sends) the confirmation link for an unverified account. */
  private async sendVerificationEmail(email: string, name: string, token: string) {
    const web = this.configService.get<string>('webUrl') ?? 'https://dojo-hub-web.onrender.com';
    await this.emailService.send({
      to: email,
      subject: 'Confirm your email for Dojo Hub Learning Platform',
      block: {
        heading: `Welcome to Dojo Hub Learning Platform, ${name.split(' ')[0]}`,
        intro:
          'Confirm your email address to activate your account. You will not be able to sign in until you do.',
        ctaLabel: 'Confirm my email address',
        ctaUrl: `${web}/verify-email?token=${token}`,
        outro: 'If you did not create a Dojo Hub Learning Platform account, you can ignore this email.',
      },
    });
  }

  /** Redeems a verification token. Single-use: the token is cleared on success. */
  async verifyEmail(token: string) {
    const user = await this.prisma.user.findUnique({ where: { verificationToken: token } });
    if (!user) {
      throw new BadRequestException('This confirmation link is invalid or has already been used.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), verificationToken: null },
    });

    return { success: true, email: user.email };
  }

  /**
   * Issues a fresh link. Always reports success, so this cannot be used to discover
   * which addresses have accounts.
   */
  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user && !user.emailVerifiedAt) {
      const verificationToken = randomUUID();
      await this.prisma.user.update({
        where: { id: user.id },
        data: { verificationToken, verificationSentAt: new Date() },
      });
      await this.sendVerificationEmail(user.email, user.name, verificationToken);
    }
    return { success: true };
  }

  /** How long a reset link stays usable. Long enough to find the email, short enough
   *  that an old message in an inbox is not a standing key to the account. */
  private static readonly RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

  /**
   * Starts a password reset.
   *
   * Always reports success, whether or not the address has an account. Answering
   * honestly would turn this endpoint into a way to test which email addresses are
   * registered on the platform, which is exactly what someone probing it would want.
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // A suspended account should not be recoverable by its owner — that is the point
    // of suspending it. An admin restores it first.
    if (user && user.status === AccountStatus.ACTIVE) {
      const passwordResetToken = randomUUID();
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken, passwordResetSentAt: new Date() },
      });

      const web =
        this.configService.get<string>('webUrl') ?? 'https://dojo-hub-web.onrender.com';
      await this.emailService.send({
        to: user.email,
        subject: 'Reset your Dojo Hub Learning Platform password',
        block: {
          heading: `Reset your password, ${user.name.split(' ')[0]}`,
          intro:
            'Use the button below to choose a new password. The link works once and expires ' +
            'in one hour.',
          ctaLabel: 'Choose a new password',
          ctaUrl: `${web}/reset-password?token=${passwordResetToken}`,
          outro:
            'If you did not ask to reset your password, you can ignore this email — your ' +
            'current password still works and nothing has changed.',
        },
      });
    }

    return { success: true };
  }

  /**
   * Redeems a reset token and sets the new password.
   *
   * The token is cleared and every refresh token revoked, so anyone already signed in as
   * this account — including whoever prompted the reset — is signed out and has to use
   * the new password.
   */
  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { passwordResetToken: token },
    });

    const expired =
      !user?.passwordResetSentAt ||
      Date.now() - user.passwordResetSentAt.getTime() > AuthService.RESET_TOKEN_TTL_MS;

    if (!user || expired) {
      throw new BadRequestException(
        'This reset link is invalid or has expired. Request a new one.',
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetSentAt: null,
        // Someone who can prove control of the mailbox has proved the address is theirs,
        // so an unverified account becomes verified rather than being left unable to sign
        // in with the password it just set.
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        verificationToken: null,
      },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id },
      data: { revoked: true },
    });

    return { success: true };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException(
        'An account with this email address already exists.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    // Single-use, unguessable token delivered by email; cleared once redeemed.
    const verificationToken = randomUUID();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.toLowerCase(),
          passwordHash,
          // Always a student, whatever the request says — see RegisterDto.
          role: UserRole.STUDENT,
          status: AccountStatus.ACTIVE,
          verificationToken,
          verificationSentAt: new Date(),
        },
      });

      const beginnerLevel = await tx.level.findFirstOrThrow({
        orderBy: { order: 'asc' },
      });
      await tx.studentProfile.create({
        data: {
          userId: created.id,
          currentLevelId: beginnerLevel.id,
        },
      });

      return created;
    });

    await this.sendVerificationEmail(user.email, user.name, verificationToken);

    await this.auditService.log({
      actor: this.toRequestUser(user),
      action: `Created a new ${user.role.toLowerCase()} account: "${user.name}" (${user.email})`,
      entityType: 'User',
      entityId: user.id,
      severity: AuditLogSeverity.SUCCESS,
    });

    return this.issueSession(this.toRequestUser(user));
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect email or password.');
    }

    if (user.status === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException(
        'This account has been suspended. Contact a platform administrator.',
      );
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Please confirm your email address first. Check your inbox for the verification link, or request a new one.',
      );
    }

    const requestUser = this.toRequestUser(user);

    await this.auditService.log({
      actor: requestUser,
      action: `Logged into secure session with role: ${user.role}`,
      entityType: 'User',
      entityId: user.id,
      severity: AuditLogSeverity.SUCCESS,
    });

    return this.issueSession(requestUser);
  }

  async refresh(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Session expired, please sign in again.');
    }
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired, please sign in again.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user || user.status === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is not active.');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    return this.issueSession(this.toRequestUser(user));
  }

  async logout(rawRefreshToken: string | undefined) {
    if (!rawRefreshToken) return;
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  }

  async revokeAllSessionsForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { studentProfile: { include: { currentLevel: true } } },
    });
    return this.omitPasswordHash(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name.trim(),
        ...(dto.emailNotifications === undefined
          ? {}
          : { emailNotifications: dto.emailNotifications }),
      },
      include: { studentProfile: { include: { currentLevel: true } } },
    });

    await this.auditService.log({
      actor: this.toRequestUser(user),
      action: `Updated account profile name to "${user.name}"`,
      entityType: 'User',
      entityId: user.id,
      severity: AuditLogSeverity.SUCCESS,
    });

    return this.omitPasswordHash(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.revokeAllSessionsForUser(userId);

    await this.auditService.log({
      actor: this.toRequestUser(user),
      action: 'Changed account password',
      entityType: 'User',
      entityId: user.id,
      severity: AuditLogSeverity.SUCCESS,
    });

    return { success: true };
  }

  private async issueSession(user: RequestUser) {
    const accessToken = this.jwtService.sign(
      { sub: user.id, role: user.role },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>(
          'jwt.accessTtl',
        ) as unknown as number,
      },
    );

    const rawRefreshToken = randomBytes(48).toString('hex');
    const refreshTtlMs = this.parseTtlToMs(
      this.configService.get<string>('jwt.refreshTtl')!,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });

    return { user, accessToken, refreshToken: rawRefreshToken, refreshTtlMs };
  }

  private omitPasswordHash<T extends { passwordHash: string }>(
    user: T,
  ): Omit<T, 'passwordHash'> {
    const { passwordHash: _passwordHash, ...rest } = user;
    return rest;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private toRequestUser(user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  }): RequestUser {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  private parseTtlToMs(ttl: string): number {
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return value * multipliers[unit];
  }
}

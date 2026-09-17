import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { AccountStatus } from '@dojo-hub/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@dojo-hub/shared';
import { RequestUser } from '../../common/types/request-user.interface';
import { primaryRole, rolesOf } from '../../common/roles';

function extractFromCookie(req: Request): string | null {
  const cookies = req?.cookies as Record<string, string> | undefined;
  return cookies?.access_token ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: { sub: string; role?: UserRole }): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException('Account is not active.');
    }

    // The workspace comes from the token, but is checked against the account's roles as
    // they are now. A role an administrator has removed stops working on the next request
    // rather than lasting until the token expires; the client then refreshes into a role
    // the account still holds.
    const roles = rolesOf(user);
    const workspace = payload.role ?? primaryRole(roles);
    if (!roles.includes(workspace)) {
      throw new UnauthorizedException('Your access has changed. Please sign in again.');
    }

    return { id: user.id, email: user.email, name: user.name, role: workspace, roles };
  }
}

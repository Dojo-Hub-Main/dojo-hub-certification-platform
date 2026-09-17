import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.interface';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResendVerificationDto, VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';
import { SwitchWorkspaceDto } from './dto/switch-workspace.dto';

function getCookie(req: Request, name: string): string | undefined {
  return (req.cookies as Record<string, string> | undefined)?.[name];
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /*
   * Registration deliberately does NOT start a session. A new account signs in
   * explicitly afterwards, which keeps one clear entry point into the platform and
   * is the behaviour email verification will build on — an unverified account must
   * not be able to slip straight in.
   */
  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const session = await this.authService.register(dto);
    return { user: session.user };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto.email);
  }

  /** Always reports success, so this cannot be used to discover which addresses exist. */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.login(dto);
    this.setSessionCookies(
      res,
      session.accessToken,
      session.refreshToken,
      session.refreshTtlMs,
    );
    return { user: session.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.refresh(
      getCookie(req, 'refresh_token'),
    );
    this.setSessionCookies(
      res,
      session.accessToken,
      session.refreshToken,
      session.refreshTtlMs,
    );
    return { user: session.user };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(getCookie(req, 'refresh_token'));
    // Attributes must mirror how the cookies were set, or the browser may keep them.
    const isProd = this.configService.get<string>('nodeEnv') === 'production';
    const crossSite = { sameSite: isProd ? ('none' as const) : ('lax' as const), secure: isProd };
    res.clearCookie('access_token', { httpOnly: true, ...crossSite });
    res.clearCookie('refresh_token', { httpOnly: true, ...crossSite, path: '/api/auth' });
    return { success: true };
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: RequestUser) {
    return this.authService.me(user.id, user.role);
  }

  /** Changes which of the account's roles this session acts as. */
  @ApiBearerAuth()
  @Post('switch-workspace')
  @HttpCode(HttpStatus.OK)
  async switchWorkspace(
    @CurrentUser() user: RequestUser,
    @Body() dto: SwitchWorkspaceDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.switchWorkspace(
      user,
      dto.role,
      getCookie(req, 'refresh_token'),
    );
    this.setSessionCookies(
      res,
      session.accessToken,
      session.refreshToken,
      session.refreshTtlMs,
    );
    return { user: session.user };
  }

  @ApiBearerAuth()
  @Patch('me')
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.id, dto);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto);
  }

  private setSessionCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    refreshTtlMs: number,
  ) {
    const isProd = this.configService.get<string>('nodeEnv') === 'production';
    // In production the web app and API are served from different hostnames (e.g. two
    // separate Render services), which makes every API call cross-site. A 'lax' cookie
    // is withheld on cross-site XHR, so the browser would accept the login response and
    // then silently send no credentials on any subsequent request. 'none' + Secure is
    // the only combination browsers allow cross-site. Locally both apps share
    // `localhost`, so 'lax' stays correct there and needs no HTTPS.
    const crossSite = { sameSite: isProd ? ('none' as const) : ('lax' as const), secure: isProd };
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      ...crossSite,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      ...crossSite,
      maxAge: refreshTtlMs,
      // Must match the app's global 'api' prefix (see main.ts) — every auth route is
      // actually served under /api/auth/*, not /auth/*. A mismatched path here means
      // the browser silently never sends this cookie back on any real request.
      path: '/api/auth',
    });
  }
}

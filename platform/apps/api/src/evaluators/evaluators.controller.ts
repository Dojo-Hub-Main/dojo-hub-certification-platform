import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@dojo-hub/shared';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.interface';
import { EvaluatorsService } from './evaluators.service';
import {
  AcceptInvitationDto,
  InviteEvaluatorDto,
  SetEvaluatorCoursesDto,
} from './dto/evaluator.dto';

@ApiTags('evaluators')
@Controller('evaluators')
export class EvaluatorsController {
  constructor(private readonly evaluatorsService: EvaluatorsService) {}

  /** Every evaluator with the courses they review, and every course with its evaluator count. */
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Get()
  list() {
    return this.evaluatorsService.listEvaluators();
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Get('invitations')
  pendingInvitations() {
    return this.evaluatorsService.pendingInvitations();
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Post('invitations')
  invite(@CurrentUser() actor: RequestUser, @Body() dto: InviteEvaluatorDto) {
    return this.evaluatorsService.invite(actor, dto);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Post('invitations/:id/resend')
  @HttpCode(HttpStatus.OK)
  resend(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.evaluatorsService.resend(actor, id);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Delete('invitations/:id')
  cancel(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.evaluatorsService.cancel(actor, id);
  }

  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @Patch(':id/courses')
  setCourses(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetEvaluatorCoursesDto,
  ) {
    return this.evaluatorsService.setCourses(actor, id, dto);
  }

  /*
   * Accepting happens before there is any session — the emailed link is what proves the
   * address — so these two are public. Both are useless without the token, which is a
   * single-use random value that expires.
   */
  @Public()
  @Get('invitations/token/:token')
  invitation(@Param('token') token: string) {
    return this.evaluatorsService.invitationByToken(token);
  }

  @Public()
  @Post('invitations/token/:token/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('token') token: string, @Body() dto: AcceptInvitationDto) {
    return this.evaluatorsService.accept(token, dto);
  }
}

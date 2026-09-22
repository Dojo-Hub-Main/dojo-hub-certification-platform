import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@dojo-hub/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.interface';
import { EnrollmentsService } from './enrollments.service';

@ApiTags('enrollments')
@ApiBearerAuth()
@Controller('enrollments')
@Roles(UserRole.STUDENT)
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get('me')
  listMine(@CurrentUser() user: RequestUser) {
    return this.enrollmentsService.listMine(user.id);
  }

  /*
   * Paid courses: a student's request waits here until an administrator confirms payment
   * has been settled. These three are the administrator's side of that.
   */
  @Roles(UserRole.ADMIN)
  @Get('requests')
  pendingRequests() {
    return this.enrollmentsService.pendingRequests();
  }

  @Roles(UserRole.ADMIN)
  @Post('requests/:id/approve')
  approve(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    return this.enrollmentsService.approve(actor, id);
  }

  @Roles(UserRole.ADMIN)
  @Post('requests/:id/decline')
  decline(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.enrollmentsService.decline(actor, id, body?.reason);
  }

  @Post('tracks/:trackId')
  enroll(@CurrentUser() user: RequestUser, @Param('trackId') trackId: string) {
    return this.enrollmentsService.enroll(user, trackId);
  }

  @Post('tracks/:trackId/start')
  start(@CurrentUser() user: RequestUser, @Param('trackId') trackId: string) {
    return this.enrollmentsService.start(user, trackId);
  }

  @Delete('tracks/:trackId')
  unenroll(
    @CurrentUser() user: RequestUser,
    @Param('trackId') trackId: string,
  ) {
    return this.enrollmentsService.unenroll(user, trackId);
  }
}

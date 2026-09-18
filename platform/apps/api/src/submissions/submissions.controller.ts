import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { SubmissionStatus, UserRole } from '@dojo-hub/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.interface';
import { SubmissionsService } from './submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';

class ToggleRubricDto {
  @IsBoolean()
  checked: boolean;
}

@ApiTags('submissions')
@ApiBearerAuth()
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Roles(UserRole.STUDENT)
  @Post()
  create(@CurrentUser() actor: RequestUser, @Body() dto: CreateSubmissionDto) {
    return this.submissionsService.create(actor, dto);
  }

  @Roles(UserRole.STUDENT)
  @Get('mine')
  mine(@CurrentUser() actor: RequestUser) {
    return this.submissionsService.mine(actor.id);
  }

  @Roles(UserRole.EVALUATOR, UserRole.ADMIN)
  @Get('queue')
  queue(
    @CurrentUser() actor: RequestUser,
    @Query('status') status?: SubmissionStatus,
  ) {
    return this.submissionsService.queue(actor, status);
  }

  @Roles(UserRole.EVALUATOR, UserRole.ADMIN)
  @Get('queue/stats')
  queueStats(@CurrentUser() actor: RequestUser) {
    return this.submissionsService.queueStats(actor);
  }

  @Get(':id')
  async getById(@CurrentUser() actor: RequestUser, @Param('id') id: string) {
    // Who may read this is decided in the service, alongside the same rule for grading.
    return this.submissionsService.getById(actor, id);
  }

  @Roles(UserRole.EVALUATOR, UserRole.ADMIN)
  @Patch(':id/rubric/:checkId')
  toggleRubric(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Param('checkId') checkId: string,
    @Body() dto: ToggleRubricDto,
  ) {
    return this.submissionsService.toggleRubricCheck(
      actor,
      id,
      checkId,
      dto.checked,
    );
  }

  @Roles(UserRole.EVALUATOR, UserRole.ADMIN)
  @Post(':id/grade')
  grade(
    @CurrentUser() actor: RequestUser,
    @Param('id') id: string,
    @Body() dto: GradeSubmissionDto,
  ) {
    return this.submissionsService.grade(actor, id, dto);
  }
}

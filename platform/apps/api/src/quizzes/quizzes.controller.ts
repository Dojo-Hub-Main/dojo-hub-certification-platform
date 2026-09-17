import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AttemptTargetType, UserRole } from '@dojo-hub/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser } from '../common/types/request-user.interface';
import { QuizzesService } from './quizzes.service';
import {
  CreateModuleQuizDto,
  CreateTrackAssessmentDto,
} from './dto/create-quiz.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateModuleQuizDto, UpdateQuestionDto } from './dto/update-question.dto';
import { CheckAnswerDto } from './dto/check-answer.dto';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { GradeAttemptDto } from './dto/grade-attempt.dto';

@ApiTags('quizzes')
@ApiBearerAuth()
@Controller('quizzes')
export class QuizzesController {
  constructor(private readonly quizzesService: QuizzesService) {}

  @Get('modules/:moduleId')
  getModuleQuiz(
    @CurrentUser() actor: RequestUser,
    @Param('moduleId') moduleId: string,
  ) {
    return this.quizzesService.getModuleQuiz(actor, moduleId);
  }

  @Get('tracks/:trackId/assessment')
  getTrackAssessment(@Param('trackId') trackId: string) {
    return this.quizzesService.getTrackAssessment(trackId);
  }

  @Roles(UserRole.ADMIN)
  @Post('modules/:moduleId')
  createModuleQuiz(
    @CurrentUser() actor: RequestUser,
    @Param('moduleId') moduleId: string,
    @Body() dto: CreateModuleQuizDto,
  ) {
    return this.quizzesService.createModuleQuiz(actor, moduleId, dto);
  }

  @Roles(UserRole.ADMIN)
  @Post('tracks/:trackId/assessment')
  createTrackAssessment(
    @CurrentUser() actor: RequestUser,
    @Param('trackId') trackId: string,
    @Body() dto: CreateTrackAssessmentDto,
  ) {
    return this.quizzesService.createTrackAssessment(actor, trackId, dto);
  }

  @Roles(UserRole.ADMIN)
  @Post('module-quiz/:quizId/questions')
  addModuleQuizQuestion(
    @CurrentUser() actor: RequestUser,
    @Param('quizId') quizId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.quizzesService.addQuestion(
      actor,
      { moduleQuizId: quizId },
      dto,
    );
  }

  @Roles(UserRole.ADMIN)
  @Post('track-assessment/:assessmentId/questions')
  addTrackAssessmentQuestion(
    @CurrentUser() actor: RequestUser,
    @Param('assessmentId') assessmentId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.quizzesService.addQuestion(
      actor,
      { trackAssessmentId: assessmentId },
      dto,
    );
  }

  @Roles(UserRole.ADMIN)
  @Patch('questions/:questionId')
  updateQuestion(
    @CurrentUser() actor: RequestUser,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.quizzesService.updateQuestion(actor, questionId, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('module-quiz/:quizId')
  updateModuleQuiz(
    @CurrentUser() actor: RequestUser,
    @Param('quizId') quizId: string,
    @Body() dto: UpdateModuleQuizDto,
  ) {
    return this.quizzesService.updateModuleQuiz(actor, quizId, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete('questions/:questionId')
  removeQuestion(
    @CurrentUser() actor: RequestUser,
    @Param('questionId') questionId: string,
  ) {
    return this.quizzesService.removeQuestion(actor, questionId);
  }

  /** Marks one answer mid-quiz, so a student learns from a mistake while it is fresh. */
  @Roles(UserRole.STUDENT)
  @Post('questions/:questionId/check')
  checkAnswer(
    @CurrentUser() actor: RequestUser,
    @Param('questionId') questionId: string,
    @Body() dto: CheckAnswerDto,
  ) {
    return this.quizzesService.checkAnswer(actor, questionId, dto.answer);
  }

  @Roles(UserRole.STUDENT)
  @Post('module-quiz/:quizId/attempts')
  submitModuleQuizAttempt(
    @CurrentUser() actor: RequestUser,
    @Param('quizId') quizId: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.quizzesService.submitAttempt(
      actor,
      AttemptTargetType.MODULE_QUIZ,
      quizId,
      dto,
    );
  }

  @Roles(UserRole.STUDENT)
  @Post('track-assessment/:assessmentId/attempts')
  submitTrackAssessmentAttempt(
    @CurrentUser() actor: RequestUser,
    @Param('assessmentId') assessmentId: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.quizzesService.submitAttempt(
      actor,
      AttemptTargetType.TRACK_ASSESSMENT,
      assessmentId,
      dto,
    );
  }

  @Roles(UserRole.EVALUATOR)
  @Get('attempts/pending')
  pendingManualGrading() {
    return this.quizzesService.pendingManualGrading();
  }

  @Roles(UserRole.EVALUATOR)
  @Patch('attempts/:attemptId/grade')
  gradeAttempt(
    @CurrentUser() actor: RequestUser,
    @Param('attemptId') attemptId: string,
    @Body() dto: GradeAttemptDto,
  ) {
    return this.quizzesService.gradeAttemptManually(actor, attemptId, dto);
  }
}

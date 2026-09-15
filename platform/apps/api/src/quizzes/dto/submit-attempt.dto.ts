import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class SubmitAttemptDto {
  @ApiProperty({
    description:
      'Map of questionId -> selected option index, or an array of indices for a question with multiple correct answers',
    type: Object,
  })
  @IsObject()
  objectiveAnswers: Record<string, number | number[]>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(30, {
    message: 'Your subjective answer must be at least 30 characters.',
  })
  subjectiveAnswerText?: string;

  @ApiProperty({ enum: ['AI', 'MANUAL'] })
  @IsIn(['AI', 'MANUAL'])
  gradingMode: 'AI' | 'MANUAL';
}

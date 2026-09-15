import { ApiProperty } from '@nestjs/swagger';
import { QuizQuestionType } from '@dojo-hub/shared';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

function isType(type: QuizQuestionType) {
  return (o: CreateQuestionDto) => o.type === type;
}

export class CreateQuestionDto {
  @ApiProperty({ enum: QuizQuestionType })
  @IsEnum(QuizQuestionType)
  type: QuizQuestionType;

  // Objective fields
  @ApiProperty({ required: false })
  @ValidateIf(isType(QuizQuestionType.OBJECTIVE))
  @IsString()
  @MinLength(5)
  question?: string;

  @ApiProperty({ type: [String], required: false })
  @ValidateIf(isType(QuizQuestionType.OBJECTIVE))
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  options?: string[];

  /** Students tick every correct option rather than choosing one. */
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @ApiProperty({ required: false })
  @ValidateIf(
    (o: CreateQuestionDto) =>
      o.type === QuizQuestionType.OBJECTIVE && !o.allowMultiple,
  )
  @IsInt()
  @Min(0)
  correctIndex?: number;

  @ApiProperty({ type: [Number], required: false })
  @ValidateIf(
    (o: CreateQuestionDto) =>
      o.type === QuizQuestionType.OBJECTIVE && !!o.allowMultiple,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  correctIndices?: number[];

  @ApiProperty({ required: false })
  @ValidateIf(isType(QuizQuestionType.OBJECTIVE))
  @IsString()
  @MinLength(5)
  explanation?: string;

  // Subjective fields
  @ApiProperty({ required: false })
  @ValidateIf(isType(QuizQuestionType.SUBJECTIVE))
  @IsString()
  @MinLength(10)
  prompt?: string;

  @ApiProperty({ required: false })
  @ValidateIf(isType(QuizQuestionType.SUBJECTIVE))
  @IsString()
  @MinLength(5)
  guidelines?: string;

  @ApiProperty({ type: [String], required: false })
  @ValidateIf(isType(QuizQuestionType.SUBJECTIVE))
  @IsArray()
  @IsString({ each: true })
  sampleKeywords?: string[];
}

import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Every field optional: an edit sends only what changed. A question's type is fixed once
 * created — turning a multiple-choice question into a written one would orphan the answers
 * already recorded against it — so it is deliberately absent here.
 */
export class UpdateQuestionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(5)
  question?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  options?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  correctIndex?: number;

  /** Switching this changes which answer key applies; send the matching key with it. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @ApiProperty({ type: [Number], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  correctIndices?: number[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(5)
  explanation?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(10)
  prompt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(5)
  guidelines?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sampleKeywords?: string[];
}

export class UpdateModuleQuizDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  title?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  passThreshold?: number;
}

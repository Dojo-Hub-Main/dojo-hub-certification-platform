import { ApiProperty } from '@nestjs/swagger';
import { TrackAccess, TrackDifficulty } from '@dojo-hub/shared';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateTrackDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  description: string;

  @ApiProperty()
  @IsString()
  icon: string;

  /** Optional cover photo URL from the upload flow; blank keeps the illustration. */
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @ApiProperty()
  @IsString()
  categoryId: string;

  /** Free courses open on enrolment; paid ones wait for an administrator to approve. */
  @ApiProperty({ enum: TrackAccess, required: false })
  @IsOptional()
  @IsEnum(TrackAccess)
  access?: TrackAccess;

  @ApiProperty({ enum: TrackDifficulty })
  @IsEnum(TrackDifficulty)
  difficulty: TrackDifficulty;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(52)
  durationWeeks: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  examEnabled?: boolean = true;
}

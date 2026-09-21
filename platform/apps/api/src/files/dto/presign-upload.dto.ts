import { ApiProperty } from '@nestjs/swagger';
import { MAX_UPLOAD_BYTES, StoredFileKind } from '@dojo-hub/shared';
import { IsEnum, IsInt, IsString, Max, MinLength } from 'class-validator';

export class PresignUploadDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  originalName: string;

  @ApiProperty()
  @IsString()
  mimeType: string;

  @ApiProperty()
  @IsInt()
  // The storage refuses anything larger, so the platform refuses it first and says why.
  @Max(MAX_UPLOAD_BYTES, {
    message: `Files must be ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB or smaller. For a longer video, paste a video link instead of uploading the file.`,
  })
  sizeBytes: number;

  @ApiProperty({ enum: StoredFileKind })
  @IsEnum(StoredFileKind)
  kind: StoredFileKind;
}

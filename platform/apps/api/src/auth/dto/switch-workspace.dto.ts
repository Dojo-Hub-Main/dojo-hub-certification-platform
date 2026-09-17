import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@dojo-hub/shared';
import { IsEnum } from 'class-validator';

export class SwitchWorkspaceDto {
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}

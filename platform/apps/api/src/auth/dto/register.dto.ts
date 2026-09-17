import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@dojo-hub/shared';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  /**
   * Public sign-up creates student accounts only. Evaluators are invited by an
   * administrator, and admins are appointed by another admin — letting anyone register as
   * an evaluator gave strangers every student's submitted work.
   *
   * Still accepted as "STUDENT" so a sign-up page already open in someone's browser when
   * this changed keeps working; any other value is refused.
   */
  @ApiProperty({ enum: [UserRole.STUDENT], required: false })
  @IsOptional()
  @IsIn([UserRole.STUDENT], {
    message: 'Signing up creates a student account. Evaluators are invited by an administrator.',
  })
  role?: typeof UserRole.STUDENT;
}

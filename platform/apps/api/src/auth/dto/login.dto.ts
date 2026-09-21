import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /**
   * Unticked on a shared computer: the session then ends with the browser, and in any
   * case within hours rather than days. Defaults to true, which is how sign-in behaved
   * before the choice existed.
   */
  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password: string;
}

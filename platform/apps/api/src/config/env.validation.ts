import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

class EnvVars {
  @IsIn(['development', 'production', 'test'])
  @IsOptional()
  NODE_ENV: string = 'development';

  @IsNumberString()
  @IsOptional()
  PORT: string = '4000';

  @IsString()
  APP_URL: string;

  @IsString()
  WEB_URL: string;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_TTL: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_TTL: string = '7d';

  @IsString()
  CREDENTIAL_HMAC_SECRET: string;

  @IsString()
  S3_ENDPOINT: string;

  @IsString()
  S3_REGION: string;

  @IsString()
  S3_BUCKET: string;

  @IsString()
  S3_ACCESS_KEY_ID: string;

  @IsString()
  S3_SECRET_ACCESS_KEY: string;

  @IsBooleanString()
  @IsOptional()
  S3_FORCE_PATH_STYLE: string = 'true';

  @IsString()
  S3_PUBLIC_URL: string;

  /** Email. Absent in local dev — sends are skipped and logged rather than failing. */
  @IsString()
  @IsOptional()
  RESEND_API_KEY: string = '';

  @IsString()
  @IsOptional()
  EMAIL_FROM: string = 'Dojo Hub Learning Platform <noreply@dojohubug.com>';

  @IsString()
  @IsOptional()
  ANTHROPIC_API_KEY: string = '';

  @IsString()
  @IsOptional()
  ANTHROPIC_MODEL: string = 'claude-sonnet-4-5';
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }
  return validated;
}

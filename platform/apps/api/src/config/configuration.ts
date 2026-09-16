export default () => ({
  email: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    from: process.env.EMAIL_FROM ?? 'Dojo Hub Learning Platform <noreply@dojohubug.com>',
  },

  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  appUrl: process.env.APP_URL!,
  webUrl: process.env.WEB_URL!,
  database: {
    url: process.env.DATABASE_URL!,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  credential: {
    hmacSecret: process.env.CREDENTIAL_HMAC_SECRET!,
  },
  s3: {
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION!,
    bucket: process.env.S3_BUCKET!,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    publicUrl: process.env.S3_PUBLIC_URL!,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
  },
});

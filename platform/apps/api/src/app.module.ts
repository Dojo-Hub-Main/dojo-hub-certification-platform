import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ProxyAwareThrottlerGuard } from './common/guards/proxy-throttler.guard';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LevelsModule } from './levels/levels.module';
import { CategoriesModule } from './categories/categories.module';
import { TracksModule } from './tracks/tracks.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { ProgressModule } from './progress/progress.module';
import { AiGradingModule } from './ai-grading/ai-grading.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { FilesModule } from './files/files.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { CredentialsModule } from './credentials/credentials.module';
import { OfficeHoursModule } from './office-hours/office-hours.module';
import { BookmarksModule } from './bookmarks/bookmarks.module';
import { ReportsModule } from './reports/reports.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    EmailModule,
    ThrottlerModule.forRoot({
      // Raised from 120: requests arrive via the web app's proxy, so a single
      // shared bucket would be exhausted by a handful of active users.
      throttlers: [{ ttl: 60_000, limit: 400 }],
    }),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    LevelsModule,
    CategoriesModule,
    TracksModule,
    EnrollmentsModule,
    ProgressModule,
    AiGradingModule,
    QuizzesModule,
    FilesModule,
    SubmissionsModule,
    CredentialsModule,
    OfficeHoursModule,
    BookmarksModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ProxyAwareThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}

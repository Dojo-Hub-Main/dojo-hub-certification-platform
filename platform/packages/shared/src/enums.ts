// NOTE: these use the `as const` object + derived-union-type pattern (matching Prisma's
// own generated enum shape) rather than TS `enum`, so values stay structurally assignable
// to and from Prisma's generated types instead of being nominally distinct.

export const UserRole = {
  STUDENT: 'STUDENT',
  EVALUATOR: 'EVALUATOR',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AccountStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const TrackDifficulty = {
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
} as const;
export type TrackDifficulty = (typeof TrackDifficulty)[keyof typeof TrackDifficulty];

export const TrackStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
} as const;
export type TrackStatus = (typeof TrackStatus)[keyof typeof TrackStatus];

export const TrackAccess = {
  FREE: 'FREE',
  PAID: 'PAID',
} as const;
export type TrackAccess = (typeof TrackAccess)[keyof typeof TrackAccess];

export const EnrollmentApproval = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
} as const;
export type EnrollmentApproval = (typeof EnrollmentApproval)[keyof typeof EnrollmentApproval];

export const EnrollmentStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export const SubmissionType = {
  CAPSTONE: 'CAPSTONE',
  COMPETENCY: 'COMPETENCY',
} as const;
export type SubmissionType = (typeof SubmissionType)[keyof typeof SubmissionType];

export const SubmissionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type SubmissionStatus = (typeof SubmissionStatus)[keyof typeof SubmissionStatus];

export const StoredFileKind = {
  DOCUMENT: 'DOCUMENT',
  VIDEO: 'VIDEO',
} as const;
export type StoredFileKind = (typeof StoredFileKind)[keyof typeof StoredFileKind];

export const QuizQuestionType = {
  OBJECTIVE: 'OBJECTIVE',
  SUBJECTIVE: 'SUBJECTIVE',
} as const;
export type QuizQuestionType = (typeof QuizQuestionType)[keyof typeof QuizQuestionType];

export const AttemptTargetType = {
  MODULE_QUIZ: 'MODULE_QUIZ',
  TRACK_ASSESSMENT: 'TRACK_ASSESSMENT',
} as const;
export type AttemptTargetType = (typeof AttemptTargetType)[keyof typeof AttemptTargetType];

export const SubjectiveGradedBy = {
  AI: 'AI',
  EVALUATOR: 'EVALUATOR',
} as const;
export type SubjectiveGradedBy = (typeof SubjectiveGradedBy)[keyof typeof SubjectiveGradedBy];

export const SubjectiveStatus = {
  UNGRADED: 'UNGRADED',
  PENDING_EVALUATOR: 'PENDING_EVALUATOR',
  GRADED: 'GRADED',
} as const;
export type SubjectiveStatus = (typeof SubjectiveStatus)[keyof typeof SubjectiveStatus];

export const CredentialStatus = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
} as const;
export type CredentialStatus = (typeof CredentialStatus)[keyof typeof CredentialStatus];

export const AuditLogSeverity = {
  INFO: 'INFO',
  SUCCESS: 'SUCCESS',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
} as const;
export type AuditLogSeverity = (typeof AuditLogSeverity)[keyof typeof AuditLogSeverity];

export const OfficeHourBookingStatus = {
  BOOKED: 'BOOKED',
  CANCELLED: 'CANCELLED',
} as const;
export type OfficeHourBookingStatus = (typeof OfficeHourBookingStatus)[keyof typeof OfficeHourBookingStatus];

export const NotificationType = {
  SUBMISSION_GRADED: 'SUBMISSION_GRADED',
  SUBMISSION_RECEIVED: 'SUBMISSION_RECEIVED',
  CREDENTIAL_ISSUED: 'CREDENTIAL_ISSUED',
  LEVEL_UP: 'LEVEL_UP',
  OFFICE_HOUR_BOOKED: 'OFFICE_HOUR_BOOKED',
  OFFICE_HOUR_CANCELLED: 'OFFICE_HOUR_CANCELLED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  ACCOUNT_REACTIVATED: 'ACCOUNT_REACTIVATED',
  ROLE_CHANGED: 'ROLE_CHANGED',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const JobName = {
  GRADE_SUBJECTIVE_ANSWER: 'GRADE_SUBJECTIVE_ANSWER',
  GENERATE_USAGE_REPORT: 'GENERATE_USAGE_REPORT',
} as const;
export type JobName = (typeof JobName)[keyof typeof JobName];

import {
  AccountStatus,
  AttemptTargetType,
  AuditLogSeverity,
  CredentialStatus,
  EnrollmentStatus,
  NotificationType,
  OfficeHourBookingStatus,
  QuizQuestionType,
  StoredFileKind,
  SubjectiveGradedBy,
  SubjectiveStatus,
  SubmissionStatus,
  SubmissionType,
  TrackDifficulty,
  TrackStatus,
  UserRole,
} from './enums';

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: AccountStatus;
  createdAt: string;
}

export interface StudentProfileDto {
  userId: string;
  currentLevelId: string;
  currentLevel: LevelDto;
  joinedAt: string;
}

export interface LevelDto {
  id: string;
  name: string;
  order: number;
  passingScore: number;
}

export interface CategoryDto {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface CompetencyDto {
  id: string;
  moduleId: string;
  title: string;
  description: string;
  validationRequirements: string[];
  tools: string[];
}

export interface SubtitleCueDto {
  timeSeconds: number;
  text: string;
}

export interface TopicDto {
  id: string;
  moduleId: string;
  order: number;
  title: string;
  description: string;
  durationSeconds: number;
  videoUrl: string;
  referenceVideoUrl?: string | null;
  subtitles: SubtitleCueDto[];
  tools: string[];
  /** Reference material uploaded for the lesson — PDFs, Word, PowerPoint, spreadsheets. */
  documents: StoredFileDto[];
  /** Further videos and links beyond the main video, in the author's order. */
  resources: TopicResourceDto[];
  /**
   * True on the one lesson a course gives away — the first with a video. Set by the API
   * on syllabus responses so the UI knows which lesson to render as playable; every
   * other lesson comes back with videoUrl stripped until the viewer enrols.
   */
  isFreePreview?: boolean;
}

export type TopicResourceKind = 'VIDEO' | 'LINK';

export interface TopicResourceDto {
  title: string;
  url: string;
  kind: TopicResourceKind;
}

export interface ModuleDto {
  id: string;
  trackId: string;
  order: number;
  title: string;
  description: string;
  quizEnabled: boolean;
  tools: string[];
  topics: TopicDto[];
  competencies: CompetencyDto[];
  hasQuiz: boolean;
  /** How many questions the quiz holds, so the syllabus can say so before you start it. */
  quizQuestionCount?: number;
  /**
   * Present only on the admin fetch (/tracks/:id/admin), which deliberately keeps the
   * correct answers so a quiz can be edited. The student-facing routes strip them.
   */
  quiz?: ModuleQuizAdminDto | null;
}

export interface QuizQuestionAdminDto {
  id: string;
  type: QuizQuestionType;
  order: number;
  question: string | null;
  options: string[];
  correctIndex: number | null;
  explanation: string | null;
  prompt: string | null;
  guidelines: string | null;
}

export interface ModuleQuizAdminDto {
  id: string;
  moduleId: string;
  title: string;
  passThreshold: number;
  questions: QuizQuestionAdminDto[];
}

export interface TrackDto {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Uploaded cover photo; null falls back to the generated illustration. */
  coverImageUrl: string | null;
  categoryId: string;
  category: CategoryDto;
  difficulty: TrackDifficulty;
  durationWeeks: number;
  examEnabled: boolean;
  status: TrackStatus;
  modules: ModuleDto[];
  assessment: { id: string } | null;
}

export interface TrackSummaryDto {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Uploaded cover photo; null falls back to the generated illustration. */
  coverImageUrl: string | null;
  category: CategoryDto;
  difficulty: TrackDifficulty;
  durationWeeks: number;
  status: TrackStatus;
  moduleCount: number;
  topicCount: number;
}

export interface TopicProgressDto {
  id: string;
  userId: string;
  topicId: string;
  watched: boolean;
  watchedAt: string | null;
  lastPositionSeconds: number;
}

export interface EnrolledTrackDto {
  id: string;
  title: string;
  description: string;
  icon: string;
  /** Uploaded cover photo; null falls back to the generated illustration. */
  coverImageUrl: string | null;
  category: CategoryDto;
  difficulty: TrackDifficulty;
  durationWeeks: number;
  status: TrackStatus;
}

export interface EnrollmentDto {
  id: string;
  userId: string;
  trackId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedTopicCount: number;
  totalTopicCount: number;
  track: EnrolledTrackDto;
}

export interface QuizQuestionPublicDto {
  id: string;
  type: QuizQuestionType;
  question: string;
  options?: string[];
  prompt?: string;
  guidelines?: string;
  sampleKeywords?: string[];
}

export interface QuizDto {
  id: string;
  targetType: AttemptTargetType;
  targetId: string;
  title: string;
  objectiveQuestions: QuizQuestionPublicDto[];
  subjectiveQuestion: QuizQuestionPublicDto | null;
  passThreshold: number;
}

export interface QuizGradeResultDto {
  attemptId: string;
  objectiveScore: number;
  objectiveTotal: number;
  objectivePercentage: number;
  subjectiveScore: number | null;
  subjectiveStatus: SubjectiveStatus;
  subjectiveFeedback: string | null;
  weightedScore: number | null;
  passed: boolean | null;
  perQuestionResults: { questionId: string; correct: boolean; explanation: string }[];
}

export interface StoredFileDto {
  id: string;
  url: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  kind: StoredFileKind;
}

export interface SubmissionLinkDto {
  url: string;
  description: string;
}

export interface RubricCheckDto {
  id: string;
  requirement: string;
  checked: boolean;
}

export interface SubmissionDto {
  id: string;
  type: SubmissionType;
  studentId: string;
  studentName: string;
  studentEmail: string;
  levelId?: string | null;
  level?: LevelDto | null;
  trackId?: string | null;
  moduleId?: string | null;
  topicId?: string | null;
  topicTitle?: string | null;
  title: string;
  submissionText: string;
  links: SubmissionLinkDto[];
  files: StoredFileDto[];
  rubricChecks: RubricCheckDto[];
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  submittedAt: string;
  evaluatorId: string | null;
  evaluatorName: string | null;
  evaluatedAt: string | null;
}

export interface CredentialDto {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  /**
   * A credential certifies exactly one subject: a course the student completed, or —
   * for credentials issued under the older ladder — a level whose capstone was approved.
   * `subjectTitle` is whichever of the two applies, so the certificate and the public
   * verification page can render one line without caring which kind they were handed.
   */
  subjectTitle: string;
  levelId: string | null;
  level: LevelDto | null;
  trackId: string | null;
  track: { id: string; title: string; categoryName: string; difficulty: TrackDifficulty } | null;
  issuedAt: string;
  hash: string;
  verifyUrl: string;
  status: CredentialStatus;
  evaluatorSignatureName: string | null;
  adminSignatureName: string | null;
}

export interface AuditLogDto {
  id: string;
  actorId: string | null;
  actorName: string;
  actorRole: UserRole | 'GUEST';
  action: string;
  entityType: string | null;
  entityId: string | null;
  severity: AuditLogSeverity;
  createdAt: string;
}

export interface OfficeHourSlotDto {
  id: string;
  evaluatorId: string;
  evaluatorName: string;
  topic: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  isBookedByMe?: boolean;
}

export interface OfficeHourBookingDto {
  id: string;
  slotId: string;
  slot: OfficeHourSlotDto;
  studentId: string;
  studentName: string;
  status: OfficeHourBookingStatus;
  bookedAt: string;
}

export interface BookmarkDto {
  id: string;
  trackId: string;
  track: TrackSummaryDto;
  createdAt: string;
}

export interface CollectionDto {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PlatformMetricsDto {
  totalStudents: number;
  totalEvaluators: number;
  totalAdmins: number;
  suspendedAccounts: number;
  pendingSubmissions: number;
  certificatesAwarded: number;
  certificatesPending: number;
  platformCompletionRate: number;
  perTrack: TrackAnalyticsDto[];
}

export interface TrackAnalyticsDto {
  trackId: string;
  trackTitle: string;
  category: string;
  enrollments: number;
  activeLearners: number;
  submissionsTotal: number;
  submissionsReviewed: number;
  completionRate: number;
  certsAwarded: number;
  certsPending: number;
}

export interface EvaluatorInsightsDto {
  averageGradingScore: number;
  averageResolutionHours: number;
  firstAttemptPassRate: number;
  totalGraded: number;
}

export interface AuthTokensResultDto {
  user: PublicUser;
}

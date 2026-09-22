-- Free and paid courses. Additive only: every existing course is FREE and every
-- existing enrolment stays APPROVED, so nobody loses access.
CREATE TYPE "TrackAccess" AS ENUM ('FREE', 'PAID');
CREATE TYPE "EnrollmentApproval" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

ALTER TABLE "Track" ADD COLUMN "access" "TrackAccess" NOT NULL DEFAULT 'FREE';

ALTER TABLE "Enrollment" ADD COLUMN "approval" "EnrollmentApproval" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "Enrollment" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Enrollment" ADD COLUMN "approvedById" TEXT;

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

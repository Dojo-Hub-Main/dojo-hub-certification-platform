-- Evaluator invitations and course assignments. Additive only: no existing table changes.
-- CreateTable
CREATE TABLE "EvaluatorAssignment" (
    "id" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluatorAssignment_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "EvaluatorInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "trackIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvaluatorInvitation_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "EvaluatorAssignment_trackId_idx" ON "EvaluatorAssignment"("trackId");
-- CreateIndex
CREATE UNIQUE INDEX "EvaluatorAssignment_evaluatorId_trackId_key" ON "EvaluatorAssignment"("evaluatorId", "trackId");
-- CreateIndex
CREATE UNIQUE INDEX "EvaluatorInvitation_token_key" ON "EvaluatorInvitation"("token");
-- CreateIndex
CREATE INDEX "EvaluatorInvitation_email_idx" ON "EvaluatorInvitation"("email");
-- AddForeignKey
ALTER TABLE "EvaluatorAssignment" ADD CONSTRAINT "EvaluatorAssignment_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EvaluatorAssignment" ADD CONSTRAINT "EvaluatorAssignment_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EvaluatorAssignment" ADD CONSTRAINT "EvaluatorAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EvaluatorInvitation" ADD CONSTRAINT "EvaluatorInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EvaluatorInvitation" ADD CONSTRAINT "EvaluatorInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

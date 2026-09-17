-- Per-option explanations and a lesson to review, for LinkedIn-style quiz feedback.
ALTER TABLE "QuizQuestion" ADD COLUMN "optionFeedback" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "QuizQuestion" ADD COLUMN "reviewTopicId" TEXT;

ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_reviewTopicId_fkey"
  FOREIGN KEY ("reviewTopicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

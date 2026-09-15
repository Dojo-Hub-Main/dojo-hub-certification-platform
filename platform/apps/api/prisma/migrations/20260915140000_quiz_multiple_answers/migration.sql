-- Questions where students tick every correct option. Existing questions stay single-answer.
ALTER TABLE "QuizQuestion" ADD COLUMN "allowMultiple" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "QuizQuestion" ADD COLUMN "correctIndices" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

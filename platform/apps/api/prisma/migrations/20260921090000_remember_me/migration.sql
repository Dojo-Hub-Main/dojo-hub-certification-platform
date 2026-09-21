-- "Keep me signed in": sessions without it end when the browser closes.
ALTER TABLE "RefreshToken" ADD COLUMN "rememberMe" BOOLEAN NOT NULL DEFAULT true;

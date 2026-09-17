-- One account can hold several roles. Additive only: the single "role" column stays and
-- keeps being written, so the previous release still runs against this database.
ALTER TABLE "User" ADD COLUMN "roles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[];
UPDATE "User" SET "roles" = ARRAY["role"] WHERE "roles" IS NULL OR cardinality("roles") = 0;

-- The workspace a session acts as, so refreshing keeps it.
ALTER TABLE "RefreshToken" ADD COLUMN "activeRole" "UserRole";

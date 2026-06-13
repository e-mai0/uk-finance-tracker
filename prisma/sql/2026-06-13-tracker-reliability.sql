-- Tracker live-listings reliability (Plan 1 foundations).
-- Additive only. Apply to the shared Supabase DB before deploying the branch.

-- New ATS source kinds (Workday already exists). Goldman + Deutsche Bank route
-- via CAREERS_PAGE hostname dispatch, so they get no enum value.
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'ORACLE_CLOUD';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'EIGHTFOLD';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'AVATURE';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'RADANCY';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'TALNET';

-- Opportunity: deadline honesty + close lifecycle.
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "deadlineEstimated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "isRolling" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "consecutiveMisses" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "Opportunity" ADD COLUMN IF NOT EXISTS "closeReason" TEXT;

-- IngestionSource: per-ATS config + closure-sweep gate.
ALTER TABLE "IngestionSource" ADD COLUMN IF NOT EXISTS "config" JSONB;
ALTER TABLE "IngestionSource" ADD COLUMN IF NOT EXISTS "lastSuccessfulFetchAt" TIMESTAMP(3);

-- 2026-06-17 · Tracker season + region taxonomy (ADR-003 / Cycle 3)
-- Backs the multi-season + multi-region ingestion change. The merged code adds
-- two NEW classified columns to "Opportunity" — "programmeTypeEnum"
-- (ProgrammeType) and "region" (Region) — plus the two backing Postgres enum
-- types. Until this is applied, ingestion/queries that read or write these
-- columns throw at runtime; the existing String "programmeType", "country",
-- "isUkBased", "isSummerInternship" columns are untouched and retained.
--
-- Backfill is correct by default: every existing row is genuinely a UK summer
-- internship under the old pipeline, so the column defaults
-- (SUMMER_INTERNSHIP / UK) are the right values. No data-migration script
-- needed; the next idempotent sync self-corrects any re-classified rows.
--
-- Fully additive and idempotent (safe to re-run). Run against the shared
-- Supabase DB ("trackr") before deploying the season/region change.

-- CreateEnum: ProgrammeType  (idempotent — PG has no CREATE TYPE IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProgrammeType') THEN
    CREATE TYPE "ProgrammeType" AS ENUM (
      'SPRING_WEEK',
      'SUMMER_INTERNSHIP',
      'OFF_CYCLE',
      'INDUSTRIAL_PLACEMENT'
    );
  END IF;
END $$;

-- CreateEnum: Region  (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Region') THEN
    CREATE TYPE "Region" AS ENUM (
      'UK',
      'US',
      'HK',
      'OTHER'
    );
  END IF;
END $$;

-- AlterTable: Opportunity.programmeTypeEnum  (existing rows backfill to SUMMER_INTERNSHIP)
ALTER TABLE "Opportunity"
  ADD COLUMN IF NOT EXISTS "programmeTypeEnum" "ProgrammeType" NOT NULL DEFAULT 'SUMMER_INTERNSHIP';

-- AlterTable: Opportunity.region  (existing rows backfill to UK)
ALTER TABLE "Opportunity"
  ADD COLUMN IF NOT EXISTS "region" "Region" NOT NULL DEFAULT 'UK';

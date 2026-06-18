-- 2026-06-17 · Tracker programme-type (season) taxonomy (ADR-003, UK-only per ADR-005)
-- Backs the multi-season ingestion change. The merged code adds one NEW
-- classified column to "Opportunity" — "programmeTypeEnum" (ProgrammeType) —
-- plus its backing Postgres enum type. Until this is applied,
-- ingestion/queries that read or write this column throw at runtime; the
-- existing String "programmeType", "country", "isUkBased", "isSummerInternship"
-- columns are untouched and retained.
--
-- The tracker is UK-only (ADR-005); the previously-planned "region" column +
-- "Region" enum were dropped before merge, so this migration never adds them.
--
-- ADR-006 narrows the tracked scope to the 3 core internship seasons
-- (SPRING_WEEK / SUMMER_INTERNSHIP / OFF_CYCLE); industrial placements are
-- EXCLUDED upstream in classify.ts and never persisted, so the "ProgrammeType"
-- enum no longer contains INDUSTRIAL_PLACEMENT. On a clean DB the CREATE TYPE
-- below makes the 3-value enum directly. (This file has not yet been applied to
-- prod; if a DB already created the enum WITH the old 4th value, the value is
-- simply unused — Postgres cannot drop an enum value in place, and no rows ever
-- carry it.)
--
-- Backfill is correct by default: every existing row is genuinely a summer
-- internship under the old pipeline, so the column default (SUMMER_INTERNSHIP)
-- is the right value. No data-migration script needed; the next idempotent sync
-- self-corrects any re-classified rows.
--
-- Fully additive and idempotent (safe to re-run). Run against the shared
-- Supabase DB ("trackr") before deploying the season change.

-- CreateEnum: ProgrammeType  (idempotent — PG has no CREATE TYPE IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProgrammeType') THEN
    CREATE TYPE "ProgrammeType" AS ENUM (
      'SPRING_WEEK',
      'SUMMER_INTERNSHIP',
      'OFF_CYCLE'
    );
  END IF;
END $$;

-- AlterTable: Opportunity.programmeTypeEnum  (existing rows backfill to SUMMER_INTERNSHIP)
ALTER TABLE "Opportunity"
  ADD COLUMN IF NOT EXISTS "programmeTypeEnum" "ProgrammeType" NOT NULL DEFAULT 'SUMMER_INTERNSHIP';

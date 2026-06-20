-- 2026-06-18 · Tracker: two new ATS source kinds (SuccessFactors + SmartRecruiters)
-- Backs the new live adapters that onboard SuccessFactors firms (Janus
-- Henderson, Mizuho, Partners Group, Royal London AM, …) and the SmartRecruiters
-- firm (Societe Generale). The merged code adds two NEW values to the existing
-- "SourceType" Postgres enum:
--   • SUCCESSFACTORS
--   • SMARTRECRUITERS
-- These are used by IngestionSource.kind (to route a source to its adapter) and
-- by Opportunity.sourceType (the provenance of an ingested row).
--
-- Until this is applied, seeding/ingesting any source row with one of these
-- kinds — or upserting an opportunity carrying the new sourceType — throws at
-- runtime ("invalid input value for enum SourceType"). No existing rows change;
-- every prior SourceType value (CAREERS_PAGE, GREENHOUSE, LEVER, ASHBY, WORKDAY,
-- ORACLE_CLOUD, EIGHTFOLD, AVATURE, RADANCY, TALNET, MANUAL) is untouched.
--
-- Fully additive and idempotent (safe to re-run). ALTER TYPE ... ADD VALUE is
-- not transactional on some Postgres versions — run each statement standalone
-- (Supabase SQL editor / psql), not wrapped in BEGIN/COMMIT. Run against the
-- shared Supabase DB ("cyclops", project ref vemgdpahhhabkphgevzx) before
-- deploying the new-adapter change.

ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'SUCCESSFACTORS';
ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'SMARTRECRUITERS';

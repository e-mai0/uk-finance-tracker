-- Cyclops phase 2 — DraftEdit, EmployerResearch, GeneratedDraft.provenance
-- Apply AFTER 2026-06-09-cyclops-memory.sql and 2026-06-09-pgvector.sql.
-- Additive only: CREATE TABLE x2 and one nullable ADD COLUMN. Nothing existing
-- is altered destructively.

CREATE TABLE "DraftEdit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "edited" TEXT NOT NULL,
    "distilled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftEdit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DraftEdit_userId_distilled_idx" ON "DraftEdit"("userId", "distilled");

CREATE TABLE "EmployerResearch" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployerResearch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployerResearch_employerId_key" ON "EmployerResearch"("employerId");

ALTER TABLE "EmployerResearch" ADD CONSTRAINT "EmployerResearch_employerId_fkey"
  FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GeneratedDraft" ADD COLUMN "provenance" TEXT;
-- Radar — live ATS ingestion sources (merge of claude/internship-platform-audit).
-- Additive only: one enum value + one new table. Nothing existing is altered.
-- Matches prisma/schema.prisma: SourceType gains ASHBY; new IngestionSource model.

ALTER TYPE "SourceType" ADD VALUE IF NOT EXISTS 'ASHBY';

CREATE TABLE "IngestionSource" (
    "id" TEXT NOT NULL,
    "kind" "SourceType" NOT NULL,
    "identifier" TEXT NOT NULL,
    "employerName" TEXT NOT NULL,
    "sector" TEXT,
    "url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "watchOnly" BOOLEAN NOT NULL DEFAULT false,
    "watchState" JSONB,
    "lastChangedAt" TIMESTAMP(3),
    "suggestedById" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngestionSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IngestionSource_kind_identifier_key" ON "IngestionSource"("kind", "identifier");

CREATE INDEX "IngestionSource_enabled_idx" ON "IngestionSource"("enabled");

-- RLS on, no policies (matches the copilot tables): Prisma connects as the
-- table owner and bypasses RLS; PostgREST/public API stays locked out.
ALTER TABLE "IngestionSource" ENABLE ROW LEVEL SECURITY;

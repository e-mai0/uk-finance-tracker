-- CV Builder (#11) — additive schema for the guided CV builder + chatbot.
-- Apply to the shared Supabase DB (SQL editor or `psql "$DIRECT_URL" -f …`)
-- before/with deploying the CV Builder feature. Additive only; safe to re-run.
--
-- #11 added `ChatSession.kind` and the `BuiltCv` model to schema.prisma but
-- shipped no SQL, so prod drifted: ChatSession reads 500 with P2022
-- ("column ChatSession.kind does not exist in the current database").

-- ChatSession gains a "kind" discriminator: "cyclops" | "cv-builder".
ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'cyclops';

-- New BuiltCv table — one structured CV per user (source of truth for the
-- preview + PDF/Word exports).
CREATE TABLE IF NOT EXISTS "BuiltCv" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "data"          JSONB NOT NULL,
    "formInput"     JSONB,
    "chatSessionId" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BuiltCv_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BuiltCv_userId_key" ON "BuiltCv"("userId");

-- FK to User with cascade delete (guarded so the script stays re-runnable).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BuiltCv_userId_fkey'
    ) THEN
        ALTER TABLE "BuiltCv"
            ADD CONSTRAINT "BuiltCv_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 2026-06-14 · CV Builder: BuiltCv store + ChatSession.kind
-- Backs PR #11 (CV Builder) and the #12 hotfix. The merged code calls
-- prisma.builtCv.{upsert,findUnique} (src/server/cv/store.ts) and writes
-- ChatSession.kind = 'cv-builder' — neither exists in the DB yet, so the
-- CV-builder routes throw at runtime until this is applied.
--
-- Fully additive and idempotent (safe to re-run). Run against the shared
-- Supabase DB ("trackr") before the CV Builder is exercised.

-- AlterTable: ChatSession.kind  (existing rows default to 'cyclops')
ALTER TABLE "ChatSession" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'cyclops';

-- CreateTable: BuiltCv
CREATE TABLE IF NOT EXISTS "BuiltCv" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "formInput" JSONB,
    "chatSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuiltCv_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one CV per user
CREATE UNIQUE INDEX IF NOT EXISTS "BuiltCv_userId_key" ON "BuiltCv"("userId");

-- AddForeignKey: BuiltCv.userId -> User.id  (idempotent guard; PG has no
-- ADD CONSTRAINT IF NOT EXISTS)
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

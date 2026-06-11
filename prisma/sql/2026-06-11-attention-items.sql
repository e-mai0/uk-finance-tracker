-- 2026-06-11 · GB+ Phase C: attention store
-- One canonical "pending decision" table; nav badges are filtered counts.
-- Fully additive. Run against the shared Supabase DB before deploying
-- code that depends on live badge counts (code no-ops gracefully until then).

-- CreateEnum
CREATE TYPE "AttentionKind" AS ENUM ('PROPOSAL', 'FLAG', 'QUESTION', 'BRIEF');

-- CreateEnum
CREATE TYPE "AttentionStatus" AS ENUM ('OPEN', 'SNOOZED', 'RESOLVED');

-- CreateTable
CREATE TABLE "AttentionItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AttentionKind" NOT NULL,
    "status" "AttentionStatus" NOT NULL DEFAULT 'OPEN',
    "key" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meta" JSONB,
    "snoozedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AttentionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttentionItem_userId_key_key" ON "AttentionItem"("userId", "key");

-- CreateIndex
CREATE INDEX "AttentionItem_userId_status_idx" ON "AttentionItem"("userId", "status");

-- AddForeignKey
ALTER TABLE "AttentionItem" ADD CONSTRAINT "AttentionItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

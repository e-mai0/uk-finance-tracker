-- Cyclops Phase 1: memory, chat, gardener, usage models
-- IMPORTANT: Apply to the shared Supabase DB in order: this file first, then
-- 2026-06-09-pgvector.sql. Both must be applied BEFORE setting VOYAGE_API_KEY.

-- CreateEnum
CREATE TYPE "MemoryAuthor" AS ENUM ('USER', 'CYCLOPS');

-- CreateTable
CREATE TABLE "MemoryFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryRevision" (
    "id" TEXT NOT NULL,
    "memoryFileId" TEXT NOT NULL,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    "author" "MemoryAuthor" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "parts" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GardenerQuestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GardenerQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GardenerRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GardenerRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryFile_userId_idx" ON "MemoryFile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryFile_userId_path_key" ON "MemoryFile"("userId", "path");

-- CreateIndex
CREATE INDEX "MemoryRevision_memoryFileId_createdAt_idx" ON "MemoryRevision"("memoryFileId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_userId_updatedAt_idx" ON "ChatSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "GardenerQuestion_userId_status_idx" ON "GardenerQuestion"("userId", "status");

-- CreateIndex
CREATE INDEX "GardenerRun_userId_ranAt_idx" ON "GardenerRun"("userId", "ranAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyUsage_userId_day_key" ON "DailyUsage"("userId", "day");

-- AddForeignKey
ALTER TABLE "MemoryFile" ADD CONSTRAINT "MemoryFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryRevision" ADD CONSTRAINT "MemoryRevision_memoryFileId_fkey" FOREIGN KEY ("memoryFileId") REFERENCES "MemoryFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

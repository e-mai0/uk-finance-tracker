-- Hot-path indexes (perf). Additive only — no data change, safe to apply any
-- time. Apply to the shared Supabase DB before/after deploying the branch.
--
-- Index names match Prisma's generated names ("{Model}_{field}_idx") so the
-- schema.prisma @@index additions don't show as drift.

-- Extension upserts an Application by looking the opportunity up via its public
-- application URL on every call (api/ext/application). Unindexed = seq scan of
-- the whole Opportunity table on the hottest external write path.
CREATE INDEX IF NOT EXISTS "Opportunity_applicationUrl_idx"
  ON "Opportunity" ("applicationUrl");

-- Application.opportunityId is used in equality lookups (startApplication) and
-- scanned by the onDelete: SetNull cascade. No index existed for the FK.
CREATE INDEX IF NOT EXISTS "Application_opportunityId_idx"
  ON "Application" ("opportunityId");

-- Approximate-nearest-neighbour index for semantic recall. semanticSearch
-- orders by cosine distance (the `<=>` operator); without an ANN index Postgres
-- computes the distance against every one of the user's rows (exact seq scan).
-- vector_cosine_ops matches the `<=>` operator used in src/server/ai/embed.ts.
-- Requires pgvector >= 0.5.0 (available on Supabase). For a large table build
-- with CREATE INDEX CONCURRENTLY (cannot run inside a transaction block).
CREATE INDEX IF NOT EXISTS "content_embeddings_embedding_hnsw_idx"
  ON content_embeddings USING hnsw (embedding vector_cosine_ops);

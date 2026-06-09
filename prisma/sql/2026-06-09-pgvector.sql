-- IMPORTANT: Apply to the shared Supabase DB AFTER 2026-06-09-cyclops-memory.sql
-- and BEFORE setting VOYAGE_API_KEY. On Supabase, verify the `vector` extension
-- is installed in a schema on the public search_path (Dashboard → Extensions).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE content_embeddings (
  id          text PRIMARY KEY,
  user_id     text NOT NULL,
  kind        text NOT NULL, -- 'answer' | 'draft'
  source_id   text NOT NULL,
  content     text NOT NULL,
  embedding   vector(1024) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, source_id)
);

CREATE INDEX content_embeddings_user_idx ON content_embeddings (user_id, kind);

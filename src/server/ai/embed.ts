import { prisma } from "@/server/db";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3.5-lite"; // 1024 dims

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, input: texts }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`voyage embeddings failed: ${res.status}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data.map((d) => d.embedding);
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

/** Fire-and-forget indexing; never throws into the caller's path. */
export async function indexContent(args: {
  userId: string;
  kind: "answer" | "draft";
  sourceId: string;
  content: string;
}): Promise<void> {
  if (!process.env.VOYAGE_API_KEY) return;
  try {
    const [vec] = await embed([args.content.slice(0, 8000)]);
    if (!vec) return;
    await prisma.$executeRaw`
      INSERT INTO content_embeddings (id, user_id, kind, source_id, content, embedding)
      VALUES (${crypto.randomUUID()}, ${args.userId}, ${args.kind}, ${args.sourceId},
              ${args.content}, ${toVectorLiteral(vec)}::vector)
      ON CONFLICT (kind, source_id)
      DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding`;
  } catch (err) {
    console.error("indexContent failed", err);
  }
}

export type SemanticHit = {
  kind: string;
  source_id: string;
  content: string;
  similarity: number;
};

export async function semanticSearch(
  userId: string,
  query: string,
  limit = 8,
): Promise<SemanticHit[]> {
  if (!process.env.VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY not configured");
  const [vec] = await embed([query]);
  if (!vec) return [];
  const lit = toVectorLiteral(vec);
  return prisma.$queryRaw<SemanticHit[]>`
    SELECT kind, source_id, content,
           1 - (embedding <=> ${lit}::vector) AS similarity
    FROM content_embeddings
    WHERE user_id = ${userId}
    ORDER BY embedding <=> ${lit}::vector
    LIMIT ${limit}`;
}

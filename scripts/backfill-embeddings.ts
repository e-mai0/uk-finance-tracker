import { prisma } from "../src/server/db";
import { indexContent } from "../src/server/ai/embed";

async function main() {
  if (!process.env.VOYAGE_API_KEY) {
    console.error("VOYAGE_API_KEY is not set — cannot backfill embeddings.");
    process.exit(1);
  }

  const answers = await prisma.answerBankItem.findMany();
  const drafts = await prisma.generatedDraft.findMany();
  const expected = answers.length + drafts.length;

  const [beforeRow] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM content_embeddings`;
  const before = Number(beforeRow.count);

  let failures = 0;

  for (const a of answers) {
    try {
      await indexContent({ userId: a.userId, kind: "answer", sourceId: a.id, content: `${a.questionText}\n${a.answer}` });
    } catch (err) {
      console.error(`Failed to index answer ${a.id}:`, err);
      failures++;
    }
  }
  for (const d of drafts) {
    try {
      await indexContent({ userId: d.userId, kind: "draft", sourceId: d.id, content: d.content });
    } catch (err) {
      console.error(`Failed to index draft ${d.id}:`, err);
      failures++;
    }
  }

  const [afterRow] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM content_embeddings`;
  const after = Number(afterRow.count);
  const indexed = after - before;

  console.log(`indexed ${indexed} / ${expected} items (${failures} failures, ${before} already present before run)`);

  if (expected > indexed + before) {
    console.error(`Expected ${expected} rows but only ${after} present — some items may not have been indexed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());

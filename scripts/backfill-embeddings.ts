import { prisma } from "../src/server/db";
import { indexContent } from "../src/server/ai/embed";

async function main() {
  const answers = await prisma.answerBankItem.findMany();
  for (const a of answers) {
    await indexContent({ userId: a.userId, kind: "answer", sourceId: a.id, content: `${a.questionText}\n${a.answer}` });
  }
  const drafts = await prisma.generatedDraft.findMany();
  for (const d of drafts) {
    await indexContent({ userId: d.userId, kind: "draft", sourceId: d.id, content: d.content });
  }
  console.log(`indexed ${answers.length} answers, ${drafts.length} drafts`);
}
main().then(() => process.exit(0));

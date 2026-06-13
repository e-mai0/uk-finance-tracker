// src/app/api/cv/docx/route.ts
// Streams the user's built CV as a .docx attachment.
// filename: <Name>_CV.docx  (User.name, slugified)
import { auth } from "@/server/auth";
import { getBuiltCv } from "@/server/cv/store";
import { renderCvDocx } from "@/server/cv/docx";
import { slugifyName } from "@/lib/cv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cv = await getBuiltCv(session.user.id);
  if (!cv) {
    return Response.json(
      { error: "No CV found. Build your CV at /cv-builder first." },
      { status: 404 },
    );
  }

  const nodeBuffer = await renderCvDocx(cv);
  const buffer = nodeBuffer.buffer.slice(
    nodeBuffer.byteOffset,
    nodeBuffer.byteOffset + nodeBuffer.byteLength,
  ) as ArrayBuffer;
  const slug = slugifyName(session.user.name ?? cv.fullName ?? "CV");
  const filename = `${slug}_CV.docx`;

  return new Response(buffer, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

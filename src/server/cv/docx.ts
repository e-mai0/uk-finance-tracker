// src/server/cv/docx.ts
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  TabStopType,
  TabStopPosition,
} from "docx";
import type { CvData } from "@/lib/cv";

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 220, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: "333333" })],
  });
}

/** A "Title ............ dates" line using a right tab stop. */
function entryHead(title: string, subtitle?: string, dates?: string): Paragraph {
  const children = [new TextRun({ text: title, bold: true, size: 22 })];
  if (subtitle) children.push(new TextRun({ text: ` — ${subtitle}`, size: 22 }));
  if (dates) children.push(new TextRun({ text: `\t${dates}`, size: 20, color: "555555" }));
  return new Paragraph({
    spacing: { before: 120, after: 20 },
    tabStops: dates ? [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }] : undefined,
    children,
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 20 }, children: undefined });
}

export async function renderCvDocx(cv: CvData): Promise<Buffer> {
  const body: Paragraph[] = [];

  // Header
  body.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: cv.fullName || "Your Name", bold: true, size: 36 })],
    }),
  );
  const contactBits = [cv.contact.email, cv.contact.phone, cv.contact.linkedin, cv.contact.website].filter(Boolean);
  if (contactBits.length) {
    body.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: contactBits.join("  |  "), size: 18, color: "555555" })],
      }),
    );
  }
  if (cv.summary) {
    body.push(sectionHeading("Summary"));
    body.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: cv.summary, size: 20 })] }));
  }

  if (cv.education.length) {
    body.push(sectionHeading("Education"));
    for (const e of cv.education) {
      body.push(entryHead(e.institution, e.qualification, e.dates));
      if (e.grade) body.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: e.grade, italics: true, size: 20 })] }));
      e.bullets.forEach((b) => body.push(bullet(b)));
    }
  }
  if (cv.experience.length) {
    body.push(sectionHeading("Experience"));
    for (const x of cv.experience) {
      body.push(entryHead(x.org, x.role, x.dates));
      x.bullets.forEach((b) => body.push(bullet(b)));
    }
  }
  if (cv.projects.length) {
    body.push(sectionHeading("Projects & Competitions"));
    for (const p of cv.projects) {
      body.push(entryHead(p.name, p.result, p.dates));
      if (p.skills.length) body.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: p.skills.join(", "), italics: true, size: 18, color: "555555" })] }));
      p.bullets.forEach((b) => body.push(bullet(b)));
    }
  }
  if (cv.accomplishments.length) {
    body.push(sectionHeading("Honours & Awards"));
    cv.accomplishments.forEach((a) =>
      body.push(bullet(`${a.title}${a.date ? ` (${a.date})` : ""}${a.description ? ` — ${a.description}` : ""}`)),
    );
  }
  if (cv.skills.length || cv.interests.length) {
    body.push(sectionHeading("Skills & Interests"));
    cv.skills.forEach((g) =>
      body.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [new TextRun({ text: `${g.label}: `, bold: true, size: 20 }), new TextRun({ text: g.items.join(", "), size: 20 })],
        }),
      ),
    );
    if (cv.interests.length) {
      body.push(
        new Paragraph({
          spacing: { after: 20 },
          children: [new TextRun({ text: "Interests: ", bold: true, size: 20 }), new TextRun({ text: cv.interests.join(", "), size: 20 })],
        }),
      );
    }
  }
  for (const sec of cv.sections) {
    body.push(sectionHeading(sec.heading));
    for (const e of sec.entries) {
      if (e.primary || e.secondary || e.dates) body.push(entryHead(e.primary ?? "", e.secondary, e.dates));
      if (e.text) body.push(new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: e.text, size: 20 })] }));
      e.bullets.forEach((b) => body.push(bullet(b)));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children: body }],
  });
  return Packer.toBuffer(doc);
}

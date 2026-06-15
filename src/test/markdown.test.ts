import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/markdown";

describe("Markdown renderer", () => {
  it("renders markdown syntax as HTML, not literal characters", () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, {
        children:
          "## Tier 1\n**You're a strong candidate.**\n- Jane Street\n- Citadel\n\n[apply](https://janestreet.com)",
      }),
    );
    expect(html).toContain("<h3");
    expect(html).toContain("<strong");
    expect(html).toContain("<ul");
    expect(html).toContain("<a ");
    // and must NOT leak the raw markers
    expect(html).not.toContain("**You're");
    expect(html).not.toContain("## Tier");
  });
});

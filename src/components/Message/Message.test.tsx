import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Markdown, TextMessage } from "./Message";

// F01 — stored XSS through the Markdown renderer. Payloads from the audit's
// Apéndice A.7: a link title/href that closes the attribute and injects an
// event handler. Contacts control this text; agents render it.

describe("F01: Markdown link rendering", () => {
  it("does not let a link title inject an event handler", () => {
    const { container } = render(
      <Markdown
        content={`[oferta](https://x.com 'a" onmouseover="alert(document.cookie)')`}
        direction="incoming"
      />,
    );

    expect(container.querySelectorAll("[onmouseover]")).toHaveLength(0);
    const a = container.querySelector("a")!;
    expect(a).not.toBeNull();
    expect(a.getAttribute("href")).toBe("https://x.com");
    expect(a.getAttribute("onmouseover")).toBeNull();
    expect(a.textContent).toBe("oferta");
  });

  it("does not let a link href break out of its attribute", () => {
    const { container } = render(
      <Markdown
        content={`[oferta](https://x.com/a"onmouseover="alert(1))`}
        direction="incoming"
      />,
    );

    expect(container.querySelectorAll("[onmouseover]")).toHaveLength(0);
    // The quote stays INSIDE the attribute value (escaped), so the whole
    // payload is the href and nothing became a second attribute.
    const a = container.querySelector("a")!;
    expect(a.getAttribute("href")).toBe(
      'https://x.com/a"onmouseover="alert(1)',
    );
    expect(a.attributes).toHaveLength(3); // href, target, rel
  });

  it("drops javascript: hrefs", () => {
    const { container } = render(
      <Markdown content={`[x](javascript:alert(1))`} direction="incoming" />,
    );

    for (const a of container.querySelectorAll("a")) {
      expect(a.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    }
  });

  it("keeps raw HTML inert", () => {
    const { container } = render(
      <Markdown
        content={`<img src=x onerror="alert(1)"> <script>alert(2)</script>`}
        direction="incoming"
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelectorAll("[onerror]")).toHaveLength(0);
  });

  it("opens links in a new tab without an opener", () => {
    const { container } = render(
      <Markdown content={`[doc](https://docs.example)`} direction="incoming" />,
    );

    const a = container.querySelector("a")!;
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("auto-links bare URLs (Remarkable 2 linkify plugin)", () => {
    const { container } = render(
      <Markdown
        content={`mirá https://example.test/oferta ahora`}
        direction="incoming"
      />,
    );

    const a = container.querySelector("a")!;
    expect(a).not.toBeNull();
    expect(a.getAttribute("href")).toBe("https://example.test/oferta");
  });
});

describe("F01: tool headers and JSON bodies", () => {
  it("renders a tool name from a remote MCP server as text, not HTML", () => {
    const { container } = render(
      <TextMessage
        header={`Uso: <img src=x onerror="alert(1)">evil__tool`}
        body="ok"
        type="markdown"
        direction="internal"
        timestamp="2026-09-01T10:00:00.000Z"
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("[onerror]")).toHaveLength(0);
    expect(container.textContent).toContain("evil__tool");
  });

  it("escapes HTML inside a JSON data body", () => {
    const { container } = render(
      <TextMessage
        body={{ html: `<img src=x onerror="alert(1)">` }}
        type="json"
        direction="internal"
        timestamp="2026-09-01T10:00:00.000Z"
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll("[onerror]")).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import { assessQuality, extractArticle, isThin } from "../src/extract.js";

const REAL_ARTICLE_HTML = `
<html>
<head>
  <meta property="og:title" content="A Real Article Title" />
  <meta property="og:description" content="A short description of the article." />
  <meta name="author" content="Jane Doe" />
  <title>Fallback Title</title>
</head>
<body>
  <article>
    <h1>A Real Article Title</h1>
    <p>This is the first paragraph of a real article, long enough that Readability
    should recognize it as the main content block rather than boilerplate chrome
    surrounding it, such as navigation links or a cookie banner.</p>
    <p>A second paragraph continues the thought with more substantive text so that
    the extracted content is unambiguously the article body and not noise.</p>
  </article>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
</body>
</html>
`;

const THIN_HTML = `<html><head></head><body><div id="app"></div></body></html>`;

describe("extractArticle", () => {
  it("extracts meta-tag title, description, and author", () => {
    const result = extractArticle(REAL_ARTICLE_HTML, "https://example.com/post");
    expect(result.title).toBe("A Real Article Title");
    expect(result.description).toBe("A short description of the article.");
    expect(result.author).toBe("Jane Doe");
  });

  it("extracts real body content via Readability", () => {
    const result = extractArticle(REAL_ARTICLE_HTML, "https://example.com/post");
    expect(result.content).toContain("first paragraph of a real article");
    expect(result.content).not.toContain("Home");
  });

  it("falls back to <title> when no og:title is present", () => {
    const html = `<html><head><title>Only A Title Tag</title></head><body><p>` +
      "some content ".repeat(20) + `</p></body></html>`;
    const result = extractArticle(html, "https://example.com/post");
    expect(result.title).toBe("Only A Title Tag");
  });

  it("returns empty fields for HTML with nothing usable, without throwing", () => {
    const result = extractArticle(THIN_HTML, "https://example.com/empty");
    expect(result.title).toBe("");
    expect(result.content).toBe("");
  });
});

describe("isThin", () => {
  it("is true when there is no title and little content", () => {
    expect(isThin({ title: "", description: "", content: "short", author: "", publishedDate: "" })).toBe(true);
  });

  it("is true when a title is present but content is short -- the render-fallback trigger", () => {
    // Regression 2026-09-20: the old check exempted any page with a title,
    // which is exactly the failure shape LessWrong/Alignment Forum/X hit --
    // a real <title> meta tag with a body that needs JS to render. This is
    // the render fallback's whole reason to exist, so a title alone must
    // never skip it.
    expect(isThin({ title: "A Title", description: "", content: "short nav chrome only", author: "", publishedDate: "" })).toBe(true);
  });

  it("is false when content is long, with or without a title", () => {
    const content = "word ".repeat(300); // 1500 chars, comfortably past the 1200-char bar
    expect(isThin({ title: "", description: "", content, author: "", publishedDate: "" })).toBe(false);
    expect(isThin({ title: "A Title", description: "", content, author: "", publishedDate: "" })).toBe(false);
  });
});

describe("assessQuality", () => {
  it("is 'empty' for essentially nothing, even with a title", () => {
    expect(assessQuality({ title: "A Title", description: "", content: "short", author: "", publishedDate: "" })).toBe("empty");
  });

  it("is 'thin' for real but short content -- still usable, just flagged", () => {
    const content = "word ".repeat(40); // 200 chars: past "empty", short of the 1200-char "ok" bar
    expect(assessQuality({ title: "", description: "", content, author: "", publishedDate: "" })).toBe("thin");
  });

  it("is 'ok' for a normal article body", () => {
    const content = "word ".repeat(300); // 1500 chars
    expect(assessQuality({ title: "", description: "", content, author: "", publishedDate: "" })).toBe("ok");
  });
});

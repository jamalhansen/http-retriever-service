import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export interface ExtractedArticle {
  title: string;
  description: string;
  content: string;
  author: string;
  publishedDate: string;
}

const EMPTY: ExtractedArticle = { title: "", description: "", content: "", author: "", publishedDate: "" };

function metaContent(doc: Document, selector: string): string {
  return doc.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
}

/**
 * Extracts title/description/author/date from <meta> tags (og:*, standard
 * fallbacks), the same priority order as local_first_common.html.extract_metadata.
 */
function extractMetaOnly(doc: Document): Pick<ExtractedArticle, "title" | "description" | "author" | "publishedDate"> {
  const title = metaContent(doc, 'meta[property="og:title"]') || doc.querySelector("title")?.textContent?.trim() || "";
  const description =
    metaContent(doc, 'meta[property="og:description"]') || metaContent(doc, 'meta[name="description"]');
  const author = metaContent(doc, 'meta[name="author"]') || metaContent(doc, 'meta[property="article:author"]');
  const publishedDate =
    metaContent(doc, 'meta[property="article:published_time"]') ||
    metaContent(doc, 'meta[itemprop="datePublished"]');
  return { title, description, author, publishedDate };
}

// Block elements that end a paragraph or line in the rendered article.
const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DIV", "DL", "DT", "FIGCAPTION", "FIGURE", "FOOTER",
  "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "OL", "P", "PRE", "SECTION", "TABLE",
  "TR", "UL",
]);

/**
 * Readability's cleaned HTML as plain text, one paragraph per block element.
 *
 * Readability's own `textContent` drops every block boundary, so a whole
 * article arrived as one line (found 2026-10-22: most Readwise-tagged
 * captures since late September were a single 2-14k-character line, which
 * broke line-number citations in the vault pipeline downstream).
 */
export function blockText(html: string): string {
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      parts.push((node.textContent ?? "").replace(/\s+/g, " "));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node as Element).tagName;
    if (tag === "BR") {
      parts.push("\n");
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block) parts.push("\n\n");
    node.childNodes.forEach(walk);
    if (block) parts.push("\n\n");
  };
  walk(doc.body);
  return parts
    .join("")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Full extraction: real Mozilla Readability for main-content cleanup (the
 * actual Firefox Reader View algorithm -- the whole reason this service is
 * TypeScript rather than Python's hand-rolled BeautifulSoup heuristic),
 * plus <meta>-tag metadata the Readability output doesn't carry.
 */
export function extractArticle(html: string, url: string): ExtractedArticle {
  const dom = new JSDOM(html, { url });
  const meta = extractMetaOnly(dom.window.document);

  let content = "";
  try {
    const reader = new Readability(dom.window.document as unknown as Document);
    const parsed = reader.parse();
    content = parsed?.content ? blockText(parsed.content) : "";
    if (!meta.title && parsed?.title) {
      meta.title = parsed.title;
    }
    if (!meta.description && parsed?.excerpt) {
      meta.description = parsed.excerpt;
    }
  } catch {
    // Untrusted third-party HTML -- any Readability failure degrades to meta-only, never throws.
    content = "";
  }

  return { ...meta, content };
}

// Genuinely nothing usable -- a captcha/login/JS-required wall, not a short
// article. Below this even a real title doesn't make the extraction worth
// anything.
const EMPTY_CONTENT_CHARS = 50;

// Matches content-discovery-agent's own THIN_BODY_CHARS bar so both sides
// agree on what "thin" means, rather than silently disagreeing about the
// number that decides whether an item is worth a second, more expensive
// attempt. Below this is more likely navigation chrome than article prose.
export const THIN_CONTENT_CHARS = 1_200;

export type ExtractionQuality = "ok" | "thin" | "empty";

/**
 * The render-fallback trigger: true whenever there isn't enough real content
 * yet, regardless of title. Found live 2026-09-20: the old check required
 * `!article.title` too, and LessWrong, Alignment Forum, and X all serve a
 * real <title> tag even when the article body needs JS to render -- that
 * condition let exactly those pages through as "good enough" at 49-288
 * characters of nav chrome, and the render this service has available never
 * ran for them.
 */
export function isThin(article: ExtractedArticle): boolean {
  return article.content.length < THIN_CONTENT_CHARS;
}

/**
 * Quality tier of the best extraction attempt (plain fetch or, if that was
 * thin, the rendered retry) -- what a caller checks to decide whether to
 * keep, flag, or discard a result. "empty" means essentially nothing was
 * recovered even after a real browser render (a genuine dead end, not just
 * a short article); "thin" means real but likely-incomplete content --
 * still usable, just flagged; "ok" means a normal article body.
 */
export function assessQuality(article: ExtractedArticle): ExtractionQuality {
  if (article.content.length < EMPTY_CONTENT_CHARS) return "empty";
  if (article.content.length < THIN_CONTENT_CHARS) return "thin";
  return "ok";
}

export { EMPTY as EMPTY_ARTICLE };

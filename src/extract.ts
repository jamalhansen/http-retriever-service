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
    content = parsed?.textContent?.trim() ?? "";
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

/** True when neither a meta-tag title nor any real body content was recovered -- the render-fallback trigger. */
export function isThin(article: ExtractedArticle): boolean {
  return !article.title && article.content.length < 40;
}

export { EMPTY as EMPTY_ARTICLE };

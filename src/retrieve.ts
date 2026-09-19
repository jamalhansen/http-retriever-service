import { DEFAULT_BLOCKED_DOMAINS, isBlocked } from "./blocklist.js";
import { extractArticle, isThin, type ExtractedArticle } from "./extract.js";
import { fetchPlain } from "./fetcher.js";
import { fetchRendered } from "./render.js";
import { logFetch } from "./log.js";

export interface RetrieveResult extends ExtractedArticle {
  url: string;
  fetchMethod: "http" | "playwright";
  httpStatus: number | null;
}

export interface Attribution {
  toolName?: string | null;
  sourceUrl?: string | null;
  sourcePlatform?: string | null;
}

export class BlockedDomainError extends Error {
  constructor(hostname: string) {
    super(`domain is blocklisted: ${hostname}`);
  }
}

export class RetrievalError extends Error {}

/**
 * The orchestration this whole service exists for: fetch -> blocklist check
 * -> extract -> if thin, fall back to a real Playwright render -> extract
 * again. Mirrors local_first_common.article_fetcher.fetch_article_metadata's
 * pipeline, generalized to always attempt the render fallback on a thin
 * result rather than requiring a domain to be pre-listed as JS-only.
 *
 * attribution is optional and purely for fetch_log lineage (which tool/post
 * triggered this) -- see local_first_common.tracking's source_url/
 * source_platform, which this mirrors so a caller migrating from direct
 * Python fetch_article_metadata calls keeps the same log attribution.
 */
export async function retrieve(url: string, attribution: Attribution = {}): Promise<RetrieveResult> {
  const started = Date.now();
  const hostname = new URL(url).hostname;

  if (isBlocked(hostname, DEFAULT_BLOCKED_DOMAINS)) {
    await logFetch({
      url,
      method: "blocked",
      httpStatus: null,
      durationMs: Date.now() - started,
      errorMessage: null,
      ...attribution,
    });
    throw new BlockedDomainError(hostname);
  }

  const plain = await fetchPlain(url);
  if (plain.html) {
    const article = extractArticle(plain.html, url);
    if (!isThin(article)) {
      await logFetch({
        url,
        method: "http",
        httpStatus: plain.httpStatus,
        durationMs: Date.now() - started,
        errorMessage: null,
        ...attribution,
      });
      return { ...article, url, fetchMethod: "http", httpStatus: plain.httpStatus };
    }
  }

  const rendered = await fetchRendered(url);
  if (!rendered.html) {
    await logFetch({
      url,
      method: "error",
      httpStatus: plain.httpStatus,
      durationMs: Date.now() - started,
      errorMessage: rendered.errorMessage ?? plain.errorMessage,
      ...attribution,
    });
    throw new RetrievalError(rendered.errorMessage ?? plain.errorMessage ?? "fetch failed with no error detail");
  }

  const renderedArticle = extractArticle(rendered.html, url);
  await logFetch({
    url,
    method: "playwright",
    httpStatus: plain.httpStatus,
    durationMs: Date.now() - started,
    errorMessage: null,
    ...attribution,
  });
  return { ...renderedArticle, url, fetchMethod: "playwright", httpStatus: plain.httpStatus };
}

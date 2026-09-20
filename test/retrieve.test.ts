import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/fetcher.js", () => ({ fetchPlain: vi.fn() }));
vi.mock("../src/render.js", () => ({ fetchRendered: vi.fn() }));
vi.mock("../src/log.js", () => ({ logFetch: vi.fn() }));

import { fetchPlain } from "../src/fetcher.js";
import { fetchRendered } from "../src/render.js";
import { logFetch } from "../src/log.js";
import { BlockedDomainError, retrieve, RetrievalError } from "../src/retrieve.js";

// 100 repeats of "real content word " (18 chars) = 1800 chars, comfortably
// past the 1200-char thin bar -- a genuinely "not thin" fixture.
const REAL_HTML = `<html><head><meta property="og:title" content="Real Title" /></head>
<body><article><p>${"real content word ".repeat(100)}</p></article></body></html>`;

const TITLE_ONLY_HTML = `<html><head><meta property="og:title" content="A Real Title" /></head>
<body><div id="app"></div></body></html>`;

describe("retrieve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws BlockedDomainError for a blocklisted domain without fetching", async () => {
    await expect(retrieve("https://medium.com/some-post")).rejects.toThrow(BlockedDomainError);
    expect(fetchPlain).not.toHaveBeenCalled();
  });

  it("returns the plain-fetch result when it is not thin", async () => {
    vi.mocked(fetchPlain).mockResolvedValue({ html: REAL_HTML, httpStatus: 200, errorMessage: null });

    const result = await retrieve("https://example.com/post");

    expect(result.fetchMethod).toBe("http");
    expect(result.title).toBe("Real Title");
    expect(result.quality).toBe("ok");
    expect(fetchRendered).not.toHaveBeenCalled();
  });

  it("falls back to render even when a real title is present but the body is thin", async () => {
    // Regression 2026-09-20: this exact shape (real <title>, near-empty
    // body) used to skip the render fallback entirely -- LessWrong,
    // Alignment Forum, and X all serve a real title tag even when the
    // article body needs JS to render.
    vi.mocked(fetchPlain).mockResolvedValue({ html: TITLE_ONLY_HTML, httpStatus: 200, errorMessage: null });
    vi.mocked(fetchRendered).mockResolvedValue({ html: REAL_HTML, errorMessage: null });

    const result = await retrieve("https://example.com/title-only");

    expect(fetchRendered).toHaveBeenCalled();
    expect(result.fetchMethod).toBe("playwright");
  });

  it("returns quality 'empty' when even the render comes back with nothing -- a genuine dead end", async () => {
    vi.mocked(fetchPlain).mockResolvedValue({ html: TITLE_ONLY_HTML, httpStatus: 200, errorMessage: null });
    vi.mocked(fetchRendered).mockResolvedValue({ html: TITLE_ONLY_HTML, errorMessage: null });

    const result = await retrieve("https://example.com/login-wall");

    expect(result.fetchMethod).toBe("playwright");
    expect(result.quality).toBe("empty");
  });

  it("falls back to Playwright render when the plain fetch is thin", async () => {
    vi.mocked(fetchPlain).mockResolvedValue({ html: "<html><body></body></html>", httpStatus: 200, errorMessage: null });
    vi.mocked(fetchRendered).mockResolvedValue({ html: REAL_HTML, errorMessage: null });

    const result = await retrieve("https://example.com/js-only");

    expect(result.fetchMethod).toBe("playwright");
    expect(result.title).toBe("Real Title");
  });

  it("falls back to render when the plain fetch fails outright", async () => {
    vi.mocked(fetchPlain).mockResolvedValue({ html: null, httpStatus: 500, errorMessage: "HTTP 500" });
    vi.mocked(fetchRendered).mockResolvedValue({ html: REAL_HTML, errorMessage: null });

    const result = await retrieve("https://example.com/broken");

    expect(result.fetchMethod).toBe("playwright");
  });

  it("throws RetrievalError when both plain fetch and render fail", async () => {
    vi.mocked(fetchPlain).mockResolvedValue({ html: null, httpStatus: null, errorMessage: "timed out" });
    vi.mocked(fetchRendered).mockResolvedValue({ html: null, errorMessage: "render also failed" });

    await expect(retrieve("https://example.com/dead")).rejects.toThrow(RetrievalError);
  });

  it("logs every real attempt, including content length and quality", async () => {
    vi.mocked(fetchPlain).mockResolvedValue({ html: REAL_HTML, httpStatus: 200, errorMessage: null });

    await retrieve("https://example.com/post");

    expect(logFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/post",
        method: "http",
        quality: "ok",
        contentLength: expect.any(Number),
      })
    );
  });

  it("passes attribution through to the log entry", async () => {
    vi.mocked(fetchPlain).mockResolvedValue({ html: REAL_HTML, httpStatus: 200, errorMessage: null });

    await retrieve("https://example.com/post", {
      toolName: "content-discovery-agent",
      sourceUrl: "https://bsky.app/some-post",
      sourcePlatform: "bluesky",
    });

    expect(logFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "content-discovery-agent",
        sourceUrl: "https://bsky.app/some-post",
        sourcePlatform: "bluesky",
      })
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/fetcher.js", () => ({ fetchPlain: vi.fn() }));
vi.mock("../src/render.js", () => ({ fetchRendered: vi.fn() }));
vi.mock("../src/log.js", () => ({ logFetch: vi.fn() }));

import { fetchPlain } from "../src/fetcher.js";
import { fetchRendered } from "../src/render.js";
import { logFetch } from "../src/log.js";
import { BlockedDomainError, retrieve, RetrievalError } from "../src/retrieve.js";

const REAL_HTML = `<html><head><meta property="og:title" content="Real Title" /></head>
<body><article><p>${"real content word ".repeat(20)}</p></article></body></html>`;

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
    expect(fetchRendered).not.toHaveBeenCalled();
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

  it("logs every real attempt", async () => {
    vi.mocked(fetchPlain).mockResolvedValue({ html: REAL_HTML, httpStatus: 200, errorMessage: null });

    await retrieve("https://example.com/post");

    expect(logFetch).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/post", method: "http" })
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

/** Plain HTTP fetch -- Node's built-in fetch, no extra HTTP client dependency needed. */
export interface PlainFetchResult {
  html: string | null;
  httpStatus: number | null;
  errorMessage: string | null;
}

export async function fetchPlain(url: string, timeoutMs = 15_000): Promise<PlainFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; http-retriever-service/0.1; local-first personal tool)",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      return { html: null, httpStatus: response.status, errorMessage: `HTTP ${response.status}` };
    }
    const html = await response.text();
    return { html, httpStatus: response.status, errorMessage: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { html: null, httpStatus: null, errorMessage: message };
  } finally {
    clearTimeout(timeout);
  }
}

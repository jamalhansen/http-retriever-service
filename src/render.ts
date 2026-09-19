import { chromium, type Browser } from "playwright";

let sharedBrowser: Browser | null = null;

/**
 * One warm Chromium instance shared across every request -- the actual
 * resource-duplication win over running Playwright per-tool: each caller no
 * longer pays a fresh browser cold-start.
 */
async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({ headless: true });
  }
  return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

export interface RenderResult {
  html: string | null;
  errorMessage: string | null;
}

export async function fetchRendered(url: string, timeoutMs = 20_000): Promise<RenderResult> {
  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: "Mozilla/5.0 (compatible; http-retriever-service/0.1; local-first personal tool)",
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });
    const html = await page.content();
    return { html, errorMessage: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { html: null, errorMessage: message };
  } finally {
    await context?.close();
  }
}

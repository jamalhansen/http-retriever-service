import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Local JSONL log. scripts/import_fetch_log.py imports this into the shared
 * fetch_log table in processing_log.duckdb every 15 minutes -- not written
 * there directly from Node, since DuckDB rejects a second process holding
 * the file open concurrently (confirmed empirically 2026-09-19).
 */
const LOG_PATH = process.env.HTTP_RETRIEVER_LOG_PATH ?? join(homedir(), "sync", "local-first", "http-retriever.log");

export interface FetchLogEntry {
  url: string;
  method: "http" | "playwright" | "blocked" | "error";
  httpStatus: number | null;
  durationMs: number;
  errorMessage: string | null;
  /** Which tool made this request, for fetch_log attribution -- defaults to this service's own name when absent (e.g. a manual curl test). */
  toolName?: string | null;
  /** The page/post where this URL was found, if the caller knows it (mirrors local_first_common.tracking's source_url). */
  sourceUrl?: string | null;
  /** e.g. 'bluesky', 'mastodon', 'rss' -- mirrors local_first_common.tracking's source_platform. */
  sourcePlatform?: string | null;
}

export async function logFetch(entry: FetchLogEntry): Promise<void> {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
  await mkdir(dirname(LOG_PATH), { recursive: true });
  await appendFile(LOG_PATH, line + "\n");
}

export { LOG_PATH };

import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Local JSONL log, deliberately NOT the shared processing_log.duckdb yet --
 * see tool doc 50's "real costs" section: writing to that file from a
 * second-language process needs verifying DuckDB's multi-process file
 * behavior first, not assuming it. This is the fast-follow once that's
 * checked; for now every fetch is still logged, just to its own file.
 */
const LOG_PATH = process.env.HTTP_RETRIEVER_LOG_PATH ?? join(homedir(), "sync", "local-first", "http-retriever.log");

export interface FetchLogEntry {
  url: string;
  method: "http" | "playwright" | "blocked" | "error";
  httpStatus: number | null;
  durationMs: number;
  errorMessage: string | null;
}

export async function logFetch(entry: FetchLogEntry): Promise<void> {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
  await mkdir(dirname(LOG_PATH), { recursive: true });
  await appendFile(LOG_PATH, line + "\n");
}

export { LOG_PATH };

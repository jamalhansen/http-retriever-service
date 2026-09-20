#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = ["duckdb>=1.5.0"]
# ///
"""Import http-retriever-service's local JSONL log into the shared fetch_log
table in processing_log.duckdb, so it shows up alongside every other tool's
fetch history instead of only in its own file.

Why not write directly from Node: DuckDB allows exactly one process to hold
a database file open for read/write at a time (confirmed empirically
2026-09-19 -- a second connection attempt while one is open raises
IOException: "Could not set lock on file"). Python tools already open brief
connect/write/close cycles against this file throughout the day
(register_tool, timed_run, tracked_fetch), and process-doctor's own
LaunchAgent touches it every 5 minutes. A second, different-language writer
opening its own concurrent connections would collide with that traffic
unpredictably -- an occasional dropped/failed log write, not a loud, obvious
failure. Importing after the fact from one already-safe writer avoids ever
introducing a second one.

Idempotent: tracks how many lines have already been imported in a small
state file so re-running (e.g. from cron, or by hand) never double-inserts.

Usage:
    python3 import_fetch_log.py
    python3 import_fetch_log.py --log-path /path/to/http-retriever.log
"""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlparse

import duckdb

TOOL_NAME = "http-retriever-service"

DEFAULT_LOG_PATH = Path(os.environ.get("HTTP_RETRIEVER_LOG_PATH", "~/sync/local-first/http-retriever.log")).expanduser()
DEFAULT_STATE_PATH = Path("~/sync/local-first/http-retriever-import-state.json").expanduser()
DEFAULT_DB_PATH = Path(os.environ.get("LOCAL_FIRST_TRACKING_DB", "~/sync/local-first/processing_log.duckdb")).expanduser()

_UPSERT_TOOL = "INSERT INTO tools (name) VALUES (?) ON CONFLICT (name) DO NOTHING;"
_SELECT_TOOL_ID = "SELECT id FROM tools WHERE name = ?;"
_INSERT_FETCH = """
INSERT INTO fetch_log
    (tool_id, url, domain, source_url, source_platform,
     success, http_status, error_message, duration_ms, title,
     method, content_length, quality)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
"""


def load_state(state_path: Path) -> int:
    if not state_path.exists():
        return 0
    return json.loads(state_path.read_text()).get("last_imported_line", 0)


def save_state(state_path: Path, last_line: int) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps({"last_imported_line": last_line}))


def parse_entry(line: str) -> dict | None:
    try:
        entry = json.loads(line)
    except json.JSONDecodeError:
        return None
    if entry.get("method") == "blocked":
        # Matches Python's own fetch_article_metadata: a blocklisted domain
        # never enters tracked_fetch at all, so it's never in fetch_log either.
        return None
    return entry


def _resolve_tool_id(conn, name: str) -> int:
    conn.execute(_UPSERT_TOOL, [name])
    return conn.execute(_SELECT_TOOL_ID, [name]).fetchone()[0]


def import_lines(lines: list[str], db_path: Path) -> int:
    entries = [parsed for line in lines if (parsed := parse_entry(line))]
    if not entries:
        return 0

    conn = duckdb.connect(str(db_path))
    try:
        # Deliberately not depending on local_first_common here (see this
        # script's PEP 723 header -- duckdb only) even though it owns
        # fetch_log's real schema; mirrors its migration for the columns
        # this script itself needs to write, same as _INSERT_FETCH above
        # already duplicates the table's column list.
        conn.execute("ALTER TABLE fetch_log ADD COLUMN IF NOT EXISTS method VARCHAR;")
        conn.execute("ALTER TABLE fetch_log ADD COLUMN IF NOT EXISTS content_length INTEGER;")
        conn.execute("ALTER TABLE fetch_log ADD COLUMN IF NOT EXISTS quality VARCHAR;")

        # Cache tool_id per name within this run -- most batches are one
        # caller, but a manual curl test (toolName absent) or a mix of
        # callers should still attribute correctly rather than collapsing
        # onto this service's own name.
        tool_ids: dict[str, int] = {}
        for entry in entries:
            tool_name = entry.get("toolName") or TOOL_NAME
            if tool_name not in tool_ids:
                tool_ids[tool_name] = _resolve_tool_id(conn, tool_name)

            domain = urlparse(entry["url"]).netloc
            conn.execute(
                _INSERT_FETCH,
                [
                    tool_ids[tool_name],
                    entry["url"],
                    domain,
                    entry.get("sourceUrl"),
                    entry.get("sourcePlatform"),
                    entry["method"] != "error",
                    entry.get("httpStatus"),
                    entry.get("errorMessage"),
                    entry.get("durationMs"),
                    None,
                    entry.get("method"),
                    entry.get("contentLength"),
                    entry.get("quality"),
                ],
            )
    finally:
        conn.close()
    return len(entries)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log-path", default=str(DEFAULT_LOG_PATH))
    parser.add_argument("--state-path", default=str(DEFAULT_STATE_PATH))
    parser.add_argument("--db-path", default=str(DEFAULT_DB_PATH))
    args = parser.parse_args()

    log_path = Path(args.log_path).expanduser()
    state_path = Path(args.state_path).expanduser()
    db_path = Path(args.db_path).expanduser()

    if not log_path.exists():
        print(f"No log file at {log_path}; nothing to import.")
        return

    all_lines = log_path.read_text().splitlines()
    already_imported = load_state(state_path)
    new_lines = all_lines[already_imported:]

    if not new_lines:
        print("No new lines to import.")
        return

    count = import_lines(new_lines, db_path)
    save_state(state_path, len(all_lines))
    print(f"Imported {count} fetch_log rows ({len(new_lines)} new lines read).")


if __name__ == "__main__":
    main()

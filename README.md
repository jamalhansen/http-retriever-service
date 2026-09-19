# http-retriever-service

Local HTTP service: fetch a URL, fall back to a real Playwright render when a
plain fetch yields nothing usable, return cleaned article content via Mozilla
Readability (the actual Firefox Reader View algorithm) instead of a
hand-rolled heuristic.

TypeScript rather than Python -- see BrainSync tool doc #50 for the full
reasoning. Short version: Playwright's Python bindings are equally official,
so that alone wasn't the reason. `@mozilla/readability` is the canonical
extraction algorithm and is JS-native; Python only has third-party
reimplementations of it.

## Quickstart

```bash
npm install
npx playwright install chromium   # one-time, ~280MB
npm run dev                        # starts on http://127.0.0.1:8787
```

```bash
curl -X POST http://127.0.0.1:8787/fetch \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/some-article"}'
```

## API

`POST /fetch` -- body `{"url": "..."}`, returns:

```json
{
  "title": "...", "description": "...", "content": "...",
  "author": "...", "publishedDate": "...",
  "url": "...", "fetchMethod": "http" | "playwright", "httpStatus": 200
}
```

- `403` if the domain is blocklisted (see `src/blocklist.ts`)
- `502` if both the plain fetch and the Playwright render fail
- `400` for a missing/invalid `url`

`GET /health` -- `{"status": "ok"}`

## Design

Mirrors `local_first_common.article_fetcher.fetch_article_metadata`'s pipeline:
plain fetch -> blocklist check -> extract (Readability) -> if thin (no title
and little content), fall back to a real Playwright render -> extract again.
One warm Chromium instance is shared across every request (`src/render.ts`)
rather than launching fresh per call -- the actual resource-duplication win
over running Playwright per-tool.

## Operational notes

- Binds to `127.0.0.1` only, no auth -- a deliberate 2026-09-18 decision.
  **If this ever needs to be reachable from another machine, add real auth
  before changing the bind address, not after.**
- Every fetch is logged to `~/sync/local-first/http-retriever.log` (JSONL) --
  not yet the shared `processing_log.duckdb`/`fetch_log` table other
  local-first tools write to. Wiring that in needs verifying DuckDB's
  behavior when a second-language process writes the same file; deferred
  as a fast-follow rather than assumed safe.
- No persistent LaunchAgent yet. Per the artist-agent launchd/Metal
  investigation's methodology: verify with `launchctl kickstart -k` before
  trusting `RunAtLoad` for this, even though a pure network/CPU service
  (no GPU work) likely isn't subject to that specific failure mode.
- [[47-process-doctor]] doesn't care what language a watched process is
  written in -- wiring this service into it once it has a LaunchAgent is a
  small addition, not new design.

## Testing

```bash
npm test        # vitest, 21 tests
npm run lint     # eslint
npm run typecheck
```

Core logic (`blocklist.ts`, `extract.ts`, `retrieve.ts`'s orchestration) is
unit tested with mocked fetch/render. The three real paths (plain fetch,
Playwright fallback, blocklist rejection) were also verified against live
URLs during development, not just mocks -- see BrainSync tool doc #50.

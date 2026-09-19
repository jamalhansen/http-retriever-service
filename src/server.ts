import express, { type Request, type Response } from "express";
import { BlockedDomainError, retrieve, RetrievalError } from "./retrieve.js";
import { closeBrowser } from "./render.js";

const PORT = Number(process.env.HTTP_RETRIEVER_PORT ?? 8787);
// Localhost-only by design (2026-09-18 decision) -- no auth in v1 because
// nothing outside this machine can reach it. Revisit auth before ever
// changing this bind address.
const HOST = "127.0.0.1";

const app = express();
app.use(express.json());

app.post("/fetch", async (req: Request, res: Response) => {
  const { url } = req.body ?? {};
  if (typeof url !== "string" || !url) {
    res.status(400).json({ error: "body must include a non-empty string 'url'" });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ error: `not a valid URL: ${url}` });
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).json({ error: `unsupported scheme: ${parsed.protocol}` });
    return;
  }

  try {
    const result = await retrieve(url);
    res.json(result);
  } catch (err) {
    if (err instanceof BlockedDomainError) {
      res.status(403).json({ error: err.message });
      return;
    }
    if (err instanceof RetrievalError) {
      res.status(502).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`http-retriever-service listening on http://${HOST}:${PORT}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await closeBrowser();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

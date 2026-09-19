import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Shared-secret bearer-token auth, same shape as llm-gateway-service's
 * auth.py -- one operator, one secret, no per-client keys/sessions/OAuth.
 *
 * Optional, unlike the gateway: this service holds no secrets of its own
 * (it just fetches URLs), so auth here is cheap insurance against a
 * forgotten step later, not a response to today's actual threat model.
 * If HTTP_RETRIEVER_API_KEY is unset, every request is allowed -- matching
 * the original 2026-09-18 "no auth needed while localhost-only" decision.
 * Setting it turns enforcement on.
 */
export function verifyToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.HTTP_RETRIEVER_API_KEY;
  if (!expected) {
    next();
    return;
  }

  const header = req.header("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  const matches =
    expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

  if (!matches) {
    res.status(401).json({ error: "missing or invalid Authorization header" });
    return;
  }
  next();
}

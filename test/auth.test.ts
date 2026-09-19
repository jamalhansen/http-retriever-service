import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { verifyToken } from "../src/auth.js";

interface MockRes {
  statusCode: number;
  body: unknown;
  status(code: number): MockRes;
  json(body: unknown): MockRes;
}

function mockReqRes(authHeader?: string) {
  const req = {
    header: (name: string) => (name.toLowerCase() === "authorization" ? authHeader : undefined),
  } as unknown as Request;

  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };

  const next = vi.fn();
  return { req, res: res as unknown as Response & MockRes, next };
}

describe("verifyToken", () => {
  beforeEach(() => {
    delete process.env.HTTP_RETRIEVER_API_KEY;
  });

  it("allows every request when no key is configured", () => {
    const { req, res, next } = mockReqRes();
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
  });

  it("rejects a missing Authorization header when a key is configured", () => {
    process.env.HTTP_RETRIEVER_API_KEY = "secret";
    const { req, res, next } = mockReqRes();
    verifyToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects a wrong token", () => {
    process.env.HTTP_RETRIEVER_API_KEY = "secret";
    const { req, res, next } = mockReqRes("Bearer wrong");
    verifyToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("allows the correct token", () => {
    process.env.HTTP_RETRIEVER_API_KEY = "secret";
    const { req, res, next } = mockReqRes("Bearer secret");
    verifyToken(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

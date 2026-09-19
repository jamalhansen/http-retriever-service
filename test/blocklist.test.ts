import { describe, expect, it } from "vitest";
import { DEFAULT_BLOCKED_DOMAINS, isBlocked } from "../src/blocklist.js";

describe("isBlocked", () => {
  it("matches an exact blocked domain", () => {
    expect(isBlocked("medium.com")).toBe(true);
  });

  it("matches a subdomain of a blocked domain", () => {
    expect(isBlocked("blog.medium.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isBlocked("Medium.COM")).toBe(true);
  });

  it("strips a port before matching", () => {
    expect(isBlocked("medium.com:8080")).toBe(true);
  });

  it("does not match an unrelated domain", () => {
    expect(isBlocked("example.com")).toBe(false);
  });

  it("does not false-positive on a domain that merely contains a blocked one", () => {
    expect(isBlocked("notmedium.com")).toBe(false);
  });

  it("accepts a custom blocklist", () => {
    const custom = new Set(["example.com"]);
    expect(isBlocked("example.com", custom)).toBe(true);
    expect(isBlocked("medium.com", custom)).toBe(false);
  });

  it("default blocklist contains the known entries", () => {
    expect(DEFAULT_BLOCKED_DOMAINS.has("discord.com")).toBe(true);
    expect(DEFAULT_BLOCKED_DOMAINS.has("discord.gg")).toBe(true);
  });
});

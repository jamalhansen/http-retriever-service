/**
 * Domain blocklist, ported from local_first_common.article_fetcher's
 * _DEFAULT_BLOCKED_DOMAINS / _is_blocked (Python). Kept as a plain list, not
 * a shared call, until the LLM gateway / shared-service question is settled
 * for logging too -- see tool doc 50's "real costs" section.
 */
export const DEFAULT_BLOCKED_DOMAINS: ReadonlySet<string> = new Set([
  "medium.com",
  "towardsdatascience.com",
  "betterprogramming.pub",
  "plainenglish.io",
  "levelup.gitconnected.com",
  "discord.com",
  "discord.gg",
]);

/** Exact or subdomain match, case-insensitive, port stripped -- matches the Python semantics exactly. */
export function isBlocked(hostname: string, blockedDomains: ReadonlySet<string> = DEFAULT_BLOCKED_DOMAINS): boolean {
  const host = hostname.toLowerCase().split(":")[0];
  for (const domain of blockedDomains) {
    if (host === domain || host.endsWith(`.${domain}`)) {
      return true;
    }
  }
  return false;
}

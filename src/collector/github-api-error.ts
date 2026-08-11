/**
 * Authentication and rate-limit failures must never be interpreted as an
 * empty activity result: doing so can overwrite a valid archive with zeros.
 */
export const throwOnGitHubAccessError = (response: Response, context: string): void => {
  if (response.status !== 401 && response.status !== 403 && response.status !== 429) return;

  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  const resetAt = reset && Number.isFinite(Number(reset))
    ? new Date(Number(reset) * 1000).toISOString()
    : null;
  const rateLimit = response.status === 429 || remaining === "0"
    ? ` GitHub API rate limit is exhausted${resetAt ? ` until ${resetAt}` : ""}.`
    : " Check that GH_PAT is valid and can access the configured repositories.";

  throw new Error(`${context}: GitHub API returned ${response.status} ${response.statusText}.${rateLimit}`);
};

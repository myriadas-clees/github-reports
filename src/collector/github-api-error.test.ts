import { describe, expect, it } from "vitest";
import { throwOnGitHubAccessError } from "./github-api-error.js";

describe("throwOnGitHubAccessError", () => {
  it.each([401, 403, 429])("throws for blocking GitHub status %i", (status) => {
    const response = new Response("", {
      status,
      statusText: status === 429 ? "Too Many Requests" : "Forbidden",
      headers: status === 403
        ? { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1786467600" }
        : {},
    });

    expect(() => throwOnGitHubAccessError(response, "Collection failed"))
      .toThrow(/Collection failed: GitHub API returned/);
  });

  it("does not throw for an ordinary missing resource", () => {
    expect(() => throwOnGitHubAccessError(
      new Response("", { status: 404, statusText: "Not Found" }),
      "Collection failed",
    )).not.toThrow();
  });
});

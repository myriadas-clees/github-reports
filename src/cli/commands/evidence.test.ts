import { describe, expect, it } from "vitest";
import { evidenceRepositories } from "./evidence.js";

describe("evidenceRepositories", () => {
  it("unions configured and activity repositories in stable order", () => {
    expect(evidenceRepositories(["org/configured", "org/shared"], [
      { repo: "org/activity", number: 1, url: "https://github.com/org/activity/pull/1" },
      { repo: "org/shared", number: 2, url: "https://github.com/org/shared/pull/2" },
      { repo: "org/other", number: 3, url: "https://github.com/org/other/pull/3" },
    ])).toEqual(["org/configured", "org/shared", "org/activity", "org/other"]);
  });

  it("discovers repositories when configuration is empty", () => {
    expect(evidenceRepositories([], [
      { repo: "org/activity", number: 1, url: "https://github.com/org/activity/pull/1" },
    ])).toEqual(["org/activity"]);
  });
});

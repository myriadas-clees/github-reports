import { describe, it, expect } from "vitest";
import {
  enrichRepositoriesWithCommits,
  extractPrNumberFromMessage,
  extractPrNumberFromUrl,
  normalizeActivityTitle,
} from "./index.js";
import type { PullRequest, RepoCommitMessages, RepositoryActivity } from "../types.js";

const repo = (name: string, overrides: Partial<RepositoryActivity> = {}): RepositoryActivity => ({
  name,
  commits: 0,
  prsOpened: 0,
  prsMerged: 0,
  issuesOpened: 0,
  issuesClosed: 0,
  url: `https://github.com/${name}`,
  ...overrides,
});

const pr = (overrides: Partial<PullRequest> & Pick<PullRequest, "title" | "url" | "repository">): PullRequest => ({
  body: null,
  state: "merged",
  labels: [],
  additions: 10,
  deletions: 2,
  changedFiles: 1,
  author: "alice",
  createdAt: "2026-07-28T12:00:00Z",
  mergedAt: "2026-07-29T12:00:00Z",
  ...overrides,
});

describe("PR / commit matching helpers", () => {
  it("extracts PR numbers from URLs and messages", () => {
    expect(extractPrNumberFromUrl("https://github.com/org/repo/pull/64")).toBe(64);
    expect(extractPrNumberFromUrl("https://github.com/org/repo/issues/64")).toBeNull();
    expect(extractPrNumberFromMessage("feat: ship it (#64)")).toBe(64);
    expect(extractPrNumberFromMessage("feat: no ref")).toBeNull();
  });

  it("normalizes titles for fuzzy matching", () => {
    expect(normalizeActivityTitle("fix(pto): move colors (#55) [skip ci]")).toBe(
      "fix(pto): move colors",
    );
  });
});

describe("enrichRepositoriesWithCommits", () => {
  it("nests commits under matching PRs via (#N) and title, leaving unmatched as Direct commits", () => {
    const repositories = [
      repo("org/backend", { commits: 4, prsOpened: 2, prsMerged: 2 }),
    ];
    const pullRequests = [
      pr({
        title: "feat: add OAuth",
        url: "https://github.com/org/backend/pull/10",
        repository: "org/backend",
        additions: 100,
        deletions: 5,
      }),
      pr({
        title: "fix: calendar colors",
        url: "https://github.com/org/backend/pull/11",
        repository: "org/backend",
        additions: 20,
        deletions: 3,
      }),
    ];
    const commitMessages: RepoCommitMessages[] = [
      {
        repo: "org/backend",
        messages: [
          "feat: add OAuth (#10)",
          "fix: calendar colors",
          "chore: bump deps",
          "docs: readme",
        ],
        commits: [
          {
            sha: "aaa",
            message: "feat: add OAuth (#10)",
            url: "https://github.com/org/backend/commit/aaa",
            authoredAt: "2026-07-28T10:00:00Z",
          },
          {
            sha: "bbb",
            message: "fix: calendar colors",
            url: "https://github.com/org/backend/commit/bbb",
            authoredAt: "2026-07-28T11:00:00Z",
          },
          {
            sha: "ccc",
            message: "chore: bump deps",
            url: "https://github.com/org/backend/commit/ccc",
            authoredAt: "2026-07-28T12:00:00Z",
          },
          {
            sha: "ddd",
            message: "docs: readme",
            url: "https://github.com/org/backend/commit/ddd",
            authoredAt: "2026-07-28T13:00:00Z",
          },
        ],
      },
    ];

    const { repositories: enriched, orphanPullRequests } = enrichRepositoriesWithCommits(
      repositories,
      commitMessages,
      pullRequests,
    );

    expect(orphanPullRequests).toEqual([]);
    expect(enriched).toHaveLength(1);
    const view = enriched[0];
    expect(view.expandable).toBe(true);
    expect(view.pullRequests).toHaveLength(2);

    const oauth = view.pullRequests.find((p) => p.number === 10);
    expect(oauth?.commitDetails.map((c) => c.sha)).toEqual(["aaa"]);
    expect(oauth?.additions).toBe(100);

    const colors = view.pullRequests.find((p) => p.number === 11);
    expect(colors?.commitDetails.map((c) => c.sha)).toEqual(["bbb"]);

    expect(view.hasOtherCommits).toBe(true);
    expect(view.otherCommits.commitDetails.map((c) => c.sha)).toEqual(["ccc", "ddd"]);
  });

  it("creates stub repos for commit-only and PR-only repositories", () => {
    const { repositories: enriched } = enrichRepositoriesWithCommits(
      [],
      [
        {
          repo: "org/commits-only",
          messages: ["wip"],
          commits: [
            {
              sha: "1",
              message: "wip",
              url: "https://github.com/org/commits-only/commit/1",
              authoredAt: "2026-07-28T10:00:00Z",
            },
          ],
        },
      ],
      [
        pr({
          title: "feat: orphan repo PR",
          url: "https://github.com/org/prs-only/pull/1",
          repository: "org/prs-only",
        }),
      ],
    );

    expect(enriched.map((r) => r.name).sort()).toEqual([
      "org/commits-only",
      "org/prs-only",
    ]);
    const commitsOnly = enriched.find((r) => r.name === "org/commits-only");
    expect(commitsOnly?.hasOtherCommits).toBe(true);
    expect(commitsOnly?.pullRequests).toEqual([]);

    const prsOnly = enriched.find((r) => r.name === "org/prs-only");
    expect(prsOnly?.pullRequests).toHaveLength(1);
    expect(prsOnly?.pullRequests[0].title).toBe("feat: orphan repo PR");
  });

  it("does not drop message-only commits without detail records", () => {
    const { repositories: enriched } = enrichRepositoriesWithCommits(
      [repo("org/backend", { commits: 2 })],
      [{ repo: "org/backend", messages: ["feat: a (#1)", "direct: no pr"] }],
      [
        pr({
          title: "feat: a",
          url: "https://github.com/org/backend/pull/1",
          repository: "org/backend",
        }),
      ],
    );

    expect(enriched[0].pullRequests[0].commitTexts).toEqual(["feat: a (#1)"]);
    expect(enriched[0].otherCommits.commitTexts).toEqual(["direct: no pr"]);
    expect(enriched[0].hasOtherCommits).toBe(true);
  });
});

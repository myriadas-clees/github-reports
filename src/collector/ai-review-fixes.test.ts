import { describe, it, expect } from "vitest";
import {
  countAiReviewActivity,
  countAiReviewFixes,
  identifyAiReviewer,
  isFixedReply,
  emptyAiReviewActivity,
  emptyAiReviewFixCounts,
  normalizeAiReviewActivity,
  hasAiReviewActivity,
  summarizeAiReviewerDone,
} from "./ai-review-fixes.js";

describe("identifyAiReviewer", () => {
  it("detects Codex logins", () => {
    expect(identifyAiReviewer("chatgpt-codex-connector[bot]")).toBe("codex");
    expect(identifyAiReviewer("Codex-Connector")).toBe("codex");
    expect(identifyAiReviewer("codex[bot]")).toBe("codex");
    expect(identifyAiReviewer("openai-codex")).toBe("codex");
  });

  it("detects Cursor logins", () => {
    expect(identifyAiReviewer("cursor[bot]")).toBe("cursor");
    expect(identifyAiReviewer("cursor")).toBe("cursor");
  });

  it("ignores humans and unrelated bots", () => {
    expect(identifyAiReviewer("myriadas-clees")).toBeNull();
    expect(identifyAiReviewer("dependabot[bot]")).toBeNull();
    expect(identifyAiReviewer("copilot-pull-request-reviewer[bot]")).toBeNull();
  });
});

describe("isFixedReply", () => {
  it("matches Fixed / Fixed in / Addressed prefixes", () => {
    expect(isFixedReply("Fixed in 7d7f4df. Modern form…")).toBe(true);
    expect(isFixedReply("Fixed.")).toBe(true);
    expect(isFixedReply("Addressed. The create API…")).toBe(true);
    expect(isFixedReply("Addressed at the provider boundary.")).toBe(true);
    expect(isFixedReply("  **Fixed in abc**")).toBe(true);
  });

  it("rejects unrelated bodies", () => {
    expect(isFixedReply("Looks good to me")).toBe(false);
    expect(isFixedReply("Not fixed yet")).toBe(false);
    expect(isFixedReply("")).toBe(false);
    expect(isFixedReply(null)).toBe(false);
  });
});

const threads = [
  {
    id: 1,
    inReplyToId: null,
    authorLogin: "chatgpt-codex-connector[bot]",
    body: "P2: clear states",
    createdAt: "2026-07-24T18:00:00Z",
    repository: "org/app",
    prNumber: 43,
  },
  {
    id: 2,
    inReplyToId: 1,
    authorLogin: "alice",
    body: "Fixed in 7d7f4df. Marker added.",
    createdAt: "2026-07-24T18:25:00Z",
    repository: "org/app",
    prNumber: 43,
  },
  {
    id: 3,
    inReplyToId: null,
    authorLogin: "cursor[bot]",
    body: "Suggest rename",
    createdAt: "2026-07-24T19:00:00Z",
    repository: "org/app",
    prNumber: 44,
  },
  {
    id: 4,
    inReplyToId: 3,
    authorLogin: "alice",
    body: "Addressed. Renamed.",
    createdAt: "2026-07-24T19:10:00Z",
    repository: "org/app",
    prNumber: 44,
  },
  {
    id: 5,
    inReplyToId: null,
    authorLogin: "chatgpt-codex-connector[bot]",
    body: "Another suggestion",
    createdAt: "2026-07-24T20:00:00Z",
    repository: "org/app",
    prNumber: 43,
  },
  {
    id: 6,
    inReplyToId: 5,
    authorLogin: "alice",
    body: "Will look later",
    createdAt: "2026-07-24T20:05:00Z",
    repository: "org/app",
    prNumber: 43,
  },
  {
    id: 7,
    inReplyToId: null,
    authorLogin: "bob",
    body: "Human review note",
    createdAt: "2026-07-24T21:00:00Z",
    repository: "org/app",
    prNumber: 45,
  },
  {
    id: 8,
    inReplyToId: 7,
    authorLogin: "alice",
    body: "Fixed in abc",
    createdAt: "2026-07-24T21:05:00Z",
    repository: "org/app",
    prNumber: 45,
  },
];

describe("countAiReviewActivity", () => {
  it("counts comments, PRs, and fixed separately", () => {
    const activity = countAiReviewActivity(threads, [], { username: "alice" });
    expect(activity.codex).toEqual({
      prsReviewed: 1,
      comments: 2,
      reviews: 0,
      fixed: 1,
    });
    expect(activity.cursor).toEqual({
      prsReviewed: 1,
      comments: 1,
      reviews: 0,
      fixed: 1,
    });
    expect(activity.comments).toBe(3);
    expect(activity.prsReviewed).toBe(2);
    expect(activity.fixed).toBe(2);
  });

  it("includes AI review submissions in PRs reviewed", () => {
    const activity = countAiReviewActivity(
      [],
      [
        {
          authorLogin: "chatgpt-codex-connector[bot]",
          submittedAt: "2026-07-24T18:00:00Z",
          repository: "org/app",
          prNumber: 50,
          state: "COMMENTED",
        },
        {
          authorLogin: "chatgpt-codex-connector[bot]",
          submittedAt: "2026-07-24T18:05:00Z",
          repository: "org/app",
          prNumber: 50,
          state: "COMMENTED",
        },
        {
          authorLogin: "alice",
          submittedAt: "2026-07-24T18:10:00Z",
          repository: "org/app",
          prNumber: 51,
          state: "APPROVED",
        },
      ],
    );
    expect(activity.codex.reviews).toBe(2);
    expect(activity.codex.prsReviewed).toBe(1);
    expect(activity.codex.comments).toBe(0);
  });

  it("respects inRange on comments, reviews, and fix replies", () => {
    const activity = countAiReviewActivity(
      threads,
      [
        {
          authorLogin: "chatgpt-codex-connector[bot]",
          submittedAt: "2026-07-24T19:30:00Z",
          repository: "org/app",
          prNumber: 99,
          state: "COMMENTED",
        },
      ],
      {
        username: "alice",
        inRange: (iso) => iso.startsWith("2026-07-24T19"),
      },
    );
    expect(activity.cursor.comments).toBe(1);
    expect(activity.cursor.fixed).toBe(1);
    expect(activity.codex.comments).toBe(0);
    expect(activity.codex.fixed).toBe(0);
    expect(activity.codex.reviews).toBe(1);
    expect(activity.codex.prsReviewed).toBe(1);
  });
});

describe("countAiReviewFixes", () => {
  it("counts Codex and Cursor fixed threads once each", () => {
    expect(countAiReviewFixes(threads, { username: "alice" })).toEqual({
      codex: 1,
      cursor: 1,
      total: 2,
    });
  });

  it("dedupes multiple Fixed replies on the same parent", () => {
    const withDup = [
      ...threads,
      {
        id: 9,
        inReplyToId: 1,
        authorLogin: "alice",
        body: "Fixed again for clarity",
        createdAt: "2026-07-24T18:40:00Z",
      },
    ];
    expect(countAiReviewFixes(withDup, { username: "alice" }).codex).toBe(1);
  });

  it("returns zeros for empty input", () => {
    expect(countAiReviewFixes([])).toEqual(emptyAiReviewFixCounts());
    expect(countAiReviewActivity([])).toEqual(emptyAiReviewActivity());
  });
});

describe("normalizeAiReviewActivity", () => {
  it("prefers aiReviews shape", () => {
    const activity = normalizeAiReviewActivity({
      codex: { prsReviewed: 8, comments: 20, reviews: 5, fixed: 4 },
      cursor: { prsReviewed: 0, comments: 0, reviews: 0, fixed: 0 },
      prsReviewed: 0,
      comments: 0,
      reviews: 0,
      fixed: 0,
    });
    expect(activity.codex.comments).toBe(20);
    expect(activity.comments).toBe(20);
    expect(activity.fixed).toBe(4);
    expect(hasAiReviewActivity(activity)).toBe(true);
  });

  it("falls back to legacy aiReviewFixes as done comments", () => {
    const activity = normalizeAiReviewActivity(null, {
      codex: 4,
      cursor: 0,
      total: 4,
    });
    expect(activity.codex.comments).toBe(4);
    expect(activity.codex.fixed).toBe(4);
    expect(activity.comments).toBe(4);
    expect(activity.fixed).toBe(4);
  });

  it("promotes incomplete fixed-only aiReviews to comments", () => {
    const activity = normalizeAiReviewActivity({
      codex: { prsReviewed: 0, comments: 0, reviews: 0, fixed: 4 },
      cursor: { prsReviewed: 0, comments: 0, reviews: 0, fixed: 0 },
      prsReviewed: 0,
      comments: 0,
      reviews: 0,
      fixed: 4,
    });
    expect(activity.codex.comments).toBe(4);
    expect(activity.codex.fixed).toBe(4);
    expect(activity.comments).toBe(4);
  });
});

describe("summarizeAiReviewerDone", () => {
  it("leads with reviews done and omits fixed", () => {
    expect(
      summarizeAiReviewerDone({
        prsReviewed: 8,
        comments: 20,
        reviews: 5,
        fixed: 4,
      }),
    ).toBe("5 reviews · 20 comments · 8 PRs");
  });

  it("falls back to comments · PRs when no review submissions", () => {
    expect(
      summarizeAiReviewerDone({
        prsReviewed: 2,
        comments: 4,
        reviews: 0,
        fixed: 4,
      }),
    ).toBe("4 comments · 2 PRs");
  });
});

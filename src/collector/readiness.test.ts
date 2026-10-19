import { describe, expect, it } from "vitest";
import {
  annotateAllocation,
  deriveComplexity,
  derivePrChecks,
  deriveReadiness,
  summarizeVerification,
} from "./readiness.js";
import type { Allocation, AllocationItem, EvidenceLedger, PrEvidence } from "../types.js";

const URL = "https://github.com/org/app/pull/1";
const pr = (over: Partial<PrEvidence> = {}): PrEvidence => ({
  url: URL, repository: "org/app", number: 1, author: "me", state: "merged", isDraft: false,
  baseRef: "main", headRef: "feat/x", headSha: "aaa", mergeCommitSha: "mmm",
  createdAt: "2026-10-05T00:00:00Z", mergedAt: "2026-10-07T12:00:00Z",
  reviews: [], checks: null, files: [], fetchedAt: "2026-10-08T00:00:00Z", ...over,
});
const ledger = (p: Partial<PrEvidence> = {}, deployments: EvidenceLedger["deployments"] = {}): EvidenceLedger => ({
  version: "1", updatedAt: "2026-10-09T00:00:00Z",
  defaultBranches: { "org/app": "main" },
  deployments,
  prs: { [URL]: pr(p) },
});
const dep = (over: Partial<EvidenceLedger["deployments"][string][number]>) => ({
  environment: "production", production: true, ref: "main", sha: "zzz",
  createdAt: "2026-10-08T09:00:00Z", succeededAt: "2026-10-08T10:00:00Z", ...over,
});
const item = (over: Partial<AllocationItem> = {}) => ({
  state: "merged" as const, title: "Add thing", url: URL, repository: "org/app", ...over,
});

describe("deriveReadiness", () => {
  it("open draft / prototype / in review", () => {
    expect(deriveReadiness(item({ state: "open" }), ledger({ isDraft: true }))?.stage).toBe("draft");
    expect(deriveReadiness(item({ state: "open", title: "WIP: thing" }), null)?.stage).toBe("prototype");
    expect(deriveReadiness(item({ state: "open", title: "Spike on caching" }), null)?.stage).toBe("prototype");
    expect(deriveReadiness(item({ state: "open" }), null)).toMatchObject({ stage: "in-review", label: "In review" });
  });

  it("returns undefined for closed items", () => {
    expect(deriveReadiness(item({ state: "closed" }), null)).toBeUndefined();
  });

  it("label override wins, case-insensitively", () => {
    expect(deriveReadiness(item({ state: "open", labels: ["Stage: Prototype"] }), null)?.stage).toBe("prototype");
    expect(deriveReadiness(item({ labels: ["readiness:pilot"] }), null)).toMatchObject({ stage: "preview", label: "Pilot" });
    expect(deriveReadiness(item({ labels: ["stage:beta"] }), null)?.stage).toBe("preview");
    expect(deriveReadiness(item({ labels: ["readiness:production"] }), null)?.stage).toBe("live");
    expect(deriveReadiness(item({ labels: ["stage:live"] }), ledger())?.stage).toBe("live");
  });

  it("merged without evidence: done, no claim about live", () => {
    expect(deriveReadiness(item(), null)).toEqual({ stage: "done", label: "Done", detail: "Merged" });
  });

  it("live uses the earliest production deployment after merge", () => {
    const l = ledger({}, {
      "org/app": [
        dep({ succeededAt: "2026-10-10T10:00:00Z" }),
        dep({ succeededAt: "2026-10-08T10:00:00Z" }),
        dep({ succeededAt: "2026-10-06T10:00:00Z" }),
      ],
    });
    expect(deriveReadiness(item(), l)).toMatchObject({ stage: "live", label: "Live", detail: "Live since Oct 8", since: "2026-10-08" });
  });

  it("live via merge commit sha even if timestamps are odd", () => {
    const l = ledger({}, { "org/app": [dep({ sha: "mmm", succeededAt: "2026-10-07T11:00:00Z" })] });
    expect(deriveReadiness(item(), l)?.stage).toBe("live");
  });

  it("live when production deployment ref is the merge commit sha", () => {
    const l = ledger({}, { "org/app": [dep({ ref: "mmm", sha: "zzz", succeededAt: "2026-10-08T10:00:00Z" })] });
    expect(deriveReadiness(item(), l)).toMatchObject({
      stage: "live", label: "Live", detail: "Live since Oct 8", since: "2026-10-08",
    });
  });

  it("preview only", () => {
    const l = ledger({}, {
      "org/app": [
        dep({ production: false, environment: "preview", succeededAt: "2026-10-09T10:00:00Z" }),
        dep({ succeededAt: "2026-10-01T10:00:00Z" }),
      ],
    });
    expect(deriveReadiness(item(), l)).toMatchObject({
      stage: "preview", label: "In testing", detail: "On the preview site since Oct 9",
    });
  });

  it("preview deployment ref may be the merge commit sha", () => {
    const l = ledger({}, { "org/app": [dep({ production: false, environment: "preview", ref: "mmm", sha: "zzz", succeededAt: "2026-10-09T10:00:00Z" })] });
    expect(deriveReadiness(item(), l)).toMatchObject({
      stage: "preview", label: "In testing", detail: "On the preview site since Oct 9", since: "2026-10-09",
    });
  });

  it("awaiting release when repo deploys but not since merge", () => {
    const l = ledger({}, { "org/app": [dep({ succeededAt: "2026-10-01T10:00:00Z" })] });
    expect(deriveReadiness(item(), l)).toMatchObject({
      stage: "awaiting-release", label: "Done · not live yet", detail: "Merged Oct 7; not deployed to production yet",
    });
  });

  it("done when the repo has no deployments", () => {
    expect(deriveReadiness(item(), ledger())).toMatchObject({
      stage: "done", label: "Done", detail: "Merged Oct 7; release not tracked for this repo",
    });
  });

  it("stacked on a non-default base that is not deployed", () => {
    const l = ledger({ baseRef: "feat/parent" }, { "org/app": [dep({})] });
    expect(deriveReadiness(item(), l)).toMatchObject({
      stage: "awaiting-release",
      detail: "Merged into a larger change (feat/parent) that isn't live yet",
    });
  });

  it("stacked base that is deployed counts via its own ref", () => {
    const l = ledger({ baseRef: "release/1" }, { "org/app": [dep({ ref: "release/1" })] });
    expect(deriveReadiness(item(), l)?.stage).toBe("live");
  });

  it("PR missing from the ledger is done, not live", () => {
    const l = ledger();
    l.prs = {};
    expect(deriveReadiness(item(), l)?.stage).toBe("done");
  });
});

describe("deriveComplexity", () => {
  it("undefined without files", () => {
    expect(deriveComplexity([])).toBeUndefined();
    expect(deriveComplexity(["bun.lock", "dist/x.js"])).toBeUndefined();
  });

  it("contained within one area; lockfiles ignored", () => {
    expect(deriveComplexity(["apps/hub/a.ts", "apps/hub/b.ts", "bun.lock", "yarn.lock", "x/y.snap"])).toMatchObject({
      level: "contained", label: "Contained", reason: "Touches 1 area: hub", risks: [],
    });
  });

  it("connected and cross-system, with truncated reason", () => {
    expect(deriveComplexity(["apps/hub/a.ts", "packages/shared-ui/b.ts", "services/api/c.ts"])).toMatchObject({
      level: "connected", reason: "Touches 3 areas: api, hub, shared-ui (shared)",
    });
    const c = deriveComplexity(["apps/a/1", "apps/b/1", "apps/c/1", "apps/d/1", "apps/e/1", "docs/x.md", "README.md"]);
    expect(c?.level).toBe("cross-system");
    expect(c?.reason).toBe("Touches 5 areas: a, b, c, d +1 more");
  });

  it("tests, docs, CI and root files don't widen the areas", () => {
    expect(deriveComplexity(["package.json", "docs/a.md", ".github/workflows/ci.yml", "scripts/x.ts"])).toMatchObject({
      level: "contained", reason: "Docs, tests or tooling only",
    });
    expect(deriveComplexity(["hub/lib/a.ts", "hub/lib/a.test.ts", "transition/src/x.test.ts", "README.md"])).toMatchObject({
      level: "contained", reason: "Touches 1 area: hub",
    });
  });

  it("areas are ordered by how much of the change they hold", () => {
    expect(deriveComplexity(["transition/a.ts", "transition/b.ts", "hub/c.ts"])?.reason).toBe("Touches 2 areas: transition, hub");
  });

  it("one incidental risky file doesn't tag a large change", () => {
    const files = ["hub/app/login/page.tsx", ...Array.from({ length: 9 }, (_, i) => `hub/components/C${i}.tsx`), ".github/workflows/deploy.yml"];
    expect(deriveComplexity(files)?.risks).toEqual([]);
    expect(deriveComplexity(["hub/functions/src/roles.ts", "hub/functions/src/index.ts"])?.risks).toEqual(["Sign-in & permissions"]);
  });

  it("systems map uses longest prefix", () => {
    const systems = { "apps/hub": "Hub app", "apps/hub/admin": "Admin" };
    const c = deriveComplexity(["apps/hub/x.ts", "apps/hub/admin/y.ts", "apps/hubble/z.ts"], systems);
    expect(c?.reason).toBe("Touches 3 areas: Admin, Hub app, hubble");
  });

  it("detects risks in order", () => {
    const c = deriveComplexity([".github/workflows/ci.yml", "src/billing/x.ts", "db/migrations/1.sql", "src/auth/login.ts"]);
    expect(c?.risks).toEqual(["Sign-in & permissions", "Payments", "Data changes", "Infrastructure"]);
  });
});

describe("derivePrChecks", () => {
  it("handles missing evidence", () => {
    expect(derivePrChecks({ url: URL }, null, ["a.test.ts"])).toEqual({
      automated: null, humanReviews: 0, automatedReviews: 0, testsUpdated: true,
    });
  });

  it("counts unique reviewers and checks", () => {
    const l = ledger({
      checks: { passed: 3, failed: 1, skipped: 2, pending: 0, names: ["a"] },
      reviews: [
        { reviewer: "bob", bot: false, state: "APPROVED", submittedAt: "" },
        { reviewer: "bob", bot: false, state: "COMMENTED", submittedAt: "" },
        { reviewer: "codex", bot: true, state: "COMMENTED", submittedAt: "" },
      ],
    });
    expect(derivePrChecks({ url: URL }, l, ["src/a.ts"])).toEqual({
      automated: { passed: 3, failed: 1, pending: 0, total: 4 }, humanReviews: 1, automatedReviews: 1, testsUpdated: false,
    });
  });

  it("keeps pending checks separate from passing checks", () => {
    const l = ledger({ checks: { passed: 3, failed: 0, skipped: 0, pending: 1, names: [] } });
    expect(derivePrChecks({ url: URL }, l, []).automated).toEqual({ passed: 3, failed: 0, pending: 1, total: 4 });
  });
});

const alloc = (shipped: AllocationItem[], inProgress: AllocationItem[] = []): Allocation => ({
  version: "1", totalHours: 10, manualHours: 0, workTypes: [], note: "", aiFindingsAddressed: 4,
  initiatives: [{ initiative: "Hub", hours: 10, share: 1, byWorkType: {}, shipped, inProgress, other: [] }],
});

describe("annotateAllocation + summarizeVerification", () => {
  it("annotates a copy without mutating input and tolerates null evidence", () => {
    const a = alloc([{ kind: "pr", title: "x", url: URL, repository: "org/app", state: "merged", files: ["apps/hub/a.test.ts"] }]);
    const out = annotateAllocation(a, null);
    expect(a.initiatives[0]!.shipped[0]!.readiness).toBeUndefined();
    const it0 = out.initiatives[0]!.shipped[0]!;
    expect(it0.readiness?.stage).toBe("done");
    expect(it0.complexity?.level).toBe("contained");
    expect(it0.checks).toMatchObject({ automated: null, testsUpdated: true });
  });

  it("prefers evidence files", () => {
    const l = ledger({ files: ["apps/a/x.ts", "apps/b/y.ts"] });
    const out = annotateAllocation(alloc([{ kind: "pr", title: "x", url: URL, repository: "org/app", state: "merged", files: ["apps/z/q.ts"] }]), l);
    expect(out.initiatives[0]!.shipped[0]!.complexity?.level).toBe("connected");
  });

  it("summarizes unique PRs", () => {
    const l = ledger({
      checks: { passed: 2, failed: 0, skipped: 0, pending: 0, names: [] },
      reviews: [{ reviewer: "codex", bot: true, state: "COMMENTED", submittedAt: "" }],
    }, { "org/app": [dep({})] });
    const open: AllocationItem = { kind: "pr", title: "WIP x", url: "https://github.com/org/app/pull/2", repository: "org/app", state: "open" };
    const merged: AllocationItem = { kind: "pr", title: "x", url: URL, repository: "org/app", state: "merged", files: ["a.test.ts"] };
    const out = annotateAllocation(alloc([merged, { ...merged }], [open]), l);
    expect(summarizeVerification(out)).toEqual({
      completed: 1, live: 1, awaitingRelease: 0, preview: 0, inReview: 0, drafts: 1,
      withPassingChecks: 1, withPendingChecks: 0, checksCollected: 1, withAutomatedReview: 1, withHumanReview: 0, withTests: 1,
      aiFindingsAddressed: 4,
    });
  });

  it("keeps readiness summary categories mutually exclusive", () => {
    const prototype: AllocationItem = { kind: "pr", title: "prototype", url: URL, repository: "org/app", state: "merged", labels: ["stage: prototype"] };
    const live: AllocationItem = { kind: "pr", title: "live", url: "https://github.com/org/app/pull/2", repository: "org/app", state: "merged", labels: ["readiness: production"] };
    const review: AllocationItem = { kind: "pr", title: "review", url: "https://github.com/org/app/pull/3", repository: "org/app", state: "open", readiness: { stage: "in-review", label: "In review", detail: "Review" } };
    const summary = summarizeVerification(annotateAllocation(alloc([prototype, live], [review]), null));
    expect(summary).toMatchObject({ completed: 1, drafts: 1, live: 1, inReview: 1 });
    expect(summary.completed + summary.inReview + summary.drafts).toBe(3);
  });

  it("counts pending and failed checks as not passing", () => {
    const pending = ledger({ checks: { passed: 3, failed: 0, skipped: 0, pending: 1, names: [] } });
    const failed = ledger({ checks: { passed: 2, failed: 1, skipped: 0, pending: 0, names: [] } });
    const items = [pending, failed].map((l) => annotateAllocation(
      alloc([{ kind: "pr", title: "checks", url: URL, repository: "org/app", state: "open" }]), l,
    ));
    expect(items.map((a) => summarizeVerification(a))).toMatchObject([
      { withPassingChecks: 0, withPendingChecks: 1, checksCollected: 1 },
      { withPassingChecks: 0, withPendingChecks: 0, checksCollected: 1 },
    ]);
  });
});

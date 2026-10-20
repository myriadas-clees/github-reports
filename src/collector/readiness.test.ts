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

  it("formats merge and deployment dates in the requested timezone", () => {
    const merged = ledger({ mergedAt: "2026-10-08T01:00:00Z" });
    merged.deploymentsUnavailable = { "org/app": "2026-10-19T00:00:00Z" };
    expect(deriveReadiness(item(), merged, "America/New_York")).toMatchObject({ detail: "Merged Oct 7; release status not collected", since: "2026-10-07" });
    const live = ledger({}, { "org/app": [dep({ succeededAt: "2026-10-08T02:00:00Z" })] });
    expect(deriveReadiness(item(), live, "America/New_York")).toMatchObject({ detail: "Live since Oct 7", since: "2026-10-07" });
    expect(deriveReadiness(item(), live)).toMatchObject({ detail: "Live since Oct 8", since: "2026-10-08" });
  });

  it("live uses the earliest production deployment after merge", () => {
    const l = ledger({}, {
      "org/app": [
        dep({ createdAt: "2026-10-10T09:00:00Z", succeededAt: "2026-10-10T10:00:00Z" }),
        dep({ createdAt: "2026-10-08T09:00:00Z", succeededAt: "2026-10-08T10:00:00Z" }),
        dep({ createdAt: "2026-10-06T09:00:00Z", succeededAt: "2026-10-06T10:00:00Z" }),
      ],
    });
    expect(deriveReadiness(item(), l)).toMatchObject({ stage: "live", label: "Live", detail: "Live since Oct 8", since: "2026-10-08" });
  });

  it("uses stored live release history after its deployment has been evicted", () => {
    const l = ledger({ release: { stage: "live", environment: "production", sha: "old", since: "2026-09-01T10:00:00Z" } });
    expect(deriveReadiness(item(), l)).toMatchObject({ stage: "live", label: "Live", detail: "Live since Sep 1", since: "2026-09-01" });
  });

  it("keeps a stored preview when no live deployment remains", () => {
    const l = ledger({ release: { stage: "preview", environment: "preview", sha: "old", since: "2026-09-01T10:00:00Z" } });
    expect(deriveReadiness(item(), l)).toMatchObject({ stage: "preview", detail: "On the preview site since Sep 1", since: "2026-09-01" });
  });

  it("does not treat an overlapping deployment as live, but uses success time for live since", () => {
    const overlapping = ledger({}, { "org/app": [dep({
      createdAt: "2026-10-07T11:59:00Z", succeededAt: "2026-10-07T12:10:00Z",
    })] });
    expect(deriveReadiness(item(), overlapping)?.stage).toBe("awaiting-release");
    const afterMerge = ledger({}, { "org/app": [dep({
      createdAt: "2026-10-07T12:01:00Z", succeededAt: "2026-10-08T10:00:00Z",
    })] });
    expect(deriveReadiness(item(), afterMerge)).toMatchObject({ stage: "live", detail: "Live since Oct 8", since: "2026-10-08" });
  });

  it("live via merge commit sha even if timestamps are odd", () => {
    const l = ledger({}, { "org/app": [dep({ createdAt: "2026-10-07T11:00:00Z", sha: "mmm", succeededAt: "2026-10-07T11:00:00Z" })] });
    expect(deriveReadiness(item(), l)?.stage).toBe("live");
  });

  it("uses verified SHA deployment containment for live readiness", () => {
    const deployment = dep({ ref: "a1b2c3d", sha: "a1b2c3d", createdAt: "2026-10-08T09:00:00Z", succeededAt: "2026-10-09T10:00:00Z" });
    const matched = ledger({ containingDeployments: [{ environment: "production", sha: "a1b2c3d" }] }, { "org/app": [deployment] });
    expect(deriveReadiness(item(), matched)).toMatchObject({ stage: "live", detail: "Live since Oct 9", since: "2026-10-09" });
    const unmatched = ledger({}, { "org/app": [deployment] });
    expect(deriveReadiness(item(), unmatched)?.stage).toBe("awaiting-release");
  });

  it("containing deployment releases a stacked PR and unavailable deployment data stays unknown", () => {
    const stacked = pr({ baseRef: "feature/x", containingDeployments: [{ environment: "production", sha: "abc1234" }] });
    const shaDeploy = dep({ ref: "abc1234", sha: "abc1234" });
    expect(deriveReadiness(item(), ledger(stacked, { "org/app": [shaDeploy] }))?.stage).toBe("live");
    expect(deriveReadiness(item(), ledger({ baseRef: "feature/x" }, { "org/app": [shaDeploy] }) as EvidenceLedger)?.stage).toBe("awaiting-release");
    const unavailable = ledger({}, {});
    unavailable.deploymentsUnavailable = { "org/app": "2026-10-19T00:00:00Z" };
    expect(deriveReadiness(item(), unavailable)).toMatchObject({ stage: "done", label: "Done", detail: "Merged Oct 7; release status not collected" });
  });

  it("treats unknown ancestry as uncollected unless a branch deployment is known live", () => {
    expect(deriveReadiness(item(), ledger({ ancestryUnknown: true }))).toMatchObject({
      stage: "done", detail: "Merged Oct 7; release status not collected",
    });
    const branchDeployment = dep({ ref: "main", createdAt: "2026-10-08T09:00:00Z", succeededAt: "2026-10-08T10:00:00Z" });
    expect(deriveReadiness(item(), ledger({ ancestryUnknown: true }, { "org/app": [branchDeployment] }))).toMatchObject({ stage: "live" });
  });

  it("keeps production uncertainty visible alongside a preview match", () => {
    const preview = dep({ environment: "preview", production: false, ref: "feature/x", sha: "preview-sha", succeededAt: "2026-10-08T10:00:00Z" });
    const l = ledger({ ancestryUnknown: { production: true }, containingDeployments: [{ environment: "preview", sha: "preview-sha" }] }, { "org/app": [preview] });
    expect(deriveReadiness(item(), l)).toMatchObject({ stage: "preview", detail: "On the preview site since Oct 8; production release status not collected" });
  });

  it("keeps production uncertainty visible for stored previews when deployments are unavailable", () => {
    const l = ledger({ release: { stage: "preview", environment: "preview", sha: "old", since: "2026-10-08T10:00:00Z" } });
    l.deploymentsUnavailable = { "org/app": "2026-10-19T00:00:00Z" };
    expect(deriveReadiness(item(), l)).toMatchObject({ stage: "preview", detail: "On the preview site since Oct 8; production release status not collected" });
  });

  it("still uses known deployments when the latest deployment refresh failed", () => {
    // Previously collected main deployment after the merge, with no baseRef recorded.
    const known = ledger({ baseRef: "" }, { "org/app": [dep({})] });
    known.deploymentsUnavailable = { "org/app": "2026-10-19T00:00:00Z" };
    expect(deriveReadiness(item(), known)).toMatchObject({ stage: "live", since: "2026-10-08" });
    // Unknown, not "merged into a larger change", for a stacked PR when deployments couldn't be read.
    const stacked = ledger({ baseRef: "feature/x" }, {});
    stacked.deploymentsUnavailable = { "org/app": "2026-10-19T00:00:00Z" };
    expect(deriveReadiness(item(), stacked)).toMatchObject({ stage: "done", detail: "Merged Oct 7; release status not collected" });
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
        dep({ production: false, environment: "preview", createdAt: "2026-10-09T09:00:00Z", succeededAt: "2026-10-09T10:00:00Z" }),
        dep({ createdAt: "2026-10-01T09:00:00Z", succeededAt: "2026-10-01T10:00:00Z" }),
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
    const l = ledger({}, { "org/app": [dep({ createdAt: "2026-10-01T09:00:00Z", succeededAt: "2026-10-01T10:00:00Z" })] });
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

  it("counts root source files as project code while keeping root support files out", () => {
    expect(deriveComplexity(["main.go"])).toMatchObject({
      level: "contained", reason: "Touches 1 area: project root", risks: [],
    });
    expect(deriveComplexity(["package.json", "tsconfig.json"])).toMatchObject({
      level: "contained", reason: "Docs, tests or tooling only",
    });
    expect(deriveComplexity(["app.py", "src/billing/x.py"])?.reason).toBe("Touches 2 areas: billing, project root");
    expect(deriveComplexity(["auth.ts"])?.risks).toEqual(["Sign-in & permissions"]);
    expect(deriveComplexity(["main.test.ts"])?.reason).toBe("Docs, tests or tooling only");
    expect(deriveComplexity(["index.html", "styles.css"])).toMatchObject({
      level: "contained", reason: "Touches 1 area: project root",
    });
    expect(deriveComplexity(["main.scss"])?.reason).toBe("Touches 1 area: project root");
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

describe("deriveComplexity root-level metadata", () => {
  it("does not count root dotfiles or JSON metadata as code", () => {
    expect(deriveComplexity([".prettierignore", ".env.example", "renovate.json", "vite.config.ts"])).toMatchObject({
      level: "contained", reason: "Docs, tests or tooling only",
    });
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

  it("marks check-run evidence partial when commit statuses were unavailable", () => {
    const l = ledger({ checks: { passed: 1, failed: 0, skipped: 0, pending: 0, names: ["ci"], statusesUnavailable: true } });
    expect(derivePrChecks({ url: URL }, l, []).automated).toEqual({ passed: 1, failed: 0, pending: 0, total: 1, partial: true });
  });

  it("marks check evidence partial when check runs were unavailable", () => {
    const l = ledger({ checks: { passed: 1, failed: 0, skipped: 0, pending: 0, names: ["ci"], checkRunsUnavailable: true } });
    expect(derivePrChecks({ url: URL }, l, []).automated).toEqual({ passed: 1, failed: 0, pending: 0, total: 1, partial: true });
  });
  it("marks passing checks partial after a failed PR refresh", () => {
    const l = ledger({ checks: { passed: 1, failed: 0, skipped: 0, pending: 0, names: ["ci"] }, refreshFailedAt: "2026-10-19T00:00:00Z" });
    expect(derivePrChecks({ url: URL }, l, []).automated).toMatchObject({ partial: true });
  });
});

const alloc = (shipped: AllocationItem[], inProgress: AllocationItem[] = []): Allocation => ({
  version: "1", totalHours: 10, manualHours: 0, workTypes: [], note: "", aiFindingsAddressed: 4,
  initiatives: [{ initiative: "Hub", hours: 10, share: 1, byWorkType: {}, shipped, inProgress, other: [] }],
});

describe("annotateAllocation + summarizeVerification", () => {
  it("annotates closed PRs in other without adding them to verification summaries", () => {
    const closedUrl = "https://github.com/org/app/pull/8";
    const closedEvidence = pr({
      url: closedUrl,
      state: "closed",
      mergedAt: null,
      files: ["apps/hub/a.ts", "services/api/b.ts"],
      checks: { passed: 2, failed: 1, skipped: 0, pending: 1, names: ["lint", "tests"] },
    });
    const evidence = ledger();
    evidence.prs![closedUrl] = closedEvidence;
    const closed: AllocationItem = {
      kind: "pr", title: "Closed without merge", url: closedUrl, repository: "org/app",
      state: "closed", files: ["apps/fallback/file.ts"],
    };
    const allocation = alloc([]);
    allocation.initiatives[0]!.other.push(closed);

    const annotated = annotateAllocation(allocation, evidence);
    const annotatedClosed = annotated.initiatives[0]!.other[0]!;
    expect(annotatedClosed.complexity).toMatchObject({ level: "connected" });
    expect(annotatedClosed.checks).toEqual({
      automated: { passed: 2, failed: 1, pending: 1, total: 4 },
      humanReviews: 0, automatedReviews: 0, testsUpdated: false,
    });
    expect((annotatedClosed as typeof annotatedClosed & { checkNames?: string[] }).checkNames).toEqual(["lint", "tests"]);
    expect(annotatedClosed.readiness).toBeUndefined();
    expect(summarizeVerification(annotated)).toMatchObject({
      completed: 0, inReview: 0, checksCollected: 0, checksUnknown: 0, withoutChecks: 0,
    });
  });

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

  it.each([{ incomplete: { files: true } }, { filesTruncated: true }])("marks complexity partial for incomplete file evidence %#", (flags) => {
    const l = ledger({ files: ["apps/a/x.ts", "services/b/y.ts"], ...flags });
    const result = annotateAllocation(alloc([{ kind: "pr", title: "x", url: URL, repository: "org/app", state: "merged" }]), l).initiatives[0]!.shipped[0]!;
    expect(result.complexity?.partial).toBe(true);
    expect(result.complexity?.reason.endsWith(" (based on a partial file list)")).toBe(true);
    expect(result.checks?.testsUpdated).toBe(false);
  });

  it("keeps complete file evidence definitive", () => {
    const l = ledger({ files: ["apps/a/x.ts"] });
    const result = annotateAllocation(alloc([{ kind: "pr", title: "x", url: URL, repository: "org/app", state: "merged" }]), l).initiatives[0]!.shipped[0]!;
    expect(result.complexity).not.toHaveProperty("partial");
    expect(result.complexity?.reason).not.toContain("partial file list");
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
      withoutChecks: 0, withPassingChecks: 1, withPendingChecks: 0, checksCollected: 1, checksUnknown: 1, withAutomatedReview: 1, withHumanReview: 0, withTests: 1,
      withPartialChecks: 0,
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

  it("puts label-overridden open PRs in review and release stages only under completed", () => {
    const openBeta: AllocationItem = { kind: "pr", title: "beta", url: "https://github.com/org/app/pull/4", repository: "org/app", state: "open", labels: ["stage: beta"] };
    const openPilot: AllocationItem = { ...openBeta, title: "pilot", url: "https://github.com/org/app/pull/5", labels: ["readiness: pilot"] };
    const mergedLive: AllocationItem = { ...openBeta, title: "live", url: "https://github.com/org/app/pull/6", state: "merged", labels: ["stage: live"] };
    const betaSummary = summarizeVerification(annotateAllocation(alloc([], [openBeta]), null));
    expect(betaSummary).toMatchObject({ inReview: 1, preview: 0 });
    expect(betaSummary.completed + betaSummary.inReview + betaSummary.drafts).toBe(1);
    const summary = summarizeVerification(annotateAllocation(alloc([mergedLive], [openPilot]), null));
    expect(summary).toMatchObject({ completed: 1, live: 1, inReview: 1, preview: 0 });
    expect(summary.completed + summary.inReview + summary.drafts).toBe(2);
  });

  it("excludes empty automated check sets from the pass-rate denominator", () => {
    const empty = ledger({ checks: { passed: 0, failed: 0, skipped: 0, pending: 0, names: [] } });
    const make = (url: string) => ({ kind: "pr" as const, title: "checks", url, repository: "org/app", state: "open" as const });
    const emptyOnly = annotateAllocation(alloc([], [make(URL)]), empty);
    expect(summarizeVerification(emptyOnly)).toMatchObject({ checksCollected: 0, withoutChecks: 1 });
    const mixed = alloc([], [make(URL), make("https://github.com/org/app/pull/7")]);
    const evidence = ledger({ checks: { passed: 1, failed: 0, skipped: 0, pending: 0, names: ["ci"] } });
    evidence.prs!["https://github.com/org/app/pull/7"] = pr({ url: "https://github.com/org/app/pull/7", checks: { passed: 0, failed: 0, skipped: 0, pending: 0, names: [] } });
    const mixedSummary = summarizeVerification(annotateAllocation(mixed, evidence));
    expect(mixedSummary).toMatchObject({ checksCollected: 1, withPassingChecks: 1, withoutChecks: 1 });
  });

  it("partitions unique PRs into collected checks, no checks, and unknown checks", () => {
    const empty = ledger({ checks: { passed: 0, failed: 0, skipped: 0, pending: 0, names: [] } });
    const zeroChecks: AllocationItem = { kind: "pr", title: "zero", url: URL, repository: "org/app", state: "open" };
    const unknownChecks: AllocationItem = { kind: "pr", title: "unknown", url: "https://github.com/org/app/pull/2", repository: "org/app", state: "open" };
    const mixed = summarizeVerification(annotateAllocation(alloc([], [zeroChecks, unknownChecks]), empty));
    expect(mixed).toMatchObject({ checksCollected: 0, withoutChecks: 1, checksUnknown: 1 });
    expect(mixed.checksCollected + mixed.withoutChecks + mixed.checksUnknown).toBe(2);

    const collectedLedger = ledger({ checks: { passed: 1, failed: 0, skipped: 0, pending: 0, names: ["ci"] } });
    const collected = summarizeVerification(annotateAllocation(alloc([zeroChecks]), collectedLedger));
    expect(collected.checksUnknown).toBe(0);
    expect(collected.checksCollected + collected.withoutChecks + collected.checksUnknown).toBe(1);
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

  it("does not count partial passing evidence as fully passing", () => {
    const partial = ledger({ checks: { passed: 1, failed: 0, skipped: 0, pending: 0, names: ["ci"], statusesUnavailable: true } });
    const allocation = annotateAllocation(alloc([{ kind: "pr", title: "partial", url: URL, repository: "org/app", state: "merged" }]), partial);
    expect(summarizeVerification(allocation)).toMatchObject({ checksCollected: 1, withPassingChecks: 0, withPartialChecks: 1 });
  });

  it("treats zero partial checks as unknown while complete zero checks mean none ran", () => {
    const partial = ledger({ checks: { passed: 0, failed: 0, skipped: 0, pending: 0, names: [], statusesUnavailable: true } });
    const item: AllocationItem = { kind: "pr", title: "partial zero", url: URL, repository: "org/app", state: "open" };
    expect(summarizeVerification(annotateAllocation(alloc([], [item]), partial))).toMatchObject({ checksUnknown: 1, withoutChecks: 0 });

    const complete = ledger({ checks: { passed: 0, failed: 0, skipped: 0, pending: 0, names: [] } });
    expect(summarizeVerification(annotateAllocation(alloc([], [item]), complete))).toMatchObject({ checksUnknown: 0, withoutChecks: 1 });
  });
});

describe("summarizeVerification with uncollected checks", () => {
  it("still counts reviews and test updates when automated checks were not collected", () => {
    const a: Allocation = {
      version: "1", totalHours: 1, manualHours: 0, workTypes: [], note: "",
      initiatives: [{ initiative: "A", hours: 1, share: 1, byWorkType: {}, other: [], inProgress: [], shipped: [{
        kind: "pr", title: "x", url: "https://github.com/o/r/pull/9", state: "merged",
        checks: { automated: null, humanReviews: 1, automatedReviews: 1, testsUpdated: true },
      }] }],
    };
    const s = summarizeVerification(a);
    expect(s).toMatchObject({ checksUnknown: 1, withHumanReview: 1, withAutomatedReview: 1, withTests: 1 });
  });
});

describe("readiness dates in the report timezone (edge cases)", () => {
  it("keeps bare calendar dates and falls back to UTC for an invalid zone", () => {
    const l = ledger({ mergedAt: "2026-10-08T01:00:00Z" }, {});
    expect(deriveReadiness(item(), l, "Not/AZone")).toMatchObject({ detail: expect.stringContaining("Merged Oct 8") });
    const stored = ledger({ release: { stage: "live", environment: "production", sha: "s", since: "2026-10-07" } }, {});
    expect(deriveReadiness(item(), stored, "America/New_York")).toMatchObject({ since: "2026-10-07", detail: "Live since Oct 7" });
  });
});

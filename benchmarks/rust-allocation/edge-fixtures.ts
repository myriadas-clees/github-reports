// Synthetic cases exercise semantics absent from the private report corpus.
const config = (initiatives: Record<string, string> = {}, labelPrefix = "app:") =>
  ({ initiatives, labelPrefix, defaultInitiative: null, trendWeeks: 2 });
const report = (date: string, overrides: Record<string, unknown> = {}) => ({
  date,
  data: {
    dateRange: { from: date, to: date }, stats: { estimatedHours: 20 },
    pullRequests: [], prsInProgress: [], prsWorkedOnClosed: [],
    commitMessages: [], codeReviews: [], reviewComments: [],
    ...overrides,
  },
});
const pr = (number: number, title: string, labels: string[], state = "merged") => ({
  title, labels, state, repository: "example/app", url: `https://example.com/pull/${number}`,
  additions: 100, deletions: 0, workFiles: ["src/example.ts", "tests/example.test.ts"],
  workCommits: [{ sha: `sha${number}` }],
});
const requests = ["2026-10-02", "2026-10-07"].map((end) => ({
  end, windows: [{ from: "2026-09-24", to: "2026-09-30" }, { from: "2026-10-01", to: "2026-10-07" }],
}));
const same = pr(1, "feat: ship", ["app:Alpha", "impact: low"], "open");
const later = pr(1, "fix: ship", ["app:Beta", "impact: high"]);
const moved = {
  reports: [
    report("2026-10-01", {
      pullRequests: [same], prsInProgress: [same],
      codeReviews: [{ repository: "example/app", prTitle: same.title, prUrl: same.url, prNumber: 1 }],
      commitMessages: [{ repo: "example/app", commits: [{ sha: "sha1", message: "feat: duplicate" }, { sha: "direct", message: "fix: direct", additions: 40, deletions: 2, filesChanged: 2 }] }],
    }),
    report("2026-10-02", { pullRequests: [later], reviewComments: [{ repository: "example/app", prNumber: 1 }], aiReviews: { fixed: 2 } }),
  ],
  config: config(), manual: [{ date: "2026-10-04", initiative: "Ops", hours: 1.25, note: "Planning" }], requests,
};
const ties = {
  reports: [report("2026-10-01", {
    stats: { estimatedHours: 40 },
    pullRequests: [pr(1, "feat: one", ["app:upper"]), pr(2, "feat: two", ["app:lower"]), pr(3, "feat: three", ["app:accent"]), pr(4, "feat: four", ["app:z"])],
  })],
  config: config({ "app:upper": "APPLE", "app:lower": "apple", "app:accent": "Éclair", "app:z": "Zulu" }), manual: [], requests,
};
const localeNames = ["APPLE", "apple", "Éclair", "Zulu", "Ångström", "Alpha", "a-b", "a_b", "a b", "2", "10", "日本語"];
const localeStress = {
  reports: [report("2026-10-01", {
    stats: { estimatedHours: localeNames.length * 10 },
    pullRequests: localeNames.map((_, i) => pr(i + 1, `feat: item ${i}`, [`app:key-${i}`])),
  })],
  config: config(Object.fromEntries(localeNames.map((name, i) => [`app:key-${i}`, name]))),
  manual: [], requests,
};
const collisions = {
  reports: [report("2026-10-01", { pullRequests: [pr(1, "feat: x", ["App:Hub"])] })],
  config: config({ "app:hub": "First", "APP:HUB": "Second" }), manual: [], requests,
};
const unicodePrefix = {
  reports: [report("2026-10-01", { pullRequests: [pr(1, "feat: x", ["İstanbul"])] })],
  config: config({}, "İ"), manual: [], requests,
};
const manualOnly = {
  reports: [], config: config(), manual: [{ date: "2026-10-04", initiative: "Ops", hours: 3 }], requests,
};
// Multiple rounded PR efforts share one bucket and later move to different initiatives.
const roundingMovement = {
  reports: [
    report("2026-10-01", {
      stats: { estimatedHours: 0.1 },
      pullRequests: [pr(10, "feat: a", ["app:Alpha"], "open"), pr(11, "feat: b", ["app:Alpha"], "open"), pr(12, "fix: c", ["app:Alpha"], "open")],
    }),
    report("2026-10-02", {
      stats: { estimatedHours: 0.2 },
      pullRequests: [pr(10, "fix: a", ["app:Beta"]), pr(11, "docs: b", ["app:Gamma"])],
    }),
  ], config: config(), manual: [], requests,
};
// Shipped placement wins, but later appearances supply the title and labels.
const latestMetadata = {
  reports: [
    report("2026-10-01", { pullRequests: [pr(20, "feat: original", ["app:Alpha", "impact: low"])] }),
    report("2026-10-02", { pullRequests: [pr(20, "fix: renamed", ["app:Beta", "impact: high"], "open")] }),
    report("2026-10-03", { pullRequests: [pr(20, "docs: final", [], "open")] }),
  ], config: config(), manual: [], requests,
};
const commentMetadata = {
  reports: [report("2026-10-01", {
    pullRequests: [pr(30, "feat: original", ["app:Alpha"])],
    codeReviews: [{ repository: "example/app", prTitle: "feat: reviewed", prUrl: "https://example.com/pull/30", prNumber: 30 }],
    reviewComments: [
      { repository: "example/app", prNumber: 31, prTitle: "feat(core): comment only", prLabels: ["app:Comment"] },
      { repository: "example/app", prNumber: 30, prTitle: "fix(core): changed", prLabels: [] },
      { repository: "example/app", prNumber: 30, prLabels: ["app:Override"] },
      { repository: "example/app", prNumber: 30 },
      { repository: "example/app", prNumber: 32 },
    ],
  })], config: config({ "scope:core": "Core" }), manual: [], requests,
};
const reviewAndComment = {
  reports: [report("2026-10-01", {
    codeReviews: [{ repository: "example/app", prTitle: "Tweak pricing", prUrl: "https://example.com/pull/40", prNumber: 40 }],
    reviewComments: [{ repository: "example/app", prNumber: 40, prTitle: "Tweak pricing", prLabels: ["app:Northstar"] }],
  })], config: config(), manual: [], requests,
};
process.stdout.write(JSON.stringify([
  { name: "dedup-movement-and-manual", input: moved },
  { name: "locale-ties", input: ties },
  { name: "locale-stress", input: localeStress },
  { name: "case-colliding-config", input: collisions },
  { name: "unicode-label-prefix", input: unicodePrefix },
  { name: "manual-only-week", input: manualOnly },
  { name: "rounding-and-multiple-pr-movement", input: roundingMovement },
  { name: "latest-pr-metadata", input: latestMetadata },
  { name: "comment-only-metadata", input: commentMetadata },
  { name: "review-and-comment-metadata", input: reviewAndComment },
]));

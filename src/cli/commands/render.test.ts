import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";
it("sorts weekly and daily archive paths by their report dates", async () => {
  const { sortReportPathsChronologically } = await import("./render.js");
  const dates = new Map([
    ["2026/W14", "2026-04-05"],
    ["2026/W15", "2026-04-12"],
  ]);
  expect(sortReportPathsChronologically([
    "2026/04/08",
    "2026/W15",
    "2026/04/06",
    "2026/W14",
  ], dates)).toEqual([
    "2026/W14",
    "2026/04/06",
    "2026/04/08",
    "2026/W15",
  ]);
});

// Mock fs/promises
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockReaddir = vi.fn();
const mockMkdir = vi.fn();
const mockAccess = vi.fn();

vi.mock("node:fs/promises", () => ({
  readFile: (...args: unknown[]) => mockReadFile(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  access: (...args: unknown[]) => mockAccess(...args),
  cp: vi.fn().mockResolvedValue(undefined),
}));

// Mock renderer
const mockRenderReport = vi.fn().mockReturnValue("<html>report</html>");
vi.mock("../../renderer/index.js", () => ({
  renderReport: (...args: unknown[]) => mockRenderReport(...args),
}));

// Mock index page
const mockRenderIndexPage = vi.fn().mockReturnValue("<html>index</html>");
const mockBuildReportEntry = vi.fn().mockImplementation((path: string, title?: string) => ({
  path,
  title: title ?? path,
}));
vi.mock("../../deployer/index-page.js", () => ({
  renderIndexPage: (...args: unknown[]) => mockRenderIndexPage(...args),
  buildReportEntry: (...args: unknown[]) => mockBuildReportEntry(...args),
}));

// Mock estimate page (undefined = no calibration, as in most tests)
const mockRenderEstimatePage = vi.fn().mockReturnValue(undefined);
vi.mock("../../deployer/estimate-page.js", () => ({
  renderEstimatePage: (...args: unknown[]) => mockRenderEstimatePage(...args),
}));

// Calibration built from daily reports; undefined by default. Tests override it to control app history.
const mockBuildEstimateCalibration = vi.fn();
vi.mock("../../collector/estimate-calibration.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../collector/estimate-calibration.js")>()),
  buildEstimateCalibration: (...args: unknown[]) => mockBuildEstimateCalibration(...args),
}));

// Mock OG image
const mockGenerateOGImage = vi.fn().mockResolvedValue(Buffer.from("png-data"));
const mockGenerateIndexOGImage = vi.fn().mockResolvedValue(Buffer.from("index-png-data"));
vi.mock("../../renderer/og-image.js", () => ({
  generateOGImage: (...args: unknown[]) => mockGenerateOGImage(...args),
  generateIndexOGImage: (...args: unknown[]) => mockGenerateIndexOGImage(...args),
}));

// Mock RSS
const mockBuildRSSFeed = vi.fn().mockReturnValue("<?xml version=\"1.0\"?><rss></rss>");
vi.mock("../../renderer/rss.js", () => ({
  buildRSSFeed: (...args: unknown[]) => mockBuildRSSFeed(...args),
}));

vi.mock("../../deployer/day.js", () => {
  return {
    resolveDayId: () => ({ date: "2026-04-01", year: 2026, month: 4, day: 1, path: "2026/04/01" }),
  };
});

const GITHUB_DATA_YAML = `
username: testuser
avatarUrl: https://example.com/avatar.png
dateRange:
  from: "2026-03-28"
  to: "2026-04-03"
stats:
  totalCommits: 42
  totalAdditions: 100
  totalDeletions: 20
  prsOpened: 5
  prsMerged: 3
  prsInProgress: 0
  prsReviewed: 8
  reviewComments: 0
  issuesOpened: 0
  issuesClosed: 0
  estimatedHours: 0
dailyCommits: []
repositories: []
pullRequests: []
issues: []
events: []
commitMessages: []
releases: []
externalContributions: []
`;

const LLM_DATA_YAML = `
title: Weekly Summary
subtitle: A great week
overview: Good stuff.
summaries: []
highlights: []
`;

describe("registerRender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    // Default: llm-data.yaml exists for all directories
    mockAccess.mockResolvedValue(undefined);
    vi.spyOn(process, "exit").mockImplementation((() => { throw new Error("process.exit"); }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("renders report and writes output files", async () => {
    // Mock readFile to return github-data and llm-data
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });

    // Mock readdir for listReportDirs
    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.includes("2026")) return Promise.resolve(["W14"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync([
      "node", "cli",
      "render",
      "--data-dir", "./data",
      "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--language", "en",
      "--timezone", "UTC",
      "--date", "2026-04-01",
    ]);

    // Should write report HTML
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("index.html"),
      expect.any(String),
      "utf-8",
    );

    // Should generate OG image
    expect(mockGenerateOGImage).toHaveBeenCalled();

    // Should write sitemap
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("sitemap.xml"),
      expect.stringContaining("<?xml"),
      "utf-8",
    );

    // Should write robots.txt
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("robots.txt"),
      expect.stringContaining("User-agent"),
      "utf-8",
    );

    // Should write RSS feed
    expect(mockBuildRSSFeed).toHaveBeenCalled();
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("feed.xml"),
      expect.stringContaining("<?xml"),
      "utf-8",
    );

    // Should render index page
    expect(mockRenderIndexPage).toHaveBeenCalled();

    // Should generate index OG image
    expect(mockGenerateIndexOGImage).toHaveBeenCalled();

    // Should write card SVGs with the report date range from github-data
    const cardCall = mockWriteFile.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).endsWith("card.svg"),
    );
    expect(cardCall).toBeDefined();
    const cardSvg = cardCall![1] as string;
    expect(cardSvg).toContain("2026-04-01");
    expect(cardSvg).toContain("2026-03-28");
    expect(cardSvg).toContain("2026-04-03");
  });

  it("warns and renders without evidence when the ledger is malformed", async () => {
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      if (path.endsWith("evidence.yaml")) return Promise.resolve("bad: [yaml");
      return Promise.reject(new Error("not found"));
    });
    mockReaddir.mockImplementation((dir: string) => dir.endsWith("data") ? Promise.resolve(["2026"]) : dir.includes("2026") ? Promise.resolve(["W14"]) : Promise.resolve([]));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);
    await program.parseAsync(["node", "cli", "render", "--data-dir", "./data", "--output-dir", "./output", "--base-url", "https://user.github.io/repo", "--language", "en", "--timezone", "UTC", "--date", "2026-04-01"]);
    expect(mockRenderReport).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("evidence ledger unavailable"));
  });

  it("writes estimate/index.html and lists it in the sitemap when the page renders", async () => {
    mockRenderEstimatePage.mockReturnValueOnce("<html>estimate</html>");
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });
    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.includes("2026")) return Promise.resolve(["W14"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);
    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./data", "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--language", "en", "--timezone", "UTC", "--date", "2026-04-01",
    ]);

    expect(mockMkdir).toHaveBeenCalledWith(expect.stringMatching(/output\/estimate$/), { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringMatching(/estimate\/index\.html$/),
      "<html>estimate</html>",
      "utf-8",
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("sitemap.xml"),
      expect.stringContaining("https://user.github.io/repo/estimate/"),
      "utf-8",
    );
  });

  it("does not write estimate page when none is rendered", async () => {
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });
    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.includes("2026")) return Promise.resolve(["W14"]);
      return Promise.resolve([]);
    });
    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);
    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./data", "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--language", "en", "--timezone", "UTC", "--date", "2026-04-01",
    ]);
    const paths = mockWriteFile.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(paths.some((x) => x.includes("estimate/"))).toBe(false);
  });

  describe("homepage app-estimate link", () => {
    const calibration = (initiatives: { name: string; activeDays: number; spanWeeks: number; effortDays: number; mergedPrs: number }[]) => {
      const p = { p50: 0, p90: 0 };
      return {
        version: "1.0", asOf: "2026-10-07", since: "2026-06", sampleSize: 20,
        groups: [], apps: { initiatives, activeDays: p, spanWeeks: p, effortDays: p },
      };
    };
    const runDailyRender = async () => {
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
        if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
        return Promise.reject(new Error("not found"));
      });
      mockReaddir.mockImplementation((dir: string) => {
        if (dir.endsWith("data")) return Promise.resolve(["2026"]);
        if (dir.includes("2026")) return Promise.resolve(["W14"]);
        return Promise.resolve([]);
      });
      const { registerRender } = await import("./render.js");
      const program = new Command();
      registerRender(program);
      await program.parseAsync([
        "node", "cli", "render",
        "--data-dir", "./data", "--output-dir", "./output",
        "--base-url", "https://user.github.io/repo",
        "--language", "en", "--timezone", "UTC", "--date", "2026-04-01",
      ]);
      // renderIndexPage(entries, pageData, language, siteTitle, base, repoUrl, theme, options)
      return mockRenderIndexPage.mock.calls.at(-1)![7] as Record<string, unknown>;
    };

    it("passes hasAppEstimates false when the calibration has no app history", async () => {
      mockBuildEstimateCalibration.mockReturnValueOnce(calibration([]));
      mockRenderEstimatePage.mockReturnValueOnce("<html>estimate</html>");
      const options = await runDailyRender();
      expect(options).toMatchObject({ hasEstimatePage: true, hasAppEstimates: false });
    });

    it("passes hasAppEstimates true when past apps exist", async () => {
      mockBuildEstimateCalibration.mockReturnValueOnce(
        calibration([{ name: "Hub", activeDays: 30, spanWeeks: 6, effortDays: 12, mergedPrs: 4 }]),
      );
      mockRenderEstimatePage.mockReturnValueOnce("<html>estimate</html>");
      const options = await runDailyRender();
      expect(options).toMatchObject({ hasEstimatePage: true, hasAppEstimates: true });
    });

    it("passes hasAppEstimates false when no estimate page renders", async () => {
      mockBuildEstimateCalibration.mockReturnValueOnce(undefined);
      const options = await runDailyRender();
      expect(options).toMatchObject({ hasEstimatePage: false, hasAppEstimates: false });
    });
  });

  it("exits when github-data.yaml is missing", async () => {
    mockReadFile.mockRejectedValue(new Error("not found"));
    mockReaddir.mockResolvedValue([]);

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await expect(
      program.parseAsync([
        "node", "cli", "render",
        "--data-dir", "./data",
        "--output-dir", "./output",
        "--base-url", "https://example.com",
      ]),
    ).rejects.toThrow("process.exit");
  });

  it("writes CNAME for custom domain", async () => {
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });
    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.includes("2026")) return Promise.resolve(["W14"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./data",
      "--output-dir", "./output",
      "--base-url", "https://custom-domain.com",
      "--date", "2026-04-01",
    ]);

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("CNAME"),
      "custom-domain.com\n",
      "utf-8",
    );
  });

  it("does not write CNAME for github.io domains", async () => {
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });
    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.includes("2026")) return Promise.resolve(["W14"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./data",
      "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--date", "2026-04-01",
    ]);

    const cnameCall = mockWriteFile.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("CNAME"),
    );
    expect(cnameCall).toBeUndefined();
  });

  it("exits when llm-data.yaml is missing", async () => {
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });
    mockReaddir.mockResolvedValue([]);

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await expect(
      program.parseAsync([
        "node", "cli", "render",
        "--data-dir", "./data",
        "--output-dir", "./output",
        "--base-url", "https://example.com",
      ]),
    ).rejects.toThrow("process.exit");
  });

  it("exits when --base-url is not provided", async () => {
    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await expect(
      program.parseAsync([
        "node", "cli", "render",
        "--data-dir", "./data",
        "--output-dir", "./output",
      ]),
    ).rejects.toThrow("process.exit");
  });

  it("re-renders previous week with next-week link", async () => {
    const PREV_GITHUB_YAML = `${GITHUB_DATA_YAML.replace("2026-03-28", "2026-03-21").replace("2026-04-03", "2026-03-27").replace("estimatedHours: 0", "estimatedHours: 2")}\nhoursInputs:\n  timestamps: []\n  volume:\n    commitCount: 3\n    commitAdditions: 4000\n    commitDeletions: 200\n    commitStatsCount: 3\n  options:\n    gapMinutes: 90\n    maxSessionHours: 6\n    minimumHours: 8\n`;
    const PREV_LLM_YAML = LLM_DATA_YAML.replace("Weekly Summary", "Previous Week Summary");

    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("2026/03/31") && path.includes("github-data.yaml")) return Promise.resolve(PREV_GITHUB_YAML);
      if (path.includes("2026/03/31") && path.includes("llm-data.yaml")) return Promise.resolve(PREV_LLM_YAML);
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });

    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.endsWith("data/2026")) return Promise.resolve(["03", "04"]);
      if (dir.endsWith("data/2026/03")) return Promise.resolve(["31"]);
      if (dir.endsWith("data/2026/04")) return Promise.resolve(["01"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./data",
      "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--date", "2026-04-01",
    ]);

    // renderReport should be called twice: once for current week, once for previous week
    expect(mockRenderReport).toHaveBeenCalledTimes(2);

    // Second call should include nextWeek link
    const prevWeekCall = mockRenderReport.mock.calls[1];
    expect(prevWeekCall[1]).toHaveProperty("nextWeek", "../../../2026/04/01/");
    expect(prevWeekCall[0]).toMatchObject({ stats: { estimatedHours: 9 }, hoursEstimate: { hours: 9 } });
  });

  it("links nextWeek and prevPrev when current week sits in the middle", async () => {
    const PREV_GITHUB_YAML = GITHUB_DATA_YAML.replace("2026-03-28", "2026-03-21").replace("2026-04-03", "2026-03-27");
    const PREV_LLM_YAML = LLM_DATA_YAML.replace("Weekly Summary", "Previous Week Summary");

    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("2026/03/31") && path.includes("github-data.yaml")) return Promise.resolve(PREV_GITHUB_YAML);
      if (path.includes("2026/03/31") && path.includes("llm-data.yaml")) return Promise.resolve(PREV_LLM_YAML);
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });

    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.endsWith("data/2026")) return Promise.resolve(["03", "04"]);
      if (dir.endsWith("data/2026/03")) return Promise.resolve(["30", "31"]);
      if (dir.endsWith("data/2026/04")) return Promise.resolve(["01", "02"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./data",
      "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--date", "2026-04-01",
    ]);

    expect(mockRenderReport).toHaveBeenCalledTimes(2);

    // Current call should reference nextWeek (W15) — covers `currentIdx < length-1` truthy branch
    const currentCall = mockRenderReport.mock.calls[0];
    expect(currentCall[1]).toHaveProperty("nextWeek", "../../../2026/04/02/");
    expect(currentCall[1]).toHaveProperty("prevWeek", "../../../2026/03/31/");

    // Prev re-render should reference prevPrev (W12) — covers `prevIdx > 0` and `prevPrev` truthy branches
    const prevWeekCall = mockRenderReport.mock.calls[1];
    expect(prevWeekCall[1]).toHaveProperty("prevWeek", "../../../2026/03/30/");
    expect(prevWeekCall[1]).toHaveProperty("nextWeek", "../../../2026/04/01/");
  });

  it("skips prev week re-render when prev week data is missing", async () => {
    mockReadFile.mockImplementation((path: string) => {
      // Only current week has data
      if (path.includes("W13")) return Promise.reject(new Error("not found"));
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });

    // W13 has no llm-data.yaml
    mockAccess.mockImplementation((path: string) =>
      path.includes("W13") ? Promise.reject(new Error("not found")) : Promise.resolve(undefined),
    );

    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.includes("2026")) return Promise.resolve(["W13", "W14"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./data",
      "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--date", "2026-04-01",
    ]);

    // Only current week should be rendered (prev week data is missing)
    expect(mockRenderReport).toHaveBeenCalledTimes(1);
  });

  it("skips prev re-render and emits index entry without stats when prev github-data is missing", async () => {
    const PREV_LLM_YAML = LLM_DATA_YAML.replace("Weekly Summary", "Previous Week Summary");

    mockReadFile.mockImplementation((path: string) => {
      // W13 has llm-data only; its github-data.yaml is missing.
      if (path.includes("2026/03/31") && path.includes("github-data.yaml"))
        return Promise.reject(new Error("not found"));
      if (path.includes("2026/03/31") && path.includes("llm-data.yaml"))
        return Promise.resolve(PREV_LLM_YAML);
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });

    // mockAccess resolves for everything — W13 IS listed in allPaths via listCompletedReportDirs.
    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.endsWith("data/2026")) return Promise.resolve(["03", "04"]);
      if (dir.endsWith("data/2026/03")) return Promise.resolve(["31"]);
      if (dir.endsWith("data/2026/04")) return Promise.resolve(["01"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./data",
      "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--date", "2026-04-01",
    ]);

    // Current week renders, but prev re-render is skipped because prevGhData is null
    // (covers `if (prevGhData && prevAiContent)` false branch).
    expect(mockRenderReport).toHaveBeenCalledTimes(1);

    // buildReportEntry was invoked for W13 with stats=undefined
    // (covers `const stats = ghData ? {...} : undefined` false branch).
    const w13EntryCall = mockBuildReportEntry.mock.calls.find(
      (call: unknown[]) => (call[0] as string) === "2026/03/31",
    );
    expect(w13EntryCall).toBeDefined();
    expect(w13EntryCall![3]).toBeUndefined();
  });

  it("filters index entries when llm-data fails to load", async () => {
    mockReadFile.mockImplementation((path: string) => {
      // W13's llm-data.yaml fails to parse — entry should be filtered out.
      if (path.includes("W13") && path.includes("llm-data.yaml"))
        return Promise.reject(new Error("parse error"));
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });

    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.includes("2026")) return Promise.resolve(["W13", "W14"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./data",
      "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--date", "2026-04-01",
    ]);

    // W13 is included in allPaths (its llm-data.yaml passes the access check),
    // but its tryReadYaml fails inside buildReportEntries → entry filtered out
    // (covers `if (!llmData) return null` true branch).
    const w13EntryCall = mockBuildReportEntry.mock.calls.find(
      (call: unknown[]) => (call[0] as string) === "2026/W13",
    );
    expect(w13EntryCall).toBeUndefined();

    // Index page still receives the surviving entries.
    expect(mockRenderIndexPage).toHaveBeenCalled();
    const entries = mockRenderIndexPage.mock.calls[0][0] as Array<{ path: string }>;
    expect(entries.every((e) => e.path !== "2026/W13")).toBe(true);
  });

  it("uses environment variables for options", async () => {
    vi.stubEnv("BASE_URL", "https://env-base.example.com");
    vi.stubEnv("DATA_DIR", "./env-data");
    vi.stubEnv("OUTPUT_DIR", "./env-output");
    vi.stubEnv("LANGUAGE", "ja");
    vi.stubEnv("TIMEZONE", "Asia/Tokyo");
    vi.stubEnv("SITE_TITLE", "My Reports");

    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });
    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("env-data")) return Promise.resolve(["2026"]);
      if (dir.includes("2026")) return Promise.resolve(["W14"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync(["node", "cli", "render"]);

    expect(mockRenderReport).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ language: "ja", siteTitle: "My Reports" }),
    );
  });

  it("exits when --theme is unknown", async () => {
    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      program.parseAsync([
        "node", "cli", "render",
        "--data-dir", "./data",
        "--output-dir", "./output",
        "--base-url", "https://example.com",
        "--theme", "not-a-real-theme",
      ]),
    ).rejects.toThrow("process.exit");

    expect(errorSpy).toHaveBeenCalled();
    const errorMsg = errorSpy.mock.calls.flat().join(" ");
    expect(errorMsg).toContain("Unknown theme");
  });

  it("exits when --base-url is missing and BASE_URL env unset", async () => {
    const orig = process.env.BASE_URL;
    delete process.env.BASE_URL;
    try {
      const { registerRender } = await import("./render.js");
      const program = new Command();
      registerRender(program);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        program.parseAsync([
          "node", "cli", "render",
          "--data-dir", "./data",
          "--output-dir", "./output",
        ]),
      ).rejects.toThrow("process.exit");

      expect(errorSpy).toHaveBeenCalled();
      const errorMsg = errorSpy.mock.calls.flat().join(" ");
      expect(errorMsg).toContain("Base URL required");
    } finally {
      if (orig !== undefined) process.env.BASE_URL = orig;
    }
  });

  it("falls back to ./data and ./output defaults when no opts or env vars", async () => {
    const orig = {
      data: process.env.DATA_DIR,
      out: process.env.OUTPUT_DIR,
    };
    delete process.env.DATA_DIR;
    delete process.env.OUTPUT_DIR;
    try {
      mockReadFile.mockImplementation((path: string) => {
        if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
        if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
        return Promise.reject(new Error("not found"));
      });
      mockReaddir.mockResolvedValue([]);

      const { registerRender } = await import("./render.js");
      const program = new Command();
      registerRender(program);

      await program.parseAsync([
        "node", "cli", "render",
        "--base-url", "https://user.github.io/repo",
        "--date", "2026-04-01",
      ]);

      // First readFile call should target ./data/2026/W14/github-data.yaml
      const readPaths = mockReadFile.mock.calls
        .map((c: unknown[]) => c[0] as string)
        .filter((p): p is string => typeof p === "string");
      expect(readPaths.some((p) => p.startsWith("data/") || p.includes("/data/"))).toBe(true);
      // Output should land under ./output
      const writePaths = mockWriteFile.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(writePaths.some((p) => typeof p === "string" && p.includes("output/"))).toBe(true);
    } finally {
      if (orig.data !== undefined) process.env.DATA_DIR = orig.data;
      if (orig.out !== undefined) process.env.OUTPUT_DIR = orig.out;
    }
  });

  it("logs non-Error rejection via instanceof Error false branch", async () => {
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });
    mockReaddir.mockResolvedValue([]);
    mockRenderReport.mockImplementationOnce(() => { throw "string-failure"; });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await expect(
      program.parseAsync([
        "node", "cli", "render",
        "--data-dir", "./data",
        "--output-dir", "./output",
        "--base-url", "https://user.github.io/repo",
        "--date", "2026-04-01",
      ]),
    ).rejects.toThrow("process.exit");

    const logged = errorSpy.mock.calls.flat();
    expect(logged).toContain("string-failure");
  });

  it("uses GITHUB_REPOSITORY env to compute repoUrl for index page", async () => {
    vi.stubEnv("GITHUB_REPOSITORY", "octo/awesome");

    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });
    mockReaddir.mockImplementation((dir: string) => {
      if (dir.endsWith("data")) return Promise.resolve(["2026"]);
      if (dir.includes("2026")) return Promise.resolve(["W14"]);
      return Promise.resolve([]);
    });

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./data",
      "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--date", "2026-04-01",
    ]);

    // renderIndexPage signature: (entries, profile, language, siteTitle, base, repoUrl, theme)
    const indexCall = mockRenderIndexPage.mock.calls[0];
    expect(indexCall[5]).toBe("https://github.com/octo/awesome");
  });

  it("renders successfully when data dir does not exist (readdir rejects)", async () => {
    mockReadFile.mockImplementation((path: string) => {
      if (path.includes("github-data.yaml")) return Promise.resolve(GITHUB_DATA_YAML);
      if (path.includes("llm-data.yaml")) return Promise.resolve(LLM_DATA_YAML);
      return Promise.reject(new Error("not found"));
    });
    // Simulate ENOENT on the dataDir lookup inside listCompletedReportDirs
    mockReaddir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));

    const { registerRender } = await import("./render.js");
    const program = new Command();
    registerRender(program);

    await program.parseAsync([
      "node", "cli", "render",
      "--data-dir", "./missing-data",
      "--output-dir", "./output",
      "--base-url", "https://user.github.io/repo",
      "--date", "2026-04-01",
    ]);

    // Render still succeeds for the current week, no prev/next links
    expect(mockRenderReport).toHaveBeenCalledTimes(1);
    const opts = mockRenderReport.mock.calls[0][1];
    expect(opts).toMatchObject({ prevWeek: undefined, nextWeek: undefined });
  });
});

describe("withRecomputedHours", () => {
  it("recomputes from hoursInputs and falls back when missing", async () => {
    const { withRecomputedHours } = await import("./render.js");
    const base = {
      username: "alice",
      avatarUrl: "",
      dateRange: { from: "2026-06-16", to: "2026-06-16" },
      stats: {
        totalCommits: 0,
        totalAdditions: 0,
        totalDeletions: 0,
        prsOpened: 0,
        prsMerged: 0,
        prsInProgress: 0,
        prsReviewed: 0,
        reviewComments: 0,
        issuesOpened: 0,
        issuesClosed: 0,
        estimatedHours: 2,
      },
      dailyCommits: [],
      repositories: [],
      pullRequests: [],
      issues: [],
      events: [],
      commitMessages: [],
      releases: [],
      externalContributions: [],
      hoursEstimate: {
        version: "1.0",
        hours: 2,
        sessions: 0,
        gapMinutes: 90,
        maxSessionHours: 6,
        note: "old",
      },
      aiContent: { title: "t", subtitle: "s", overview: "", summaries: [], highlights: [] },
    };

    expect(withRecomputedHours(base as never).stats.estimatedHours).toBe(2);

    const withInputs = {
      ...base,
      hoursInputs: {
        timestamps: [],
        volume: {
          commitCount: 3,
          commitAdditions: 4000,
          commitDeletions: 200,
          commitStatsCount: 3,
        },
        options: { gapMinutes: 90, maxSessionHours: 6, minimumHours: 8 },
      },
    };
    expect(withRecomputedHours(withInputs as never).stats.estimatedHours).toBe(9);
  });
});

describe("buildAllocationInput", () => {
  const report = (date: string, hours: number) => ({
    username: "u",
    avatarUrl: "",
    dateRange: { from: date, to: date },
    stats: { estimatedHours: hours, totalCommits: 1 },
    pullRequests: [],
    commitMessages: [],
  }) as unknown as import("../../types.js").WeeklyReportData;

  it("builds day and trend (no week panel) up to the current day only", async () => {
    const { buildAllocationInput } = await import("./render.js");
    const daily = new Map([
      ["2026-10-01", report("2026-10-01", 4)],
      ["2026-10-02", report("2026-10-02", 4)],
      ["2026-10-09", report("2026-10-09", 99)],
    ]);
    const input = buildAllocationInput({
      current: { date: "2026-10-02", data: report("2026-10-02", 4) },
      dailyReports: daily,
    })!;
    expect(input.day).toBeDefined();
    expect(input.trend!.periods.length).toBe(8);
    expect(input.week).toBeUndefined();
    expect(input.trend!.periods.at(-1)!.allocation.totalHours).toBeLessThan(50);
  });

  it("weekly mode returns only the week", async () => {
    const { buildAllocationInput } = await import("./render.js");
    const input = buildAllocationInput({
      mode: "weekly",
      current: { date: "2026-W40", data: report("2026-10-02", 6) },
      dailyReports: new Map(),
    })!;
    expect(input.day).toBeUndefined();
    expect(input.trend).toBeUndefined();
    expect(input.week!.allocation.totalHours).toBeGreaterThan(0);
  });

  it("annotates PR items with readiness whether or not evidence exists", async () => {
    const { buildAllocationInput, buildWeekAllocationInputs } = await import("./render.js");
    const url = "https://github.com/o/r/pull/7";
    const withPr = {
      ...report("2026-10-02", 6),
      pullRequests: [{ title: "Add x", url, repository: "o/r", state: "merged", labels: [], workFiles: ["apps/hub/a.ts"] }],
    } as unknown as import("../../types.js").WeeklyReportData;
    const stage = (a?: import("../../types.js").Allocation) => a?.initiatives[0]?.shipped[0]?.readiness?.stage;
    const without = buildAllocationInput({ current: { date: "2026-10-02", data: withPr }, dailyReports: new Map() })!;
    expect(stage(without.day)).toBe("done");
    expect(without.day!.initiatives[0]!.shipped[0]!.complexity?.level).toBe("contained");
    const evidence = {
      version: "1", updatedAt: "", defaultBranches: { "o/r": "main" }, prs: {},
      deployments: { "o/r": [{ environment: "production", production: true, ref: "main", sha: "s", createdAt: "2026-10-03T00:00:00Z", succeededAt: "2026-10-03T00:00:00Z" }] },
    };
    evidence.prs = { [url]: { url, repository: "o/r", number: 7, author: "u", state: "merged", isDraft: false, baseRef: "main", headRef: "h", headSha: "x", mergeCommitSha: null, createdAt: "", mergedAt: "2026-10-02T12:00:00Z", reviews: [], checks: null, files: [], fetchedAt: "" } } as never;
    const withEv = buildAllocationInput({ current: { date: "2026-10-02", data: withPr }, dailyReports: new Map(), evidence })!;
    expect(stage(withEv.day)).toBe("live");
    const weeks = buildWeekAllocationInputs({ dailyReports: new Map([["2026-10-02", withPr]]), evidence });
    expect(stage(weeks.get("2026-10-01")!.week!.allocation)).toBe("live");
  });

  it("passes the report timezone into readiness annotation", async () => {
    const { buildAllocationInput } = await import("./render.js");
    const url = "https://github.com/o/r/pull/7";
    const withPr = {
      ...report("2026-10-02", 6),
      pullRequests: [{ title: "Add x", url, repository: "o/r", state: "merged", labels: [], workFiles: ["apps/hub/a.ts"] }],
    } as unknown as import("../../types.js").WeeklyReportData;
    const evidence = {
      version: "1", updatedAt: "", defaultBranches: { "o/r": "main" }, prs: {
        [url]: { url, repository: "o/r", number: 7, author: "u", state: "merged", isDraft: false, baseRef: "main", headRef: "h", headSha: "x", mergeCommitSha: null, createdAt: "", mergedAt: "2026-10-08T01:00:00Z", reviews: [], checks: null, files: [], fetchedAt: "" },
      }, deployments: {}, deploymentsUnavailable: { "o/r": "2026-10-19T00:00:00Z" },
    } as unknown as import("../../types.js").EvidenceLedger;
    const input = buildAllocationInput({ current: { date: "2026-10-02", data: withPr }, dailyReports: new Map(), evidence, timezone: "America/New_York" })!;
    expect(input.day!.initiatives[0]!.shipped[0]!.readiness).toMatchObject({ detail: "Merged Oct 7; release status not collected", since: "2026-10-07" });
  });

  it("warns and returns undefined instead of throwing", async () => {
    const { buildAllocationInput } = await import("./render.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const input = buildAllocationInput({
      current: { date: "2026-10-02", data: null as never },
      dailyReports: new Map(),
    });
    expect(input).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("buildWeekAllocationInputs", () => {
  const report = (date: string, hours: number) => ({
    username: "u",
    avatarUrl: "",
    dateRange: { from: date, to: date },
    stats: { estimatedHours: hours, totalCommits: 1 },
    pullRequests: [],
    commitMessages: [],
  }) as unknown as import("../../types.js").WeeklyReportData;

  it("is empty without reports", async () => {
    const { buildWeekAllocationInputs } = await import("./render.js");
    expect(buildWeekAllocationInputs({ dailyReports: new Map() }).size).toBe(0);
  });

  it("builds one Thu-Wed week input per week with reports, ending at the latest report while open", async () => {
    const { buildWeekAllocationInputs } = await import("./render.js");
    const daily = new Map([
      ["2026-09-30", report("2026-09-30", 4)], // Wed: week of Sep 24
      ["2026-10-01", report("2026-10-01", 4)], // Thu: week of Oct 1
      ["2026-10-07", report("2026-10-07", 4)], // Wed
      ["2026-10-08", report("2026-10-08", 4)], // Thu: week of Oct 8 (open)
    ]);
    const weeks = buildWeekAllocationInputs({ dailyReports: daily });
    expect([...weeks.keys()].sort()).toEqual(["2026-09-24", "2026-10-01", "2026-10-08"]);
    const closed = weeks.get("2026-10-01")!;
    expect(closed.week!.label).toBe("Oct 1-7");
    expect(closed.asOf).toBe("2026-10-07");
    expect(closed.trend!.periods.at(-1)!.id).toBe("2026-10-01");
    expect(closed.day).toBeUndefined();
    const open = weeks.get("2026-10-08")!;
    expect(open.asOf).toBe("2026-10-08");
    expect(open.week!.allocation.totalHours).toBeGreaterThan(0);
    // The Oct 1 week never includes later days.
    expect(closed.week!.allocation.totalHours).toBeLessThan(open.trend!.periods.reduce((t, x) => t + x.allocation.totalHours, 0));
  });

  it("includes a manual-only week between reported weeks and ignores manual time after the latest report", async () => {
    const { buildWeekAllocationInputs } = await import("./render.js");
    const daily = new Map([
      ["2026-09-30", report("2026-09-30", 4)], // week of Sep 24
      ["2026-10-15", report("2026-10-15", 4)], // week of Oct 15 (latest report)
    ]);
    const manualTime = [
      { date: "2026-10-03", initiative: "Hub", hours: 6 }, // week of Oct 1: no daily report
      { date: "2026-10-22", initiative: "Hub", hours: 5 }, // after the latest report: excluded
      { date: "2026-10-05", initiative: "Hub", hours: 0 }, // zero hours: ignored
    ];
    const weeks = buildWeekAllocationInputs({ dailyReports: daily, manualTime });
    expect([...weeks.keys()].sort()).toEqual(["2026-09-24", "2026-10-01", "2026-10-15"]);
    const manualWeek = weeks.get("2026-10-01")!;
    expect(manualWeek.week!.label).toBe("Oct 1-7");
    expect(manualWeek.week!.allocation.totalHours).toBe(6);
    expect(manualWeek.asOf).toBe("2026-10-07");
    // The after-latest entry (Oct 22) must not create a week of its own.
    expect(weeks.has("2026-10-22")).toBe(false);
  });

  it("warns and returns nothing instead of throwing", async () => {
    const { buildWeekAllocationInputs } = await import("./render.js");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const weeks = buildWeekAllocationInputs({ dailyReports: new Map([["2026-10-01", null as never]]) });
    expect(weeks.size).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("buildInitiativeColorOrder", () => {
  const report = (date: string, hours: number, repo: string) => ({
    username: "u",
    avatarUrl: "",
    dateRange: { from: date, to: date },
    stats: { estimatedHours: hours, totalCommits: 1 },
    pullRequests: [],
    commitMessages: [{ repo, messages: ["feat: work"] }],
  }) as unknown as import("../../types.js").WeeklyReportData;

  it("gives recent initiatives the first color slots, then all-time effort", async () => {
    const { buildInitiativeColorOrder } = await import("./render.js");
    const order = buildInitiativeColorOrder(new Map([
      ["2026-06-01", report("2026-06-01", 40, "org/legacy")],
      ["2026-06-02", report("2026-06-02", 20, "org/older")],
      ["2026-10-07", report("2026-10-07", 4, "org/fresh")],
    ]));
    expect(order).toEqual(["Fresh", "Legacy", "Older"]);
  });

  it("leaves the no-activity minimum day out of the palette order", async () => {
    const { buildInitiativeColorOrder } = await import("./render.js");
    const { computeAllocation, NO_ACTIVITY_INITIATIVE } = await import("../../collector/allocation.js");
    const idle = {
      username: "u", avatarUrl: "", dateRange: { from: "2026-10-07", to: "2026-10-07" },
      // The 8-hour daily minimum is carried as the estimate on a day with no activity.
      stats: { estimatedHours: 8, totalCommits: 0 }, pullRequests: [], commitMessages: [],
    } as unknown as import("../../types.js").WeeklyReportData;
    // Precondition: an idle day is put in the no-activity bucket.
    expect(computeAllocation(idle).initiatives.map((b) => b.initiative)).toContain(NO_ACTIVITY_INITIATIVE);
    const order = buildInitiativeColorOrder(new Map([
      ["2026-10-06", report("2026-10-06", 4, "org/fresh")],
      ["2026-10-07", idle],
    ]));
    expect(order).not.toContain(NO_ACTIVITY_INITIATIVE);
    expect(order).toEqual(["Fresh"]);
  });
});

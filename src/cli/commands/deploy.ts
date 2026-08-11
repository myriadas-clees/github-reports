// deploy command: push generated report directory to gh-pages branch

import { Command } from "commander";
import { deploy } from "../../deployer/index.js";
import { resolveDayId } from "../../deployer/day.js";
import { parseLocalDate } from "../../collector/date-range.js";

type DeployCommandOptions = {
  directory: string;
  repoUrl: string;
  timezone: string;
  date?: Date;
  repository?: string;
};

const env = (key: string): string | undefined => process.env[key];

const repositorySlug = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  if (/^[^/]+\/[^/]+$/.test(value)) return value.replace(/\.git$/, "");
  const match = value.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  return match ? `${match[1]}/${match[2]}` : undefined;
};

export const assertSafePagesVisibility = async (
  token: string | undefined,
  repository: string | undefined,
): Promise<void> => {
  if (!token || !repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    throw new Error("GITHUB_TOKEN and an owner/repository slug are required to verify Pages privacy.");
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const repoResponse = await fetch(`https://api.github.com/repos/${repository}`, { headers });
  if (!repoResponse.ok) throw new Error(`Could not verify repository privacy (${repoResponse.status}).`);
  const repo = await repoResponse.json() as { private?: boolean };
  if (!repo.private) return;

  const pagesResponse = await fetch(`https://api.github.com/repos/${repository}/pages`, { headers });
  const pages = pagesResponse.ok
    ? await pagesResponse.json() as { visibility?: string }
    : null;
  if (pages?.visibility !== "private") {
    throw new Error(
      `Refusing to deploy private repository ${repository}: GitHub Pages access is not private.`,
    );
  }
};

export const buildRepoUrl = (repo: string | undefined): string => {
  const repoSlug = repo ?? env("GITHUB_REPOSITORY");
  if (!repoSlug) {
    throw new Error("Repository required. Pass --repo or set GITHUB_REPOSITORY.");
  }

  // Already a full URL
  if (repoSlug.startsWith("http") || repoSlug.startsWith("git@")) {
    const token = env("GITHUB_TOKEN");
    if (token && repoSlug.startsWith("https://github.com/")) {
      return repoSlug.replace("https://github.com/", `https://x-access-token:${token}@github.com/`);
    }
    return repoSlug;
  }

  // owner/repo slug
  const token = env("GITHUB_TOKEN");
  if (token) {
    return `https://x-access-token:${token}@github.com/${repoSlug}.git`;
  }
  return `https://github.com/${repoSlug}.git`;
};

const run = async (options: DeployCommandOptions): Promise<void> => {
  const dayId = resolveDayId(options.date, options.timezone);

  await assertSafePagesVisibility(env("GITHUB_TOKEN"), options.repository);

  console.log(`Deploying ${options.directory}...`);
  await deploy({
    repoUrl: options.repoUrl,
    directory: options.directory,
    message: `report: ${dayId.date}`,
  });
  console.log("Deployed successfully!");
};

export const registerDeploy = (program: Command): void => {
  program
    .command("deploy")
    .description("Deploy generated report to GitHub Pages (gh-pages branch)")
    .option("-d, --directory <dir>", "Directory containing generated HTML files (env: OUTPUT_DIR, default: ./output)")
    .option("-r, --repo <slug>", "Repository (owner/repo or full URL, env: GITHUB_REPOSITORY)")
    .option("--timezone <tz>", "IANA timezone (env: TIMEZONE, default: UTC)")
    .option("--date <date>", "Report date (YYYY-MM-DD, default: previous workday)")
    .action(async (opts) => {
      try {
        const timezone = opts.timezone ?? env("TIMEZONE") ?? "UTC";
        const repoUrl = buildRepoUrl(opts.repo);
        await run({
          directory: opts.directory ?? env("OUTPUT_DIR") ?? "./output",
          repoUrl,
          timezone,
          date: opts.date ? parseLocalDate(opts.date, timezone) : undefined,
          repository: repositorySlug(opts.repo ?? env("GITHUB_REPOSITORY")),
        });
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
};

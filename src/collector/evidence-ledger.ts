// Evidence ledger (data/evidence.yaml): deployments + per-PR verification.

import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml, stringify as toYaml } from "yaml";
import type { DeploymentRecord, EvidenceLedger, PrEvidence } from "../types.js";

export const EVIDENCE_FILE = "evidence.yaml";
export const EVIDENCE_VERSION = "1.0";
const MAX_DEPLOYMENTS_PER_REPO = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PrRef = { repo: string; number: number; url: string };

export const emptyLedger = (): EvidenceLedger => ({
  version: EVIDENCE_VERSION,
  updatedAt: new Date(0).toISOString(),
  defaultBranches: {},
  deployments: {},
  prs: {},
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const readEvidenceLedger = async (dataDir: string): Promise<EvidenceLedger | null> => {
  try {
    const raw = await readFile(join(dataDir, EVIDENCE_FILE), "utf-8");
    const parsed = parseYaml(raw) as unknown;
    if (!isObject(parsed)) return null;
    return {
      version: typeof parsed.version === "string" ? parsed.version : EVIDENCE_VERSION,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date(0).toISOString(),
      defaultBranches: isObject(parsed.defaultBranches) ? (parsed.defaultBranches as Record<string, string>) : {},
      deployments: isObject(parsed.deployments) ? (parsed.deployments as Record<string, DeploymentRecord[]>) : {},
      scannedDeployments: isObject(parsed.scannedDeployments) ? (parsed.scannedDeployments as Record<string, string[]>) : undefined,
      deploymentsUnavailable: isObject(parsed.deploymentsUnavailable) ? (parsed.deploymentsUnavailable as Record<string, string>) : undefined,
      prs: isObject(parsed.prs) ? (parsed.prs as Record<string, PrEvidence>) : {},
    };
  } catch {
    return null;
  }
};

export const writeEvidenceLedger = async (dataDir: string, ledger: EvidenceLedger): Promise<void> => {
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, EVIDENCE_FILE), toYaml(ledger, { lineWidth: 120 }), "utf-8");
};

const exists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};

const listDir = async (p: string): Promise<string[]> => {
  try {
    return await readdir(p);
  } catch {
    return [];
  }
};

const PR_URL = /github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/;

export const parsePrUrl = (url: string): { repo: string; number: number } | null => {
  const m = url.match(PR_URL);
  return m ? { repo: m[1]!, number: Number(m[2]) } : null;
};

export const collectPrRefsFromData = async (dataDir: string, since?: string): Promise<PrRef[]> => {
  const files: string[] = [];
  const weeklyFiles: string[] = [];
  for (const year of (await listDir(dataDir)).filter((n) => /^\d{4}$/.test(n)).sort()) {
    const entries = await listDir(join(dataDir, year));
    for (const month of entries.filter((n) => /^\d{2}$/.test(n)).sort()) {
      for (const day of (await listDir(join(dataDir, year, month))).filter((n) => /^\d{2}$/.test(n)).sort()) {
        if (since && `${year}-${month}-${day}` < since) continue;
        files.push(join(dataDir, year, month, day, "github-data.yaml"));
      }
    }
    for (const week of entries.filter((n) => /^W\d{2}$/.test(n)).sort()) {
      weeklyFiles.push(join(dataDir, year, week, "github-data.yaml"));
    }
  }
  files.push(...weeklyFiles);

  const seen = new Map<string, PrRef>();
  for (const file of files) {
    if (!(await exists(file))) continue;
    let data: { pullRequests?: Array<{ url?: string }>; prsInProgress?: Array<{ url?: string }>; prsWorkedOnClosed?: Array<{ url?: string }>; dateRange?: { to?: unknown } };
    try {
      data = parseYaml(await readFile(file, "utf-8")) ?? {};
    } catch {
      continue;
    }
    if (weeklyFiles.includes(file) && since) {
      const endDate = typeof data.dateRange?.to === "string" ? data.dateRange.to.slice(0, 10) : "";
      // Legacy weekly archives without a usable end date cannot be safely included in a cutoff query.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < since.slice(0, 10)) continue;
    }
    for (const pr of [...(data.pullRequests ?? []), ...(data.prsInProgress ?? []), ...(data.prsWorkedOnClosed ?? [])]) {
      if (!pr?.url || seen.has(pr.url)) continue;
      const parsed = parsePrUrl(pr.url);
      if (parsed) seen.set(pr.url, { ...parsed, url: pr.url });
    }
  }
  return [...seen.values()];
};

export const needsRefresh = (existing: PrEvidence | undefined, now: Date): boolean => {
  if (!existing) return true;
  if (existing.state === "open") return true;
  if (existing.checks?.statusesUnavailable || existing.checks?.checkRunsUnavailable) return true;
  if (existing.checks === null || existing.checks.pending > 0) return true;
  if (existing.mergedAt) {
    const mergedAgo = now.getTime() - new Date(existing.mergedAt).getTime();
    const fetchedAgo = now.getTime() - new Date(existing.fetchedAt).getTime();
    if (mergedAgo < 14 * DAY_MS && fetchedAgo > 2 * DAY_MS) return true;
  }
  return false;
};

export const deploymentKey = (d: Pick<DeploymentRecord, "environment" | "sha" | "createdAt">): string =>
  `${d.environment}|${d.sha}|${d.createdAt}`;

export const mergeDeployments = (
  existing: DeploymentRecord[],
  fresh: DeploymentRecord[],
): DeploymentRecord[] => {
  const map = new Map<string, DeploymentRecord>();
  for (const d of [...existing, ...fresh]) map.set(deploymentKey(d), d);
  return [...map.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const pruneDeployments = (ledger: EvidenceLedger, cutoffIso?: string): void => {
  for (const [repo, deployments] of Object.entries(ledger.deployments)) {
    ledger.deployments[repo] = mergeDeployments([], deployments).slice(0, MAX_DEPLOYMENTS_PER_REPO);
  }
  if (cutoffIso && ledger.scannedDeployments) {
    const cutoff = new Date(cutoffIso).getTime() - 7 * DAY_MS;
    for (const [repo, keys] of Object.entries(ledger.scannedDeployments)) {
      ledger.scannedDeployments[repo] = keys.filter((key) => {
        const createdAt = key.slice(key.lastIndexOf("|") + 1);
        const timestamp = new Date(createdAt).getTime();
        return Number.isFinite(timestamp) && timestamp >= cutoff;
      });
    }
  }
};

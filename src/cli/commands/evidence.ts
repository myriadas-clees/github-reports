// evidence: refresh data/evidence.yaml (deployments + per-PR verification evidence)

import { Command } from "commander";
import { loadConfigFile, resolveConfig } from "../../config.js";
import {
  collectPrRefsFromData,
  deploymentKey,
  emptyLedger,
  mergeDeployments,
  pruneDeployments,
  needsRefresh,
  type PrRef,
  readEvidenceLedger,
  writeEvidenceLedger,
} from "../../collector/evidence-ledger.js";
import { fetchDefaultBranch, fetchDeployments, fetchPrEvidence, isCommitContained, mapWithConcurrency } from "../../collector/fetch-evidence.js";
import { matchedReleaseDeployment } from "../../collector/readiness.js";
import type { EvidenceLedger } from "../../types.js";

const env = (key: string): string | undefined => process.env[key];

/** Configured repositories first, followed by repositories discovered from activity. */
export const evidenceRepositories = (configured: string[], refs: PrRef[]): string[] =>
  [...new Set([...configured, ...refs.map((ref) => ref.repo)])];

/** Fetch from the previous UTC day to cover deployments on the local since date in any timezone. */
export const deploymentCutoffIso = (since: string): string => {
  const date = new Date(`${since}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString();
};

/** Successful records remain cached; recent unsuccessful scans are eligible for status retries. */
export const buildKnownDeploymentKeys = (
  deployments: import("../../types.js").DeploymentRecord[], scanned: string[], now: Date,
): Set<string> => {
  const successful = new Set(deployments.map(deploymentKey));
  const retryCutoff = now.getTime() - 7 * 86_400_000;
  return new Set([
    ...successful,
    ...scanned.filter((key) => {
      if (successful.has(key)) return false;
      const createdAt = Date.parse(key.slice(key.lastIndexOf("|") + 1));
      return !Number.isFinite(createdAt) || createdAt < retryCutoff;
    }),
  ]);
};

export const selectDeploymentCandidates = (
  deployments: import("../../types.js").DeploymentRecord[],
  production: boolean,
  pe: Pick<import("../../types.js").PrEvidence, "baseRef" | "mergeCommitSha" | "mergedAt">,
  defaultBranch: string,
): import("../../types.js").DeploymentRecord[] => deployments.filter((d) =>
  d.production === production && d.ref !== pe.baseRef && d.ref !== defaultBranch && d.ref !== pe.mergeCommitSha &&
  d.sha !== pe.mergeCommitSha && Date.parse(d.createdAt) >= Date.parse(pe.mergedAt!) && /^[0-9a-f]{7,40}$/i.test(d.sha),
).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

export const findContainingDeployments = async ({
  deployments, pe, defaultBranch, known, nonContainingShas = [], unknownShas = [], isContained, maxCallsPerKind = 5,
}: {
  deployments: import("../../types.js").DeploymentRecord[];
  pe: Pick<import("../../types.js").PrEvidence, "baseRef" | "mergeCommitSha" | "mergedAt">;
  defaultBranch: string;
  known: import("../../types.js").PrEvidence["containingDeployments"];
  nonContainingShas?: string[];
  unknownShas?: string[];
  isContained: (sha: string) => Promise<boolean | null>;
  maxCallsPerKind?: number;
}): Promise<{ known: NonNullable<import("../../types.js").PrEvidence["containingDeployments"]>; nonContainingShas: string[]; unknownShas: string[]; unknownKinds: { production: boolean; nonProduction: boolean }; calls: { production: number; nonProduction: number } }> => {
  const found = [...(known ?? [])];
  const checkedFalse = new Set(nonContainingShas);
  const checkedUnknown = new Set(unknownShas);
  const calls = { production: 0, nonProduction: 0 };
  const unknownKinds = { production: false, nonProduction: false };
  for (const production of [true, false]) {
    const kind = production ? "production" : "nonProduction";
    const alreadyFound = found.some((entry) => deployments.some((d) => d.production === production && d.environment === entry.environment && d.sha === entry.sha));
    if (alreadyFound) { checkedUnknown.delete(found.find((entry) => deployments.some((d) => d.production === production && d.environment === entry.environment && d.sha === entry.sha))!.sha); continue; }
    const candidates = selectDeploymentCandidates(deployments, production, pe, defaultBranch);
    for (const deployment of [...candidates.filter((d) => !checkedFalse.has(d.sha) && !checkedUnknown.has(d.sha)), ...candidates.filter((d) => checkedUnknown.has(d.sha))]) {
      if (checkedFalse.has(deployment.sha)) continue;
      if (calls[kind] >= maxCallsPerKind) break;
      calls[kind]++;
      const contained = await isContained(deployment.sha);
      if (contained === true) {
        checkedUnknown.delete(deployment.sha);
        found.push({ environment: deployment.environment, sha: deployment.sha });
        break;
      }
      if (contained === false) {
        checkedUnknown.delete(deployment.sha);
        checkedFalse.add(deployment.sha);
      } else {
        unknownKinds[kind] = true;
        checkedUnknown.add(deployment.sha);
      }
    }
  }
  for (const deployment of deployments) {
    if (checkedUnknown.has(deployment.sha)) unknownKinds[deployment.production ? "production" : "nonProduction"] = true;
  }
  return { known: found, nonContainingShas: [...checkedFalse], unknownShas: [...checkedUnknown], unknownKinds, calls };
};

export const markDeploymentsUnavailable = (ledger: import("../../types.js").EvidenceLedger, repo: string, now: string): void => {
  ledger.deploymentsUnavailable ??= {};
  ledger.deploymentsUnavailable[repo] = now;
};

export const applyDeploymentFetch = (ledger: import("../../types.js").EvidenceLedger, repo: string, result: Awaited<ReturnType<typeof fetchDeployments>>, now: string): void => {
  ledger.deployments[repo] = mergeDeployments(ledger.deployments[repo] ?? [], result.records);
  ledger.scannedDeployments ??= {};
  ledger.scannedDeployments[repo] = [...new Set([...(ledger.scannedDeployments[repo] ?? []), ...result.scannedKeys])];
  if (result.failed) {
    markDeploymentsUnavailable(ledger, repo, now);
    return;
  }
  if (ledger.deploymentsUnavailable) delete ledger.deploymentsUnavailable[repo];
};

/**
 * Fields computed by earlier evidence runs (not returned by the PR fetch) that a refresh must
 * keep: verified ancestry results and release history, which outlives evicted deployment rows.
 */
export const carryOverDerivedEvidence = (
  fresh: import("../../types.js").PrEvidence,
  prior: import("../../types.js").PrEvidence | undefined,
): import("../../types.js").PrEvidence => {
  const out = { ...fresh };
  if (prior?.containingDeployments) out.containingDeployments = prior.containingDeployments;
  if (prior?.nonContainingDeploymentShas) out.nonContainingDeploymentShas = prior.nonContainingDeploymentShas;
  if (prior?.unknownDeploymentShas) out.unknownDeploymentShas = prior.unknownDeploymentShas;
  if (prior?.ancestryUnknown) out.ancestryUnknown = prior.ancestryUnknown;
  if (prior?.release) out.release = prior.release;
  return out;
};

/** Persist release history before old deployment rows are eventually evicted. */
export const recordReleaseEvidence = (ledger: EvidenceLedger, refs: PrRef[]): void => {
  for (const ref of refs) {
    const pe = ledger.prs[ref.url];
    if (!pe?.mergedAt || pe.state !== "merged") continue;
    const match = matchedReleaseDeployment({ state: "merged", title: "", labels: [], url: ref.url, repository: ref.repo }, ledger);
    if (!match || (match.stage === "preview" && pe.release)) continue;
    if (pe.release?.stage === "live" && match.stage !== "live") continue;
    pe.release = { stage: match.stage, environment: match.deployment.environment, sha: match.deployment.sha, since: match.deployment.succeededAt };
  }
};

export const registerEvidence = (program: Command): void => {
  program
    .command("evidence")
    .description("Refresh deployment and PR verification evidence (data/evidence.yaml)")
    .option("--config <path>", "Config file (default ./config.yaml or CONFIG_PATH)")
    .option("--data-dir <path>", "Data directory")
    .option("--since <date>", "Only consider activity since YYYY-MM-DD (default: 90 days ago)")
    .option("-t, --token <token>", "GitHub token (env: GITHUB_TOKEN / GH_PAT)")
    .option("--force", "Refresh evidence for all PRs")
    .action(async (opts: { config?: string; dataDir?: string; since?: string; force?: boolean; token?: string }) => {
      const configPath = opts.config ?? env("CONFIG_PATH") ?? "./config.yaml";
      const cfg = resolveConfig(await loadConfigFile(configPath), { dataDir: opts.dataDir });
      const token = opts.token ?? env("GITHUB_TOKEN") ?? env("GH_PAT");
      if (!token) throw new Error("GitHub token required. Set GITHUB_TOKEN / GH_PAT.");

      const now = new Date();
      const since = opts.since ?? new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error("--since must be YYYY-MM-DD");
      const sinceIso = deploymentCutoffIso(since);

      const ledger = (await readEvidenceLedger(cfg.dataDir)) ?? emptyLedger();
      const refs = await collectPrRefsFromData(cfg.dataDir, since);

      for (const repo of evidenceRepositories(cfg.repositories, refs)) {
        try {
          const branch = await fetchDefaultBranch(token, repo);
          if (branch) ledger.defaultBranches[repo] = branch;
          const existing = ledger.deployments[repo] ?? [];
          const known = buildKnownDeploymentKeys(existing, ledger.scannedDeployments?.[repo] ?? [], now);
          const result = await fetchDeployments(token, repo, sinceIso, known);
          applyDeploymentFetch(ledger, repo, result, now.toISOString());
          console.log(`${repo}: +${result.records.length} deployments (default branch ${branch ?? "unknown"})`);
        } catch (err) {
          markDeploymentsUnavailable(ledger, repo, now.toISOString());
          console.warn(`Warning: deployments for ${repo} failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      const todo = refs.filter((r) => opts.force || needsRefresh(ledger.prs[r.url], now));
      let refreshed = 0;
      await mapWithConcurrency(todo, async (ref) => {
        try {
          const ev = await fetchPrEvidence(token, ref, now);
          if (ev) {
            ledger.prs[ref.url] = carryOverDerivedEvidence(ev, ledger.prs[ref.url]);
            refreshed++;
          }
        } catch (err) {
          console.warn(`Warning: ${ref.repo}#${ref.number} failed: ${err instanceof Error ? err.message : err}`);
        }
      });

      // Verify SHA-based deployments only. Branch refs already have an explicit association.
      for (const ref of refs) {
        const pe = ledger.prs[ref.url];
        const deployments = ledger.deployments[ref.repo] ?? [];
        if (!pe?.mergeCommitSha || !pe.mergedAt || !deployments.length) continue;
        const known = pe.containingDeployments ?? [];
        // Already live via a verified production deployment: no further compare calls needed.
        if (known.some((entry) => deployments.some((d) => d.production && d.environment === entry.environment && d.sha === entry.sha))) continue;
        const result = await findContainingDeployments({
          deployments, pe, defaultBranch: ledger.defaultBranches[ref.repo] ?? "main", known,
          nonContainingShas: pe.nonContainingDeploymentShas,
          unknownShas: pe.unknownDeploymentShas,
          isContained: (sha) => isCommitContained(token, ref.repo, pe.mergeCommitSha!, sha),
        });
        // Only persist non-empty lists, so branch-deploying repos don't gain empty fields on every PR.
        if (result.nonContainingShas.length) pe.nonContainingDeploymentShas = result.nonContainingShas;
        else delete pe.nonContainingDeploymentShas;
        if (result.unknownShas.length) pe.unknownDeploymentShas = result.unknownShas;
        else delete pe.unknownDeploymentShas;
        if (result.known.length) pe.containingDeployments = result.known;
        const previous = typeof pe.ancestryUnknown === "boolean" ? { production: pe.ancestryUnknown, nonProduction: pe.ancestryUnknown } : (pe.ancestryUnknown ?? {});
        const ancestryUnknown = { ...previous };
        for (const kind of ["production", "nonProduction"] as const) {
          const match = result.known.some((entry) => deployments.some((d) => d.production === (kind === "production") && d.environment === entry.environment && d.sha === entry.sha));
          if (match) delete ancestryUnknown[kind];
          else if (result.unknownKinds[kind]) ancestryUnknown[kind] = true;
          else delete ancestryUnknown[kind];
        }
        if (ancestryUnknown.production || ancestryUnknown.nonProduction) pe.ancestryUnknown = ancestryUnknown;
        else delete pe.ancestryUnknown;
      }

      recordReleaseEvidence(ledger, refs);

      pruneDeployments(ledger, sinceIso);
      ledger.updatedAt = new Date().toISOString();
      await writeEvidenceLedger(cfg.dataDir, ledger);
      console.log(`Evidence: ${refreshed}/${todo.length} PRs refreshed (${refs.length} referenced, ${Object.keys(ledger.prs).length} stored)`);
    });
};

// evidence: refresh data/evidence.yaml (deployments + per-PR verification evidence)

import { Command } from "commander";
import { loadConfigFile, resolveConfig } from "../../config.js";
import {
  collectPrRefsFromData,
  deploymentKey,
  emptyLedger,
  mergeDeployments,
  needsRefresh,
  type PrRef,
  readEvidenceLedger,
  writeEvidenceLedger,
} from "../../collector/evidence-ledger.js";
import { fetchDefaultBranch, fetchDeployments, fetchPrEvidence, isCommitContained, mapWithConcurrency } from "../../collector/fetch-evidence.js";

const env = (key: string): string | undefined => process.env[key];

/** Configured repositories first, followed by repositories discovered from activity. */
export const evidenceRepositories = (configured: string[], refs: PrRef[]): string[] =>
  [...new Set([...configured, ...refs.map((ref) => ref.repo)])];

export const applyDeploymentFetch = (ledger: import("../../types.js").EvidenceLedger, repo: string, result: Awaited<ReturnType<typeof fetchDeployments>>, now: string): void => {
  if (result.failed) {
    ledger.deploymentsUnavailable ??= {};
    ledger.deploymentsUnavailable[repo] = now;
    return;
  }
  ledger.deployments[repo] = mergeDeployments(ledger.deployments[repo] ?? [], result.records);
  if (ledger.deploymentsUnavailable) delete ledger.deploymentsUnavailable[repo];
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
      const sinceIso = `${since}T00:00:00.000Z`;

      const ledger = (await readEvidenceLedger(cfg.dataDir)) ?? emptyLedger();
      const refs = await collectPrRefsFromData(cfg.dataDir, since);

      for (const repo of evidenceRepositories(cfg.repositories, refs)) {
        try {
          const branch = await fetchDefaultBranch(token, repo);
          if (branch) ledger.defaultBranches[repo] = branch;
          const existing = ledger.deployments[repo] ?? [];
          const known = new Set(existing.map(deploymentKey));
          const result = await fetchDeployments(token, repo, sinceIso, known);
          applyDeploymentFetch(ledger, repo, result, now.toISOString());
          console.log(`${repo}: +${result.records.length} deployments (default branch ${branch ?? "unknown"})`);
        } catch (err) {
          console.warn(`Warning: deployments for ${repo} failed: ${err instanceof Error ? err.message : err}`);
        }
      }

      const todo = refs.filter((r) => opts.force || needsRefresh(ledger.prs[r.url], now));
      let refreshed = 0;
      await mapWithConcurrency(todo, async (ref) => {
        try {
          const ev = await fetchPrEvidence(token, ref, now);
          if (ev) {
            ev.containingDeployments = ledger.prs[ref.url]?.containingDeployments;
            ledger.prs[ref.url] = ev;
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
        if (known.some((entry) => deployments.some((d) => d.production && d.environment === entry.environment && d.sha === entry.sha))) continue;
        let calls = 0;
        for (const production of [true, false]) {
          const alreadyFound = known.some((entry) => deployments.some((d) => d.production === production && d.environment === entry.environment && d.sha === entry.sha));
          if (alreadyFound) continue;
          const defaultBranch = ledger.defaultBranches[ref.repo] ?? "main";
          const candidates = deployments.filter((d) => d.production === production && d.ref !== pe.baseRef && d.ref !== defaultBranch && d.ref !== pe.mergeCommitSha && d.sha !== pe.mergeCommitSha &&
            Date.parse(d.createdAt) >= Date.parse(pe.mergedAt!) && /^[0-9a-f]{7,40}$/i.test(d.ref) && /^[0-9a-f]{7,40}$/i.test(d.sha))
            .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
          for (const deployment of candidates) {
            if (calls >= 5) break;
            calls++;
            if (await isCommitContained(token, ref.repo, pe.mergeCommitSha, deployment.sha)) {
              known.push({ environment: deployment.environment, sha: deployment.sha });
              break;
            }
          }
        }
        if (known.length) pe.containingDeployments = known;
      }

      ledger.updatedAt = new Date().toISOString();
      await writeEvidenceLedger(cfg.dataDir, ledger);
      console.log(`Evidence: ${refreshed}/${todo.length} PRs refreshed (${refs.length} referenced, ${Object.keys(ledger.prs).length} stored)`);
    });
};

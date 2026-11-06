// Partial prototype check only: this is not an allocation benchmark.
import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";
import { classifyWorkType } from "../../src/collector/allocation.js";

async function reports(path: string): Promise<string[]> {
  const files = await readdir(path, { withFileTypes: true });
  return (await Promise.all(files.map(async (f) => f.isDirectory() ? reports(`${path}/${f.name}`) : f.name === "github-data.yaml" ? [`${path}/${f.name}`] : []))).flat();
}
const files = await reports("data");
const input: { text: string; labels: string[] }[] = [];
for (const file of files) {
  const report = parse(await readFile(file, "utf8"));
  for (const pr of [...(report.pullRequests ?? []), ...(report.prsInProgress ?? []), ...(report.prsWorkedOnClosed ?? [])]) input.push({ text: pr.title, labels: pr.labels ?? [] });
  for (const repo of report.commitMessages ?? []) for (const commit of repo.commits?.length ? repo.commits : (repo.messages ?? []).map((message: string) => ({ message }))) input.push({ text: (commit.message ?? "").split("\n")[0], labels: [] });
}
const result = spawnSync("benchmarks/rust-allocation/target/debug/worklog-allocation-bench", { input: JSON.stringify(input), encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
if (result.status !== 0) throw new Error(result.stderr || `Rust process exited ${result.status}`);
const actual: string[] = JSON.parse(result.stdout);
const mismatches = input.filter((item, i) => classifyWorkType(item.text, item.labels) !== actual[i]);
console.log(JSON.stringify({ reports: files.length, classifications: input.length, mismatches: mismatches.length }, null, 2));
if (mismatches.length) process.exitCode = 1;

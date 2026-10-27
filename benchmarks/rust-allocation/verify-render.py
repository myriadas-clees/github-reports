#!/usr/bin/env python3
"""Inject the experimental outputs into a temporary renderer and compare complete sites."""

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BENCH = ROOT / "benchmarks" / "rust-allocation"
RUST = Path(os.environ.get("WORKLOG_RUST_BENCH_TARGET", str(Path(tempfile.gettempdir()) / "worklog-rust-allocation-release"))) / "release" / "worklog-allocation-bench"


def run(args, *, env, cwd=ROOT, data=None):
    result = subprocess.run(args, cwd=cwd, env=env, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed ({result.returncode}): {result.stderr.decode(errors='replace')[-1000:]}")
    return result.stdout


def files(root):
    return {str(path.relative_to(root)): path for path in root.rglob("*") if path.is_file()}


def main():
    env = os.environ.copy()
    env["DATA_DIR"] = str(Path(env.get("DATA_DIR", ROOT / "data")).resolve())
    env["CONFIG_PATH"] = str(Path(env.get("CONFIG_PATH", ROOT / "config.yaml")).resolve())
    env.update(BASE_URL="https://example.com/worklog", SITE_TITLE="Worklog", TIMEZONE="America/New_York", THEME="brutalist")
    payload = run(["bun", str(BENCH / "prepare.ts")], env=env)
    snapshot = json.loads(payload)
    rust = json.loads(run([str(RUST)], env=env, data=payload))
    daily = {report["date"]: allocation for report, allocation in zip(snapshot["reports"], rust["daily"], strict=True)}
    trends = {request["end"]: trend for request, trend in zip(snapshot["requests"], rust["trends"], strict=True)}

    with tempfile.TemporaryDirectory(prefix="worklog-rust-render-") as directory:
        tmp = Path(directory)
        # Compile the current source in the temporary directory; the workspace's
        # dist may predate uncommitted TypeScript changes.
        run([str(ROOT / "node_modules" / ".bin" / "tsrs"), "--outDir", str(tmp / "baseline-dist")], env=env)
        shutil.copytree(tmp / "baseline-dist", tmp / "dist")
        shutil.copy2(ROOT / "package.json", tmp / "package.json")
        for name in ("src", "assets", "node_modules"):
            (tmp / name).symlink_to(ROOT / name, target_is_directory=True)
        (tmp / "rust.json").write_text(json.dumps({"daily": daily, "trends": trends}))
        preload = tmp / "preload.js"
        preload.write_text(
            'import {readFileSync,writeFileSync} from "node:fs";\n'
            f'globalThis.__rust = JSON.parse(readFileSync({json.dumps(str(tmp / "rust.json"))}, "utf8"));\n'
            'globalThis.__rustCounts = {daily: 0, trends: 0};\n'
            f'process.on("exit", () => writeFileSync({json.dumps(str(tmp / "counts.json"))}, JSON.stringify(globalThis.__rustCounts)));\n'
        )
        module = tmp / "dist" / "collector" / "allocation.js"
        source = module.read_text()
        daily_head = "export const computeAllocation = (data, config = DEFAULT_ALLOCATION_CONFIG, manualTime = []) => {"
        trend_head = "const calculateAllocationTrend = (reports, endDate, config, manualTime, allocationFor, cache) => {"
        if source.count(daily_head) != 1 or source.count(trend_head) != 1:
            raise RuntimeError("Compiled allocation entrypoints changed; update the temporary parity harness")
        source = source.replace(daily_head, daily_head + """
    const date = data.dateRange?.from === data.dateRange?.to ? data.dateRange?.to?.slice(0, 10) : undefined;
    if (date && globalThis.__rust?.daily[date]) {
        globalThis.__rustCounts.daily++;
        return structuredClone(globalThis.__rust.daily[date]);
    }
""", 1)
        source = source.replace(trend_head, trend_head + """
    const date = endDate.slice(0, 10);
    if (globalThis.__rust?.trends[date]) {
        globalThis.__rustCounts.trends++;
        return structuredClone(globalThis.__rust.trends[date]);
    }
""", 1)
        module.write_text(source)

        env["OUTPUT_DIR"] = str(tmp / "baseline")
        run(["bun", str(tmp / "baseline-dist" / "cli" / "index.js"), "render", "--archive"], env=env)
        env["OUTPUT_DIR"] = str(tmp / "rust")
        run(["bun", "--preload", str(preload), str(tmp / "dist" / "cli" / "index.js"), "render", "--archive"], env=env)
        counts = json.loads((tmp / "counts.json").read_text())
        before, after = files(tmp / "baseline"), files(tmp / "rust")
        missing = before.keys() - after.keys()
        extra = after.keys() - before.keys()
        changed = [name for name in before.keys() & after.keys() if before[name].read_bytes() != after[name].read_bytes()]
        print(json.dumps({"files": len(before), "missing": len(missing), "extra": len(extra), "changed": len(changed), "substitutions": counts}))
        if missing or extra or changed or not counts["daily"] or not counts["trends"]:
            raise RuntimeError("Full rendered output differs or the Rust substitutions were not used")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Compare isolated allocation workloads; never write report data into the repository."""

import json
import math
import os
import resource
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BENCH = ROOT / "benchmarks" / "rust-allocation"
ENV = os.environ.copy()
TARGET = Path(ENV.get("WORKLOG_RUST_BENCH_TARGET", str(Path(tempfile.gettempdir()) / "worklog-rust-allocation-release")))
if not ENV.get("CARGO_HOME") and not shutil.which("cargo") and Path("/private/tmp/worklog-cargo/bin/cargo").exists():
    ENV["CARGO_HOME"] = "/private/tmp/worklog-cargo"
    ENV.setdefault("RUSTUP_HOME", "/private/tmp/worklog-rustup")
ENV["CARGO_TARGET_DIR"] = str(TARGET)
cargo_home_bin = Path(ENV["CARGO_HOME"]) / "bin" / "cargo" if ENV.get("CARGO_HOME") else None
CARGO = str(cargo_home_bin) if cargo_home_bin and cargo_home_bin.exists() else (shutil.which("cargo") or "cargo")


def measured(args, data=None, *, capture=True):
    before = resource.getrusage(resource.RUSAGE_CHILDREN)
    started = time.perf_counter()
    result = subprocess.run(
        args, cwd=ROOT, env=ENV, input=data,
        stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    elapsed = time.perf_counter() - started
    after = resource.getrusage(resource.RUSAGE_CHILDREN)
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed with exit {result.returncode}: {result.stderr.decode(errors='replace')[-1200:]}")
    return result.stdout, {
        "wall_seconds": elapsed,
        "cpu_seconds": (after.ru_utime - before.ru_utime) + (after.ru_stime - before.ru_stime),
    }


def mismatch(a, b, path="$"):
    if isinstance(a, bool) or isinstance(b, bool):
        return None if a == b and type(a) is type(b) else path
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return None if math.isclose(a, b, rel_tol=1e-12, abs_tol=1e-12) else path
    if type(a) is not type(b):
        return path
    if isinstance(a, dict):
        if a.keys() != b.keys():
            return path + " (object keys)"
        for key in a:
            result = mismatch(a[key], b[key], path + "." + key)
            if result:
                return result
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return path + " (array length)"
        for i, (left, right) in enumerate(zip(a, b)):
            result = mismatch(left, right, f"{path}[{i}]")
            if result:
                return result
        return None
    return None if a == b else path


def main():
    cold_target = not (TARGET / "release" / "worklog-allocation-bench").exists()
    build = [CARGO, "build", "--release", "--locked", "--manifest-path", str(BENCH / "Cargo.toml")]
    if ENV.get("WORKLOG_RUST_OFFLINE") == "1":
        build.append("--offline")
    _, first_build = measured(build, capture=False)
    _, warm_build = measured(build, capture=False)
    payload, preparation = measured(["bun", str(BENCH / "prepare.ts")])
    input_data = json.loads(payload)
    runners = {
        "typescript": ["bun", str(BENCH / "run-ts.ts"), "current"],
        "typescript_memoized": ["bun", str(BENCH / "run-ts.ts"), "memoized"],
        "rust": [str(TARGET / "release" / "worklog-allocation-bench")],
        "rust_via_bun": ["bun", str(BENCH / "run-rust.ts"), str(TARGET / "release" / "worklog-allocation-bench")],
    }
    if ENV.get("WORKLOG_RUST_PREVIOUS"):
        runners["rust_previous"] = [ENV["WORKLOG_RUST_PREVIOUS"]]
    cases, _ = measured(["bun", str(BENCH / "edge-fixtures.ts")])
    edge_cases = json.loads(cases)
    for case in edge_cases:
        encoded = json.dumps(case["input"], ensure_ascii=False).encode()
        baseline, _ = measured(runners["typescript"], encoded)
        expected_edge = json.loads(baseline)
        for name in list(runners)[1:]:
            output, _ = measured(runners[name], encoded)
            difference = mismatch(expected_edge, json.loads(output))
            if difference:
                print(json.dumps({"status": "edge mismatch", "case": case["name"], "runner": name, "path": difference}))
                return 1
    results = {}
    expected = None
    for name, command in runners.items():
        durations = []
        for _ in range(11):
            output, duration = measured(command, payload)
            actual = json.loads(output)
            if expected is None:
                expected = actual
            else:
                difference = mismatch(expected, actual)
                if difference:
                    print(json.dumps({"status": "mismatch", "runner": name, "path": difference}))
                    return 1
            durations.append(duration)
        results[name] = {
            "median_wall_seconds": statistics.median(d["wall_seconds"] for d in durations),
            "median_cpu_seconds": statistics.median(d["cpu_seconds"] for d in durations),
        }
    print(json.dumps({
        "status": "matched",
        "reports": len(input_data["reports"]),
        "trend_requests": len(input_data["requests"]),
        "edge_cases": [case["name"] for case in edge_cases],
        "snapshot_bytes": len(payload),
        "output_bytes": len(output),
        "comparison": "complete allocation and trend JSON; numeric tolerance 1e-12",
        "boundary": "all variants read the same pre-serialized input and write JSON; rust_via_bun additionally decodes/re-encodes across the Bun/Rust process boundary",
        "build": {"first_was_cold": cold_target, "first": first_build, "warm": warm_build},
        "snapshot_preparation": preparation,
        "variants": results,
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

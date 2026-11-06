# Rust allocation benchmark

This is an **experimental benchmark**, not a production implementation. Worklog still uses its TypeScript collector and renderer.

The benchmark compares the uncached TypeScript calculation, a benchmark TypeScript version that caches daily allocations and weekly periods, a Rust batch using the same caching strategy, and that same Rust batch called through Bun with JSON serialization and deserialization. Production archive rendering now also caches allocations and periods within each snapshot; it does not use Rust. All four benchmark variants consume the same report snapshot and produce complete daily allocations and weekly trend objects. Cached periods are scoped to one batch and keyed by the date window and effective end date; changing reports, configuration, or manual time requires a fresh cache. The Rust prototype includes initiative/work-type classification, PR deduplication, effort and manual-time allocation, and weekly merging. The existing TypeScript date helpers supply the Thursday–Wednesday windows.

## Run

Install Rust and Bun, and make the project's dependencies and stored report data available. From the repository root:

```bash
cargo fetch --locked --manifest-path benchmarks/rust-allocation/Cargo.toml
cargo test --locked --manifest-path benchmarks/rust-allocation/Cargo.toml
python3 benchmarks/rust-allocation/benchmark.py
python3 benchmarks/rust-allocation/verify-render.py
```

The benchmark uses a temporary Cargo target directory. Set `WORKLOG_RUST_BENCH_TARGET` to choose another directory or an empty one for a cold build, and `WORKLOG_RUST_OFFLINE=1` after dependencies are cached to avoid network access. Set `WORKLOG_RUST_PREVIOUS` to a previously built executable to validate and time it alongside the current variants. `DATA_DIR` and `CONFIG_PATH` can select another report archive and configuration. On this workspace, the temporary toolchain is at `/private/tmp/worklog-cargo/bin/cargo` with `CARGO_HOME=/private/tmp/worklog-cargo` and `RUSTUP_HOME=/private/tmp/worklog-rustup`.

The harness reads private report data and sends it through subprocess pipes; it prints only aggregate counts, timings, and mismatch paths. It does not contact GitHub or write report data into this directory. It checks all output objects against TypeScript with relative and absolute numeric tolerance `1e-12`, then times eleven runs per variant. A mismatch stops the comparison before any speedup is claimed. `verify-render.py` compiles the current source in a temporary directory and substitutes Rust results into a copy of that renderer, compares every generated file with the unmodified renderer, and removes the temporary report data afterwards.

## Local result

On an Apple Silicon Mac, with 90 stored reports and 109 daily/week trend requests, complete allocation and trend output matched in the corpus and ten synthetic cases: PR movement/deduplication, manual-only time, locale ties/stress, case-colliding config keys, a non-ASCII label prefix, rounding with multiple PR moves, latest PR metadata, comment-only PR metadata, and reviews with comments on the same PR. The following timings are from the prior nine-case run, before the final review-and-comment fix; the current ten-case run also matched.

| Variant | Elapsed | CPU |
| --- | ---: | ---: |
| Uncached TypeScript | 0.234 s | 0.401 s |
| Cached TypeScript benchmark | 0.078 s | 0.117 s |
| Improved Rust process directly | 0.059 s | 0.050 s |
| Improved Rust through Bun, including the JSON boundary | 0.113 s | 0.109 s |

CPU is user plus system time for the process tree, so concurrent work can exceed elapsed time. The snapshot was 2.8 MB and the result was about 12.0 MB. A first release build into a fresh target directory took 8.2 s elapsed / 52.7 s CPU with dependencies already downloaded; an unchanged warm build took 0.04 s. Snapshot preparation, common to all variants, took about 0.50 s elapsed / 0.92 s CPU and is not included in the variant timings. Substituting Rust allocations and trends into a temporary renderer produced all 226 site files byte-identically to the TypeScript renderer. These are local measurements, not GitHub Actions timings.

## Limits

- These timings cover allocation and trends, not the complete report render or GitHub collection. All variants receive pre-serialized input; the Bun/Rust variant additionally pays the measured process and JSON boundary cost.
- Comparison covers the corpus and named edge cases, not every possible configuration. Rust uses ICU root collation; JavaScript `localeCompare` can follow a different default locale. Rust strings cannot represent unpaired UTF-16 surrogates. A production port needs broader locale, Unicode, timestamp, failure, and output-parity testing.
- The Rust prototype has separate dependencies and platform-specific distribution/build costs. Direct Rust was faster in this isolated benchmark, but through Bun its elapsed time was higher than cached TypeScript. This experiment does not establish a full-render or CI benefit from switching the production path.

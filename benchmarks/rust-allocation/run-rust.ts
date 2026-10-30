// Include the host-to-Rust JSON boundary and result decoding in the measurement.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const input = JSON.parse(readFileSync(0, "utf8"));
const result = spawnSync(process.argv[2], {
  input: JSON.stringify(input), encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
});
if (result.status !== 0) throw new Error(result.stderr || `Rust process exited ${result.status}`);
process.stdout.write(JSON.stringify(JSON.parse(result.stdout)));

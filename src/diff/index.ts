import { compareSnapshots } from "./compare.js";
import { loadSnapshotForDiff } from "./snapshot.js";
import { writeDiffReport } from "./report.js";
import type { DiffOutputPaths, DiffReport } from "./types.js";

export interface RunDiffOptions {
  from: string;
  to: string;
  rootDir: string;
  outputDir: string;
}

export interface RunDiffResult {
  report: DiffReport;
  output: DiffOutputPaths;
}

export async function runDiff(options: RunDiffOptions): Promise<RunDiffResult> {
  const fromSnapshot = await loadSnapshotForDiff(options.from, options.rootDir);
  const toSnapshot = await loadSnapshotForDiff(options.to, options.rootDir);
  const report = compareSnapshots(fromSnapshot, toSnapshot);
  const output = await writeDiffReport(report, options.outputDir);
  return { report, output };
}

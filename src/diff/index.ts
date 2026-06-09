import { compareSnapshots } from "./compare.js";
import { loadSnapshotForDiff } from "./snapshot.js";
import { writeDiffReport } from "./report.js";
import { applyApiGroups } from "../grouping/apply.js";
import { loadApiGroupsConfig } from "../grouping/config.js";
import type { DiffOutputPaths, DiffReport } from "./types.js";

export interface RunDiffOptions {
  from: string;
  to: string;
  rootDir: string;
  outputDir: string;
  groupsConfig: string;
}

export interface RunDiffResult {
  report: DiffReport;
  output: DiffOutputPaths;
}

export async function runDiff(options: RunDiffOptions): Promise<RunDiffResult> {
  const fromSnapshot = await loadSnapshotForDiff(options.from, options.rootDir);
  const toSnapshot = await loadSnapshotForDiff(options.to, options.rootDir);
  const groupsConfig = await loadApiGroupsConfig(options.groupsConfig);
  const report = applyApiGroups(compareSnapshots(fromSnapshot, toSnapshot), fromSnapshot, toSnapshot, groupsConfig);
  const output = await writeDiffReport(report, options.outputDir);
  return { report, output };
}

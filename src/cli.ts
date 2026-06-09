import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSourcesConfig, resolveSource } from "./config.js";
import { runDiff } from "./diff/index.js";
import { createSnapshot } from "./snapshot.js";
import type { CliOptions, DiffCliOptions, ResolvedDiffCliOptions } from "./types.js";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function usage(): string {
  return [
    "Usage:",
    "  npm run snapshot -- [options]",
    "  npm run diff -- <from-snapshot> <to-snapshot>",
    "  npm run cli -- snapshot [options]",
    "  npm run cli -- diff --from <snapshot> --to <snapshot>",
    "",
    "Snapshot options:",
    "  --source <key>         Source key from config/sources.json. Defaults to config.default.",
    "  --url <url>            Custom OpenAPI JSON URL. Overrides --source.",
    "  --snapshot-id <id>     Folder name under snapshots/. Defaults to current Vietnam timestamp.",
    "  --output-dir <path>    Snapshot output directory. Defaults to ./snapshots.",
    "  --config <path>        Sources config path. Defaults to ./config/sources.json.",
    "  --timeout <seconds>    HTTP timeout. Defaults to 30.",
    "",
    "Diff options:",
    "  --from <snapshot>      Snapshot id, directory, or openapi.json path.",
    "  --to <snapshot>        Snapshot id, directory, or openapi.json path.",
    "  --output-dir <path>    Report output directory. Defaults to ./reports.",
    "  --groups-config <path> API grouping config. Defaults to ./config/api-groups.json.",
    "",
    "  -h, --help             Show this help.",
  ].join("\n");
}

function readOptionValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${option}`);
  }
  return value;
}

function parseSnapshotOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    outputDir: resolve(ROOT_DIR, "snapshots"),
    config: resolve(ROOT_DIR, "config", "sources.json"),
    timeout: 30,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--source":
        options.source = readOptionValue(args, index, arg);
        index += 1;
        break;
      case "--url":
        options.url = readOptionValue(args, index, arg);
        index += 1;
        break;
      case "--snapshot-id":
        options.snapshotId = readOptionValue(args, index, arg);
        index += 1;
        break;
      case "--output-dir":
        options.outputDir = resolve(readOptionValue(args, index, arg));
        index += 1;
        break;
      case "--config":
        options.config = resolve(readOptionValue(args, index, arg));
        index += 1;
        break;
      case "--timeout": {
        const timeout = Number(readOptionValue(args, index, arg));
        if (!Number.isFinite(timeout) || timeout <= 0) {
          throw new Error("--timeout must be a positive number.");
        }
        options.timeout = timeout;
        index += 1;
        break;
      }
      case "-h":
      case "--help":
        console.log(usage());
        process.exit(0);
      default:
        if (!arg.startsWith("-") && !options.snapshotId) {
          options.snapshotId = arg;
          break;
        }
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parseDiffOptions(args: string[]): ResolvedDiffCliOptions {
  const options: DiffCliOptions = {
    outputDir: resolve(ROOT_DIR, "reports"),
    groupsConfig: resolve(ROOT_DIR, "config", "api-groups.json"),
  };
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--from":
        options.from = readOptionValue(args, index, arg);
        index += 1;
        break;
      case "--to":
        options.to = readOptionValue(args, index, arg);
        index += 1;
        break;
      case "--output-dir":
        options.outputDir = resolve(readOptionValue(args, index, arg));
        index += 1;
        break;
      case "--groups-config":
        options.groupsConfig = resolve(readOptionValue(args, index, arg));
        index += 1;
        break;
      case "-h":
      case "--help":
        console.log(usage());
        process.exit(0);
      default:
        if (!arg.startsWith("-")) {
          positional.push(arg);
          break;
        }
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.from ??= positional[0];
  options.to ??= positional[1];

  if (!options.from || !options.to) {
    throw new Error("Diff requires --from/--to or two positional snapshot arguments.");
  }

  return {
    from: options.from,
    to: options.to,
    outputDir: options.outputDir,
    groupsConfig: options.groupsConfig,
  };
}

async function runSnapshot(args: string[]): Promise<void> {
  const options = parseSnapshotOptions(args);
  const config = await loadSourcesConfig(options.config);
  const source = resolveSource(config, options.source, options.url);
  const { snapshotDir, manifest } = await createSnapshot({
    source,
    outputDir: options.outputDir,
    snapshotId: options.snapshotId,
    timeout: options.timeout,
  });

  const summary = {
    snapshot_dir: snapshotDir,
    source: manifest.source.openapi_url,
    fetched_at: manifest.fetched_at,
    openapi: manifest.openapi,
    openapi_sha256: manifest.checksums.openapi_sha256,
    contract_sha256: manifest.checksums.contract_sha256,
  };
  console.log(JSON.stringify(summary, null, 2));
}

async function runDiffCommand(args: string[]): Promise<void> {
  const options = parseDiffOptions(args);
  const { report, output } = await runDiff({
    from: options.from,
    to: options.to,
    rootDir: ROOT_DIR,
    outputDir: options.outputDir,
    groupsConfig: options.groupsConfig,
  });

  const summary = {
    from: report.from.id,
    to: report.to.id,
    contract_changed: report.summary.contract_changed,
    raw_changed: report.summary.raw_changed,
    total_changes: report.summary.total_changes,
    breaking: report.summary.by_severity.BREAKING,
    review_required: report.summary.by_severity.REVIEW_REQUIRED,
    non_breaking: report.summary.by_severity.NON_BREAKING,
    doc_only: report.summary.by_severity.DOC_ONLY,
    operations: report.summary.operations,
    schemas: report.summary.schemas,
    by_group: report.summary.by_group,
    reports: output,
  };
  console.log(JSON.stringify(summary, null, 2));
}

async function main(): Promise<void> {
  const [command = "help", ...args] = process.argv.slice(2);

  if (command === "snapshot") {
    await runSnapshot(args);
    return;
  }

  if (command === "diff") {
    await runDiffCommand(args);
    return;
  }

  if (command === "help" || command === "-h" || command === "--help") {
    console.log(usage());
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

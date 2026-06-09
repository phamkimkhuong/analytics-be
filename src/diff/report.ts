import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stableJsonString } from "../json.js";
import type { DiffChange, DiffOutputPaths, DiffReport, Severity } from "./types.js";

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._+-]+/g, "-");
}

function severityRank(severity: Severity): number {
  switch (severity) {
    case "BREAKING":
      return 0;
    case "REVIEW_REQUIRED":
      return 1;
    case "NON_BREAKING":
      return 2;
    case "DOC_ONLY":
      return 3;
  }
}

function sortedChanges(changes: DiffChange[]): DiffChange[] {
  return [...changes].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.subject.localeCompare(b.subject) || a.key.localeCompare(b.key));
}

function renderChange(change: DiffChange): string[] {
  const lines = [`### [${change.severity}] ${change.title}`, "", `- Kind: \`${change.kind}\``, `- Key: \`${change.key}\``];
  if (change.tags && change.tags.length > 0) {
    lines.push(`- Tags: ${change.tags.map((tag) => `\`${tag}\``).join(", ")}`);
  }
  for (const detail of change.details) {
    lines.push(`- ${detail}`);
  }
  lines.push("");
  return lines;
}

export function renderMarkdownReport(report: DiffReport): string {
  const lines: string[] = [
    "# OpenAPI Diff Report",
    "",
    `Generated at: ${report.generated_at}`,
    "",
    "## Snapshot Range",
    "",
    `- From: \`${report.from.id}\``,
    `- To: \`${report.to.id}\``,
    `- Raw changed: \`${report.summary.raw_changed}\``,
    `- Contract changed: \`${report.summary.contract_changed}\``,
    `- From contract SHA256: \`${report.from.contract_sha256}\``,
    `- To contract SHA256: \`${report.to.contract_sha256}\``,
    "",
    "## Summary",
    "",
    `- Total changes: ${report.summary.total_changes}`,
    `- Breaking: ${report.summary.by_severity.BREAKING}`,
    `- Review required: ${report.summary.by_severity.REVIEW_REQUIRED}`,
    `- Non-breaking: ${report.summary.by_severity.NON_BREAKING}`,
    `- Doc/raw-only: ${report.summary.by_severity.DOC_ONLY}`,
    `- Operations: +${report.summary.operations.added} / -${report.summary.operations.removed} / ~${report.summary.operations.changed} / unchanged ${report.summary.operations.unchanged}`,
    `- Schemas: +${report.summary.schemas.added} / -${report.summary.schemas.removed} / ~${report.summary.schemas.changed} / unchanged ${report.summary.schemas.unchanged}`,
    "",
  ];

  if (report.changes.length === 0) {
    lines.push("## Changes", "", "No contract changes detected.", "");
    return lines.join("\n");
  }

  lines.push("## Changes", "");
  for (const change of sortedChanges(report.changes)) {
    lines.push(...renderChange(change));
  }
  return lines.join("\n");
}

export async function writeDiffReport(report: DiffReport, outputDir: string): Promise<DiffOutputPaths> {
  await mkdir(outputDir, { recursive: true });
  const baseName = `diff-${sanitizeFilePart(report.from.id)}-to-${sanitizeFilePart(report.to.id)}`;
  const jsonPath = join(outputDir, `${baseName}.json`);
  const markdownPath = join(outputDir, `${baseName}.md`);

  await writeFile(jsonPath, stableJsonString(report), "utf8");
  await writeFile(markdownPath, renderMarkdownReport(report), "utf8");

  return {
    json: jsonPath,
    markdown: markdownPath,
  };
}

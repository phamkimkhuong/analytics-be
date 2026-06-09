import type { ChangeKind, DiffChange, DiffReport, GroupSummary, OperationContract, Severity, SnapshotForDiff } from "../diff/types.js";
import type { ApiGroupsConfig } from "./types.js";

const DEFAULT_FALLBACK_GROUP = "Ungrouped";
const DEFAULT_RAW_SPEC_GROUP = "Spec Metadata";

function normalizedConfig(config: ApiGroupsConfig): Required<ApiGroupsConfig> {
  return {
    fallback_group: config.fallback_group ?? DEFAULT_FALLBACK_GROUP,
    raw_spec_group: config.raw_spec_group ?? DEFAULT_RAW_SPEC_GROUP,
    groups: config.groups ?? [],
  };
}

function emptySeverityCounts(): Record<Severity, number> {
  return {
    BREAKING: 0,
    REVIEW_REQUIRED: 0,
    NON_BREAKING: 0,
    DOC_ONLY: 0,
  };
}

function emptyKindCounts(): Record<ChangeKind, number> {
  return {
    operation_added: 0,
    operation_removed: 0,
    operation_changed: 0,
    schema_added: 0,
    schema_removed: 0,
    schema_changed: 0,
    raw_only_changed: 0,
  };
}

function emptyGroupSummary(): GroupSummary {
  return {
    total_changes: 0,
    by_severity: emptySeverityCounts(),
    by_kind: emptyKindCounts(),
  };
}

function matchesTags(tags: string[] | undefined, expectedTags: string[] | undefined): boolean {
  if (!tags || tags.length === 0 || !expectedTags || expectedTags.length === 0) {
    return false;
  }
  const actual = new Set(tags);
  return expectedTags.some((tag) => actual.has(tag));
}

function matchesPath(path: string | undefined, prefixes: string[] | undefined): boolean {
  if (!path || !prefixes || prefixes.length === 0) {
    return false;
  }
  const normalizedPath = path.toLowerCase();
  return prefixes.some((prefix) => normalizedPath.startsWith(prefix.toLowerCase()));
}

function matchesSchemaName(schemaName: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(schemaName);
    } catch {
      return schemaName.toLowerCase().includes(pattern.toLowerCase());
    }
  });
}

function operationGroups(operation: Pick<OperationContract, "tags" | "path">, config: Required<ApiGroupsConfig>): string[] {
  const groups = new Set<string>();

  for (const group of config.groups) {
    if (matchesTags(operation.tags, group.tags) || matchesPath(operation.path, group.path_prefixes)) {
      groups.add(group.name);
    }
  }

  return [...groups].sort();
}

function collectSchemaRefs(value: unknown, refs: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSchemaRefs(item, refs));
    return;
  }

  if (typeof value !== "object" || value === null) {
    return;
  }

  const object = value as Record<string, unknown>;
  if (typeof object.$ref === "string") {
    const match = object.$ref.match(/^#\/components\/schemas\/(.+)$/);
    if (match?.[1]) {
      refs.add(decodeURIComponent(match[1]));
    }
  }

  Object.values(object).forEach((child) => collectSchemaRefs(child, refs));
}

function schemaOperationGroups(snapshot: SnapshotForDiff, config: Required<ApiGroupsConfig>): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  for (const operation of snapshot.operations.values()) {
    const refs = new Set<string>();
    collectSchemaRefs(operation.contract, refs);
    const groups = operationGroups(operation, config);
    if (groups.length === 0) {
      continue;
    }

    for (const schemaName of refs) {
      const existing = map.get(schemaName) ?? new Set<string>();
      groups.forEach((group) => existing.add(group));
      map.set(schemaName, existing);
    }
  }

  return map;
}

function mergedSchemaOperationGroups(from: SnapshotForDiff, to: SnapshotForDiff, config: Required<ApiGroupsConfig>): Map<string, Set<string>> {
  const merged = new Map<string, Set<string>>();

  for (const source of [schemaOperationGroups(from, config), schemaOperationGroups(to, config)]) {
    for (const [schemaName, groups] of source.entries()) {
      const existing = merged.get(schemaName) ?? new Set<string>();
      groups.forEach((group) => existing.add(group));
      merged.set(schemaName, existing);
    }
  }

  return merged;
}

function schemaGroups(schemaName: string, config: Required<ApiGroupsConfig>, schemaUsageGroups: Map<string, Set<string>>): string[] {
  const groups = new Set<string>(schemaUsageGroups.get(schemaName) ?? []);

  for (const group of config.groups) {
    if (matchesSchemaName(schemaName, group.schema_name_patterns)) {
      groups.add(group.name);
    }
  }

  return [...groups].sort();
}

function resolveChangeGroups(change: DiffChange, config: Required<ApiGroupsConfig>, schemaUsageGroups: Map<string, Set<string>>): string[] {
  if (change.subject === "spec") {
    return [config.raw_spec_group];
  }

  if (change.subject === "operation") {
    return operationGroups({ tags: change.tags ?? [], path: change.path ?? "" }, config);
  }

  return schemaGroups(change.key, config, schemaUsageGroups);
}

function summarizeGroups(changes: DiffChange[], fallbackGroup: string): Record<string, GroupSummary> {
  const summary: Record<string, GroupSummary> = {};

  for (const change of changes) {
    const groups = change.groups && change.groups.length > 0 ? change.groups : [fallbackGroup];
    for (const group of groups) {
      summary[group] ??= emptyGroupSummary();
      summary[group].total_changes += 1;
      summary[group].by_severity[change.severity] += 1;
      summary[group].by_kind[change.kind] += 1;
    }
  }

  return Object.fromEntries(Object.entries(summary).sort(([left], [right]) => left.localeCompare(right)));
}

export function applyApiGroups(report: DiffReport, from: SnapshotForDiff, to: SnapshotForDiff, apiGroupsConfig: ApiGroupsConfig): DiffReport {
  const config = normalizedConfig(apiGroupsConfig);
  const schemaUsageGroups = mergedSchemaOperationGroups(from, to, config);

  for (const change of report.changes) {
    const groups = resolveChangeGroups(change, config, schemaUsageGroups);
    change.groups = groups.length > 0 ? groups : [config.fallback_group];
  }

  report.summary.by_group = summarizeGroups(report.changes, config.fallback_group);
  return report;
}

import { stableJsonString } from "../json.js";
import { formatVietnamIso } from "../time.js";
import { describeDetailedSchemaChange } from "./schema.js";
import { maxSeverity } from "./severity.js";
import type { DiffChange, DiffReport, DiffSummary, OperationContract, SchemaContract, Severity, SnapshotForDiff } from "./types.js";

function sameJson(left: unknown, right: unknown): boolean {
  return stableJsonString(left) === stableJsonString(right);
}

function changeId(kind: string, key: string): string {
  return `${kind}:${key}`;
}

function parameterKey(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const object = value as Record<string, unknown>;
  if (typeof object.name !== "string" || typeof object.in !== "string") {
    return undefined;
  }
  return `${object.in}:${object.name}`;
}

function isRequiredParameter(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return (value as Record<string, unknown>).required === true;
}

function indexedParameters(value: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (!Array.isArray(value)) {
    return map;
  }
  value.forEach((parameter, index) => {
    map.set(parameterKey(parameter) ?? `#${index}`, parameter);
  });
  return map;
}

function describeParameterChanges(from: OperationContract, to: OperationContract): { details: string[]; severities: Severity[] } {
  const details: string[] = [];
  const severities: Severity[] = [];
  const fromParams = indexedParameters(from.parameters);
  const toParams = indexedParameters(to.parameters);
  const allKeys = new Set([...fromParams.keys(), ...toParams.keys()]);

  for (const key of [...allKeys].sort()) {
    const before = fromParams.get(key);
    const after = toParams.get(key);
    if (before === undefined && after !== undefined) {
      const severity: Severity = isRequiredParameter(after) ? "BREAKING" : "NON_BREAKING";
      severities.push(severity);
      details.push(`Parameter added: ${key}${isRequiredParameter(after) ? " (required)" : " (optional)"}.`);
      continue;
    }
    if (before !== undefined && after === undefined) {
      severities.push("BREAKING");
      details.push(`Parameter removed: ${key}.`);
      continue;
    }
    if (before !== undefined && after !== undefined && !sameJson(before, after)) {
      const wasRequired = isRequiredParameter(before);
      const isRequired = isRequiredParameter(after);
      const severity: Severity = !wasRequired && isRequired ? "BREAKING" : "REVIEW_REQUIRED";
      severities.push(severity);
      details.push(`Parameter changed: ${key}.`);
    }
  }

  return { details, severities };
}

function requestBodyRequired(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return (value as Record<string, unknown>).required === true;
}

function responseStatusMap(value: unknown): Map<string, unknown> {
  const map = new Map<string, unknown>();
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return map;
  }
  for (const [status, response] of Object.entries(value)) {
    map.set(status, response);
  }
  return map;
}

function describeResponseChanges(from: OperationContract, to: OperationContract): { details: string[]; severities: Severity[] } {
  const details: string[] = [];
  const severities: Severity[] = [];
  const fromResponses = responseStatusMap(from.responses);
  const toResponses = responseStatusMap(to.responses);
  const allStatuses = new Set([...fromResponses.keys(), ...toResponses.keys()]);

  for (const status of [...allStatuses].sort()) {
    const before = fromResponses.get(status);
    const after = toResponses.get(status);
    if (before === undefined && after !== undefined) {
      severities.push("NON_BREAKING");
      details.push(`Response status added: ${status}.`);
      continue;
    }
    if (before !== undefined && after === undefined) {
      severities.push("BREAKING");
      details.push(`Response status removed: ${status}.`);
      continue;
    }
    if (before !== undefined && after !== undefined && !sameJson(before, after)) {
      severities.push("REVIEW_REQUIRED");
      details.push(`Response contract changed: ${status}.`);
    }
  }

  return { details, severities };
}

function describeOperationChange(from: OperationContract, to: OperationContract): DiffChange | undefined {
  const details: string[] = [];
  const severities: Severity[] = [];

  if (!sameJson(from.tags, to.tags)) {
    severities.push("REVIEW_REQUIRED");
    details.push(`Tags changed: [${from.tags.join(", ")}] -> [${to.tags.join(", ")}].`);
  }

  if (from.operationId !== to.operationId) {
    severities.push("REVIEW_REQUIRED");
    details.push(`operationId changed: ${from.operationId ?? "(none)"} -> ${to.operationId ?? "(none)"}.`);
  }

  const parameterChange = describeParameterChanges(from, to);
  details.push(...parameterChange.details);
  severities.push(...parameterChange.severities);

  if (!sameJson(from.requestBody, to.requestBody)) {
    if (from.requestBody === null && to.requestBody !== null) {
      severities.push(requestBodyRequired(to.requestBody) ? "BREAKING" : "NON_BREAKING");
      details.push(`Request body added${requestBodyRequired(to.requestBody) ? " and required" : ""}.`);
    } else if (from.requestBody !== null && to.requestBody === null) {
      severities.push("BREAKING");
      details.push("Request body removed.");
    } else {
      severities.push("REVIEW_REQUIRED");
      details.push("Request body contract changed.");
    }
  }

  const responseChange = describeResponseChanges(from, to);
  details.push(...responseChange.details);
  severities.push(...responseChange.severities);

  if (!sameJson(from.security, to.security)) {
    severities.push("REVIEW_REQUIRED");
    details.push("Security requirements changed.");
  }

  if (details.length === 0 && from.contractHash !== to.contractHash) {
    severities.push("REVIEW_REQUIRED");
    details.push("Operation contract changed outside tracked sections.");
  }

  if (details.length === 0) {
    return undefined;
  }

  return {
    id: changeId("operation_changed", to.key),
    kind: "operation_changed",
    severity: maxSeverity(severities),
    subject: "operation",
    key: to.key,
    method: to.method,
    path: to.path,
    tags: to.tags.length > 0 ? to.tags : from.tags,
    title: `${to.method} ${to.path} changed`,
    details,
  };
}

function compareOperations(from: SnapshotForDiff, to: SnapshotForDiff): DiffChange[] {
  const changes: DiffChange[] = [];
  const allKeys = new Set([...from.operations.keys(), ...to.operations.keys()]);

  for (const key of [...allKeys].sort()) {
    const before = from.operations.get(key);
    const after = to.operations.get(key);

    if (!before && after) {
      changes.push({
        id: changeId("operation_added", key),
        kind: "operation_added",
        severity: "NON_BREAKING",
        subject: "operation",
        key,
        method: after.method,
        path: after.path,
        tags: after.tags,
        title: `${after.method} ${after.path} added`,
        details: [`New endpoint under tags: ${after.tags.join(", ") || "(untagged)"}.`],
      });
      continue;
    }

    if (before && !after) {
      changes.push({
        id: changeId("operation_removed", key),
        kind: "operation_removed",
        severity: "BREAKING",
        subject: "operation",
        key,
        method: before.method,
        path: before.path,
        tags: before.tags,
        title: `${before.method} ${before.path} removed`,
        details: ["Endpoint no longer exists in the target OpenAPI contract."],
      });
      continue;
    }

    if (before && after && before.contractHash !== after.contractHash) {
      const change = describeOperationChange(before, after);
      if (change) {
        changes.push(change);
      }
    }
  }

  return changes;
}

function compareSchemas(from: SnapshotForDiff, to: SnapshotForDiff): DiffChange[] {
  const changes: DiffChange[] = [];
  const allNames = new Set([...from.schemas.keys(), ...to.schemas.keys()]);

  for (const name of [...allNames].sort()) {
    const before = from.schemas.get(name);
    const after = to.schemas.get(name);

    if (!before && after) {
      changes.push({
        id: changeId("schema_added", name),
        kind: "schema_added",
        severity: "NON_BREAKING",
        subject: "schema",
        key: name,
        title: `Schema ${name} added`,
        details: ["New component schema exists in target snapshot."],
      });
      continue;
    }

    if (before && !after) {
      changes.push({
        id: changeId("schema_removed", name),
        kind: "schema_removed",
        severity: "BREAKING",
        subject: "schema",
        key: name,
        title: `Schema ${name} removed`,
        details: ["Component schema no longer exists in target snapshot."],
      });
      continue;
    }

    if (before && after && before.contractHash !== after.contractHash) {
      changes.push(describeSchemaChange(name, before, after));
    }
  }

  return changes;
}

function describeSchemaChange(name: string, before: SchemaContract, after: SchemaContract): DiffChange {
  return describeDetailedSchemaChange(name, before, after);
}

function emptySeverityCounts(): Record<Severity, number> {
  return {
    BREAKING: 0,
    REVIEW_REQUIRED: 0,
    NON_BREAKING: 0,
    DOC_ONLY: 0,
  };
}

function emptyKindCounts(): DiffSummary["by_kind"] {
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

function countUnchanged<T extends { contractHash: string }>(fromMap: Map<string, T>, toMap: Map<string, T>): number {
  let unchanged = 0;
  for (const [key, before] of fromMap.entries()) {
    const after = toMap.get(key);
    if (after && before.contractHash === after.contractHash) {
      unchanged += 1;
    }
  }
  return unchanged;
}

function buildSummary(from: SnapshotForDiff, to: SnapshotForDiff, changes: DiffChange[]): DiffSummary {
  const bySeverity = emptySeverityCounts();
  const byKind = emptyKindCounts();

  for (const change of changes) {
    bySeverity[change.severity] += 1;
    byKind[change.kind] += 1;
  }

  return {
    total_changes: changes.length,
    contract_changed: from.contractHash !== to.contractHash,
    raw_changed: from.rawHash !== to.rawHash,
    by_severity: bySeverity,
    by_kind: byKind,
    operations: {
      added: byKind.operation_added,
      removed: byKind.operation_removed,
      changed: byKind.operation_changed,
      unchanged: countUnchanged(from.operations, to.operations),
    },
    schemas: {
      added: byKind.schema_added,
      removed: byKind.schema_removed,
      changed: byKind.schema_changed,
      unchanged: countUnchanged(from.schemas, to.schemas),
    },
  };
}

function snapshotDescriptor(snapshot: SnapshotForDiff) {
  return {
    id: snapshot.id,
    dir: snapshot.dir,
    raw_sha256: snapshot.rawHash,
    contract_sha256: snapshot.contractHash,
    openapi: snapshot.manifest?.openapi,
  };
}

export function compareSnapshots(from: SnapshotForDiff, to: SnapshotForDiff): DiffReport {
  const changes = [...compareOperations(from, to), ...compareSchemas(from, to)];

  if (from.rawHash !== to.rawHash && from.contractHash === to.contractHash) {
    changes.push({
      id: changeId("raw_only_changed", `${from.id}->${to.id}`),
      kind: "raw_only_changed",
      severity: "DOC_ONLY",
      subject: "spec",
      key: `${from.id}->${to.id}`,
      title: "Raw OpenAPI changed but contract is unchanged",
      details: ["Only documentation/example/description-level content appears to differ after contract normalization."],
    });
  }

  changes.sort((a, b) => a.severity.localeCompare(b.severity) || a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));

  return {
    generated_at: formatVietnamIso(new Date()),
    from: snapshotDescriptor(from),
    to: snapshotDescriptor(to),
    summary: buildSummary(from, to, changes),
    changes,
  };
}

import { stableJsonString } from "../json.js";
import { maxSeverity } from "./severity.js";
import type { DiffChange, SchemaContract, SchemaFieldChange, SchemaFieldChangeKind, Severity } from "./types.js";

const SCALAR_SCHEMA_KEYS = [
  "type",
  "format",
  "$ref",
  "nullable",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "readOnly",
  "writeOnly",
] as const;

const COMPOSITION_KEYS = ["allOf", "anyOf", "oneOf", "not"] as const;
const MAX_SCHEMA_DETAIL_COUNT = 120;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return stableJsonString(left) === stableJsonString(right);
}

function pathJoin(base: string, child: string): string {
  return base === "$" ? `$.${child}` : `${base}.${child}`;
}

function setFromStringArray(value: unknown): Set<string> {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.map((item) => String(item)));
}

function sortedUnion(left: Iterable<string>, right: Iterable<string>): string[] {
  return [...new Set([...left, ...right])].sort();
}

function shortValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  const raw = typeof value === "string" ? value : stableJsonString(value).trim();
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function addChange(
  changes: SchemaFieldChange[],
  change: Omit<SchemaFieldChange, "message"> & { message?: string },
): void {
  if (changes.length >= MAX_SCHEMA_DETAIL_COUNT) {
    return;
  }

  const message =
    change.message ??
    `${change.kind} at ${change.path}: ${shortValue(change.before)} -> ${shortValue(change.after)}.`;
  changes.push({
    ...change,
    message,
  });
}

function compareRequired(before: Record<string, unknown>, after: Record<string, unknown>, path: string, changes: SchemaFieldChange[]): void {
  const beforeRequired = setFromStringArray(before.required);
  const afterRequired = setFromStringArray(after.required);

  for (const name of sortedUnion(beforeRequired, afterRequired)) {
    const wasRequired = beforeRequired.has(name);
    const isRequired = afterRequired.has(name);
    if (!wasRequired && isRequired) {
      addChange(changes, {
        kind: "required_added",
        severity: "REVIEW_REQUIRED",
        path: pathJoin(path, name),
        after: true,
        message: `Required field added: ${pathJoin(path, name)}. Breaking if this schema is used as a request body.`,
      });
    }
    if (wasRequired && !isRequired) {
      addChange(changes, {
        kind: "required_removed",
        severity: "REVIEW_REQUIRED",
        path: pathJoin(path, name),
        before: true,
        after: false,
        message: `Required guarantee removed: ${pathJoin(path, name)}. Review response consumers that assume this field always exists.`,
      });
    }
  }
}

function compareProperties(before: Record<string, unknown>, after: Record<string, unknown>, path: string, changes: SchemaFieldChange[]): void {
  const beforeProperties = isObject(before.properties) ? before.properties : {};
  const afterProperties = isObject(after.properties) ? after.properties : {};
  const beforeRequired = setFromStringArray(before.required);
  const afterRequired = setFromStringArray(after.required);

  for (const name of sortedUnion(Object.keys(beforeProperties), Object.keys(afterProperties))) {
    const beforeProperty = beforeProperties[name];
    const afterProperty = afterProperties[name];
    const propertyPath = pathJoin(path, name);

    if (beforeProperty === undefined && afterProperty !== undefined) {
      const isRequired = afterRequired.has(name);
      addChange(changes, {
        kind: "property_added",
        severity: isRequired ? "REVIEW_REQUIRED" : "NON_BREAKING",
        path: propertyPath,
        after: afterProperty,
        message: `Property added: ${propertyPath}${isRequired ? " (required)" : " (optional)"}.`,
      });
      continue;
    }

    if (beforeProperty !== undefined && afterProperty === undefined) {
      addChange(changes, {
        kind: "property_removed",
        severity: "REVIEW_REQUIRED",
        path: propertyPath,
        before: beforeProperty,
        message: `Property removed: ${propertyPath}. Review app models, Zod schemas, and UI rendering that read this field.`,
      });
      continue;
    }

    if (beforeProperty !== undefined && afterProperty !== undefined) {
      compareSchemaNode(beforeProperty, afterProperty, propertyPath, changes);
    }

    if (!beforeRequired.has(name) && afterRequired.has(name)) {
      addChange(changes, {
        kind: "required_added",
        severity: "REVIEW_REQUIRED",
        path: propertyPath,
        after: true,
        message: `Property became required: ${propertyPath}. Breaking if this schema is used as a request body.`,
      });
    }
    if (beforeRequired.has(name) && !afterRequired.has(name)) {
      addChange(changes, {
        kind: "required_removed",
        severity: "REVIEW_REQUIRED",
        path: propertyPath,
        before: true,
        after: false,
        message: `Property no longer required: ${propertyPath}. Review response assumptions and generated types.`,
      });
    }
  }
}

function compareScalarKey(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  key: string,
  path: string,
  changes: SchemaFieldChange[],
): void {
  if (sameJson(before[key], after[key])) {
    return;
  }

  let kind: SchemaFieldChangeKind = "constraint_changed";
  if (key === "type") {
    kind = "type_changed";
  } else if (key === "format") {
    kind = "format_changed";
  } else if (key === "$ref") {
    kind = "ref_changed";
  }

  addChange(changes, {
    kind,
    severity: "REVIEW_REQUIRED",
    path: pathJoin(path, key),
    before: before[key],
    after: after[key],
    message: `${key} changed at ${path}: ${shortValue(before[key])} -> ${shortValue(after[key])}.`,
  });
}

function compareEnum(before: Record<string, unknown>, after: Record<string, unknown>, path: string, changes: SchemaFieldChange[]): void {
  const beforeEnum = Array.isArray(before.enum) ? new Set(before.enum.map((item) => stableJsonString(item))) : new Set<string>();
  const afterEnum = Array.isArray(after.enum) ? new Set(after.enum.map((item) => stableJsonString(item))) : new Set<string>();

  for (const value of sortedUnion(beforeEnum, afterEnum)) {
    const existed = beforeEnum.has(value);
    const exists = afterEnum.has(value);
    if (!existed && exists) {
      addChange(changes, {
        kind: "enum_added",
        severity: "REVIEW_REQUIRED",
        path: pathJoin(path, "enum"),
        after: JSON.parse(value),
        message: `Enum value added at ${path}: ${shortValue(JSON.parse(value))}. Review exhaustive UI/state handling.`,
      });
    }
    if (existed && !exists) {
      addChange(changes, {
        kind: "enum_removed",
        severity: "REVIEW_REQUIRED",
        path: pathJoin(path, "enum"),
        before: JSON.parse(value),
        message: `Enum value removed at ${path}: ${shortValue(JSON.parse(value))}. Review requests that may still send it.`,
      });
    }
  }
}

function compareArrayByIndex(
  before: unknown,
  after: unknown,
  path: string,
  kind: SchemaFieldChangeKind,
  changes: SchemaFieldChange[],
): void {
  if (sameJson(before, after)) {
    return;
  }

  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) {
    addChange(changes, {
      kind,
      severity: "REVIEW_REQUIRED",
      path,
      before,
      after,
      message: `Composition changed at ${path}: ${shortValue(before)} -> ${shortValue(after)}.`,
    });
    return;
  }

  for (let index = 0; index < before.length; index += 1) {
    compareSchemaNode(before[index], after[index], `${path}[${index}]`, changes);
  }
}

export function compareSchemaNode(before: unknown, after: unknown, path: string, changes: SchemaFieldChange[]): void {
  if (sameJson(before, after)) {
    return;
  }

  if (!isObject(before) || !isObject(after)) {
    addChange(changes, {
      kind: "value_changed",
      severity: "REVIEW_REQUIRED",
      path,
      before,
      after,
    });
    return;
  }

  for (const key of SCALAR_SCHEMA_KEYS) {
    compareScalarKey(before, after, key, path, changes);
  }

  compareEnum(before, after, path, changes);
  compareRequired(before, after, path, changes);
  compareProperties(before, after, path, changes);

  if (!sameJson(before.items, after.items)) {
    if (isObject(before.items) && isObject(after.items)) {
      compareSchemaNode(before.items, after.items, pathJoin(path, "items"), changes);
    } else {
      addChange(changes, {
        kind: "items_changed",
        severity: "REVIEW_REQUIRED",
        path: pathJoin(path, "items"),
        before: before.items,
        after: after.items,
      });
    }
  }

  if (!sameJson(before.additionalProperties, after.additionalProperties)) {
    if (isObject(before.additionalProperties) && isObject(after.additionalProperties)) {
      compareSchemaNode(before.additionalProperties, after.additionalProperties, pathJoin(path, "additionalProperties"), changes);
    } else {
      addChange(changes, {
        kind: "additional_properties_changed",
        severity: "REVIEW_REQUIRED",
        path: pathJoin(path, "additionalProperties"),
        before: before.additionalProperties,
        after: after.additionalProperties,
      });
    }
  }

  for (const key of COMPOSITION_KEYS) {
    compareArrayByIndex(before[key], after[key], pathJoin(path, key), "composition_changed", changes);
  }
}

export function describeDetailedSchemaChange(name: string, before: SchemaContract, after: SchemaContract): DiffChange {
  const schemaChanges: SchemaFieldChange[] = [];
  compareSchemaNode(before.contract, after.contract, "$", schemaChanges);
  const severities = schemaChanges.map((change) => change.severity);
  const severity = severities.length > 0 ? maxSeverity(severities) : "REVIEW_REQUIRED";
  const details =
    schemaChanges.length > 0
      ? schemaChanges.map((change) => `[${change.severity}] ${change.message}`)
      : [`Schema contract hash changed: ${before.contractHash.slice(0, 12)} -> ${after.contractHash.slice(0, 12)}.`];

  if (schemaChanges.length >= MAX_SCHEMA_DETAIL_COUNT) {
    details.push(`Schema diff truncated after ${MAX_SCHEMA_DETAIL_COUNT} field-level changes.`);
  }

  return {
    id: `schema_changed:${name}`,
    kind: "schema_changed",
    severity,
    subject: "schema",
    key: name,
    title: `Schema ${name} changed`,
    details,
    schema_changes: schemaChanges,
    before: before.contract,
    after: after.contract,
  };
}

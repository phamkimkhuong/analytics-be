import type { JsonObject } from "../types.js";

export type Severity = "BREAKING" | "REVIEW_REQUIRED" | "NON_BREAKING" | "DOC_ONLY";

export type ChangeKind =
  | "operation_added"
  | "operation_removed"
  | "operation_changed"
  | "schema_added"
  | "schema_removed"
  | "schema_changed"
  | "raw_only_changed";

export type SchemaFieldChangeKind =
  | "property_added"
  | "property_removed"
  | "required_added"
  | "required_removed"
  | "type_changed"
  | "format_changed"
  | "ref_changed"
  | "enum_added"
  | "enum_removed"
  | "constraint_changed"
  | "composition_changed"
  | "items_changed"
  | "additional_properties_changed"
  | "value_changed";

export interface OperationContract {
  key: string;
  method: string;
  path: string;
  operationId?: string;
  tags: string[];
  parameters: unknown;
  requestBody: unknown;
  responses: unknown;
  security: unknown;
  contract: unknown;
  contractHash: string;
}

export interface SchemaContract {
  name: string;
  contract: unknown;
  contractHash: string;
}

export interface SnapshotForDiff {
  id: string;
  dir: string;
  manifest?: JsonObject;
  spec: JsonObject;
  rawHash: string;
  contractHash: string;
  operations: Map<string, OperationContract>;
  schemas: Map<string, SchemaContract>;
}

export interface DiffChange {
  id: string;
  kind: ChangeKind;
  severity: Severity;
  subject: "operation" | "schema" | "spec";
  key: string;
  method?: string;
  path?: string;
  tags?: string[];
  groups?: string[];
  title: string;
  details: string[];
  schema_changes?: SchemaFieldChange[];
  before?: unknown;
  after?: unknown;
}

export interface SchemaFieldChange {
  kind: SchemaFieldChangeKind;
  severity: Severity;
  path: string;
  message: string;
  before?: unknown;
  after?: unknown;
}

export interface GroupSummary {
  total_changes: number;
  by_severity: Record<Severity, number>;
  by_kind: Record<ChangeKind, number>;
}

export interface DiffSummary {
  total_changes: number;
  contract_changed: boolean;
  raw_changed: boolean;
  by_severity: Record<Severity, number>;
  by_kind: Record<ChangeKind, number>;
  by_group: Record<string, GroupSummary>;
  operations: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
  schemas: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
  };
}

export interface DiffReport {
  generated_at: string;
  from: SnapshotDescriptor;
  to: SnapshotDescriptor;
  summary: DiffSummary;
  changes: DiffChange[];
}

export interface SnapshotDescriptor {
  id: string;
  dir: string;
  raw_sha256: string;
  contract_sha256: string;
  openapi?: unknown;
  fetched_at?: string;
}

export interface DiffOutputPaths {
  json: string;
  markdown: string;
}

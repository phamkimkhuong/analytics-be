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
  title: string;
  details: string[];
}

export interface DiffSummary {
  total_changes: number;
  contract_changed: boolean;
  raw_changed: boolean;
  by_severity: Record<Severity, number>;
  by_kind: Record<ChangeKind, number>;
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
}

export interface DiffOutputPaths {
  json: string;
  markdown: string;
}

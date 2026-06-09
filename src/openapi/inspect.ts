import { HTTP_METHODS } from "../constants.js";
import type { JsonObject } from "../types.js";

export interface OpenApiStats {
  version: unknown;
  title: unknown;
  api_version: unknown;
  path_count: number;
  operation_count: number;
  schema_count: number;
  tag_count: number;
  method_counts: Record<string, number>;
  tag_counts: Array<{ tag: string; operations: number }>;
  security_schemes: string[];
}

function getObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function increment(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function sortedRecord(counter: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...counter.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function sortedTags(counter: Map<string, number>): Array<{ tag: string; operations: number }> {
  return [...counter.entries()]
    .sort(([tagA, countA], [tagB, countB]) => countB - countA || tagA.localeCompare(tagB))
    .map(([tag, operations]) => ({ tag, operations }));
}

export function inspectOpenApi(spec: JsonObject): OpenApiStats {
  const paths = getObject(spec.paths) ?? {};
  const info = getObject(spec.info) ?? {};
  const components = getObject(spec.components) ?? {};
  const schemas = getObject(components.schemas) ?? {};
  const securitySchemes = getObject(components.securitySchemes) ?? {};

  let operationCount = 0;
  const tagCounter = new Map<string, number>();
  const methodCounter = new Map<string, number>();

  for (const pathItem of Object.values(paths)) {
    const methods = getObject(pathItem);
    if (!methods) {
      continue;
    }

    for (const [method, operation] of Object.entries(methods)) {
      const methodKey = method.toLowerCase();
      if (!HTTP_METHODS.has(methodKey) || !getObject(operation)) {
        continue;
      }

      operationCount += 1;
      increment(methodCounter, methodKey.toUpperCase());

      const operationObject = operation as JsonObject;
      const tags = Array.isArray(operationObject.tags) && operationObject.tags.length > 0 ? operationObject.tags : ["__untagged__"];
      for (const tag of tags) {
        increment(tagCounter, String(tag));
      }
    }
  }

  return {
    version: spec.openapi,
    title: info.title,
    api_version: info.version,
    path_count: Object.keys(paths).length,
    operation_count: operationCount,
    schema_count: Object.keys(schemas).length,
    tag_count: tagCounter.size,
    method_counts: sortedRecord(methodCounter),
    tag_counts: sortedTags(tagCounter),
    security_schemes: Object.keys(securitySchemes).sort(),
  };
}

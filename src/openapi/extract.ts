import { HTTP_METHODS } from "../constants.js";
import { sha256 } from "../hash.js";
import { stableJsonString } from "../json.js";
import { normalizeOpenApiContract } from "./normalize.js";
import type { OperationContract, SchemaContract } from "../diff/types.js";
import type { JsonObject } from "../types.js";

function getObject(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function getTags(operation: JsonObject): string[] {
  if (!Array.isArray(operation.tags)) {
    return [];
  }
  return operation.tags.map((tag) => String(tag));
}

function effectiveParameters(pathItem: JsonObject, operation: JsonObject): unknown[] {
  const pathParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
  const operationParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
  return [...pathParameters, ...operationParameters];
}

function hashContract(value: unknown): string {
  return sha256(stableJsonString(value));
}

export function extractOperations(spec: JsonObject): Map<string, OperationContract> {
  const paths = getObject(spec.paths) ?? {};
  const globalSecurity = spec.security ?? [];
  const operations = new Map<string, OperationContract>();

  for (const [path, pathItemValue] of Object.entries(paths)) {
    const pathItem = getObject(pathItemValue);
    if (!pathItem) {
      continue;
    }

    for (const [method, operationValue] of Object.entries(pathItem)) {
      const methodKey = method.toLowerCase();
      const operation = getObject(operationValue);
      if (!HTTP_METHODS.has(methodKey) || !operation) {
        continue;
      }

      const normalizedParameters = normalizeOpenApiContract(effectiveParameters(pathItem, operation));
      const normalizedRequestBody = normalizeOpenApiContract(operation.requestBody ?? null);
      const normalizedResponses = normalizeOpenApiContract(operation.responses ?? {});
      const normalizedSecurity = normalizeOpenApiContract(operation.security ?? globalSecurity);
      const normalizedOperation = normalizeOpenApiContract({
        ...operation,
        parameters: normalizedParameters,
        requestBody: normalizedRequestBody,
        responses: normalizedResponses,
        security: normalizedSecurity,
      });
      const methodName = methodKey.toUpperCase();
      const key = `${methodName} ${path}`;

      operations.set(key, {
        key,
        method: methodName,
        path,
        operationId: typeof operation.operationId === "string" ? operation.operationId : undefined,
        tags: getTags(operation),
        parameters: normalizedParameters,
        requestBody: normalizedRequestBody,
        responses: normalizedResponses,
        security: normalizedSecurity,
        contract: normalizedOperation,
        contractHash: hashContract(normalizedOperation),
      });
    }
  }

  return operations;
}

export function extractSchemas(spec: JsonObject): Map<string, SchemaContract> {
  const components = getObject(spec.components) ?? {};
  const schemasObject = getObject(components.schemas) ?? {};
  const schemas = new Map<string, SchemaContract>();

  for (const [name, schema] of Object.entries(schemasObject)) {
    const contract = normalizeOpenApiContract(schema);
    schemas.set(name, {
      name,
      contract,
      contractHash: hashContract(contract),
    });
  }

  return schemas;
}

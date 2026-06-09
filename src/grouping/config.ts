import { readFile } from "node:fs/promises";
import type { ApiGroupDefinition, ApiGroupsConfig } from "./types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item));
}

function normalizeGroup(group: unknown): ApiGroupDefinition {
  if (!isObject(group) || typeof group.name !== "string" || group.name.trim().length === 0) {
    throw new Error("Each API group must define a non-empty name.");
  }

  return {
    name: group.name,
    tags: asStringArray(group.tags),
    path_prefixes: asStringArray(group.path_prefixes),
    schema_name_patterns: asStringArray(group.schema_name_patterns),
  };
}

export async function loadApiGroupsConfig(configPath: string): Promise<ApiGroupsConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed)) {
    throw new Error(`API groups config must be a JSON object: ${configPath}`);
  }

  return {
    fallback_group: typeof parsed.fallback_group === "string" ? parsed.fallback_group : "Ungrouped",
    raw_spec_group: typeof parsed.raw_spec_group === "string" ? parsed.raw_spec_group : "Spec Metadata",
    groups: Array.isArray(parsed.groups) ? parsed.groups.map(normalizeGroup) : [],
  };
}

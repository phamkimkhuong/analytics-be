import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { sha256 } from "../hash.js";
import { stableJsonString } from "../json.js";
import { extractOperations, extractSchemas } from "../openapi/extract.js";
import { normalizeOpenApiContract } from "../openapi/normalize.js";
import type { SnapshotForDiff } from "./types.js";
import type { JsonObject } from "../types.js";

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveSnapshotDir(input: string, rootDir: string): Promise<string> {
  const direct = resolve(input);
  const byId = resolve(rootDir, "snapshots", input);
  const candidates = [direct, byId];

  for (const candidate of candidates) {
    const candidateStat = await stat(candidate).catch(() => undefined);
    if (!candidateStat) {
      continue;
    }
    if (candidateStat.isDirectory() && (await pathExists(join(candidate, "openapi.json")))) {
      return candidate;
    }
    if (candidateStat.isFile() && basename(candidate) === "openapi.json") {
      return dirname(candidate);
    }
  }

  throw new Error(`Cannot resolve snapshot '${input}'. Pass a snapshot id, snapshot directory, or openapi.json path.`);
}

async function readJsonObject(path: string): Promise<JsonObject> {
  const raw = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isJsonObject(parsed)) {
    throw new Error(`Expected JSON object: ${path}`);
  }
  return parsed;
}

export async function loadSnapshotForDiff(input: string, rootDir: string): Promise<SnapshotForDiff> {
  const dir = await resolveSnapshotDir(input, rootDir);
  const spec = await readJsonObject(join(dir, "openapi.json"));
  const manifestPath = join(dir, "manifest.json");
  const manifest = (await pathExists(manifestPath)) ? await readJsonObject(manifestPath) : undefined;
  const rawJson = stableJsonString(spec);
  const contractJson = stableJsonString(normalizeOpenApiContract(spec));

  return {
    id: basename(dir),
    dir,
    manifest,
    spec,
    rawHash: sha256(rawJson),
    contractHash: sha256(contractJson),
    operations: extractOperations(spec),
    schemas: extractSchemas(spec),
  };
}

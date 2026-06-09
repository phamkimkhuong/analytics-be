import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "./hash.js";
import { inspectOpenApi } from "./openapi/inspect.js";
import { normalizeOpenApiContract } from "./openapi/normalize.js";
import { stableJsonString } from "./json.js";
import { formatVietnamIso, makeSnapshotId } from "./time.js";
import type { JsonObject, ResolvedSource } from "./types.js";

export interface Manifest {
  snapshot_id: string;
  fetched_at: string;
  fetched_at_utc: string;
  source: ResolvedSource;
  openapi: ReturnType<typeof inspectOpenApi>;
  files: {
    openapi: "openapi.json";
    manifest: "manifest.json";
  };
  checksums: {
    openapi_sha256: string;
    contract_sha256: string;
  };
}

export interface SnapshotResult {
  snapshotDir: string;
  manifest: Manifest;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchOpenApiSpec(url: string, timeoutSeconds: number): Promise<JsonObject> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "analytics-be-openapi-snapshot/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAPI request failed: HTTP ${response.status} ${response.statusText}`);
    }

    const parsed: unknown = await response.json();
    if (!isJsonObject(parsed)) {
      throw new Error("OpenAPI response is not a JSON object.");
    }
    if (!("openapi" in parsed) || !("paths" in parsed)) {
      throw new Error("OpenAPI response is missing required openapi/paths fields.");
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

function buildManifest(params: {
  source: ResolvedSource;
  snapshotId: string;
  fetchedAt: Date;
  spec: JsonObject;
  openapiSha256: string;
  contractSha256: string;
}): Manifest {
  return {
    snapshot_id: params.snapshotId,
    fetched_at: formatVietnamIso(params.fetchedAt),
    fetched_at_utc: params.fetchedAt.toISOString(),
    source: params.source,
    openapi: inspectOpenApi(params.spec),
    files: {
      openapi: "openapi.json",
      manifest: "manifest.json",
    },
    checksums: {
      openapi_sha256: params.openapiSha256,
      contract_sha256: params.contractSha256,
    },
  };
}

export async function createSnapshot(params: {
  source: ResolvedSource;
  outputDir: string;
  snapshotId?: string;
  timeout: number;
}): Promise<SnapshotResult> {
  const fetchedAt = new Date();
  const snapshotId = params.snapshotId ?? makeSnapshotId(fetchedAt);
  const snapshotDir = join(params.outputDir, snapshotId);

  const spec = await fetchOpenApiSpec(params.source.openapi_url, params.timeout);
  const openapiJson = stableJsonString(spec);
  const openapiSha256 = sha256(openapiJson);
  const contractJson = stableJsonString(normalizeOpenApiContract(spec));
  const contractSha256 = sha256(contractJson);
  const manifest = buildManifest({
    source: params.source,
    snapshotId,
    fetchedAt,
    spec,
    openapiSha256,
    contractSha256,
  });

  await mkdir(snapshotDir, { recursive: false });
  await writeFile(join(snapshotDir, "openapi.json"), openapiJson, "utf8");
  await writeFile(join(snapshotDir, "manifest.json"), stableJsonString(manifest), "utf8");

  return { snapshotDir, manifest };
}

import { readFile } from "node:fs/promises";
import type { ResolvedSource, SourceConfigEntry, SourcesConfig } from "./types.js";

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Config must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export async function loadSourcesConfig(configPath: string): Promise<SourcesConfig> {
  const raw = await readFile(configPath, "utf8");
  const parsed = asObject(JSON.parse(raw)) as SourcesConfig;
  if (!parsed.sources || typeof parsed.sources !== "object") {
    throw new Error(`Missing sources map in config: ${configPath}`);
  }
  return parsed;
}

function resolveConfigEntry(config: SourcesConfig, sourceKey?: string): [string, SourceConfigEntry] {
  const selectedKey = sourceKey ?? config.default;
  const sources = config.sources ?? {};
  if (!selectedKey || !sources[selectedKey]) {
    const available = Object.keys(sources).sort().join(", ") || "(none)";
    throw new Error(`Unknown source '${selectedKey ?? ""}'. Available sources: ${available}`);
  }
  return [selectedKey, sources[selectedKey]];
}

export function resolveSource(config: SourcesConfig, sourceKey?: string, explicitUrl?: string): ResolvedSource {
  if (explicitUrl) {
    return {
      key: "custom",
      name: "Custom OpenAPI Source",
      openapi_url: explicitUrl,
      swagger_ui_url: "",
    };
  }

  const [selectedKey, selected] = resolveConfigEntry(config, sourceKey);
  if (!selected.openapi_url) {
    throw new Error(`Source '${selectedKey}' does not define openapi_url.`);
  }

  return {
    key: selectedKey,
    name: selected.name ?? selectedKey,
    openapi_url: selected.openapi_url,
    swagger_ui_url: selected.swagger_ui_url ?? "",
  };
}

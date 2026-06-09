const DOC_ONLY_KEYS = new Set(["description", "summary", "externalDocs", "example", "examples"]);

export function normalizeOpenApiContract(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeOpenApiContract(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (DOC_ONLY_KEYS.has(key)) {
      continue;
    }
    normalized[key] = normalizeOpenApiContract(child);
  }
  return normalized;
}

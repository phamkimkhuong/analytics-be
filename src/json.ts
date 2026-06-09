type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike | unknown };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortJsonValue(value[key]);
  }
  return sorted;
}

export function stableJsonString(value: JsonLike | unknown): string {
  return `${JSON.stringify(sortJsonValue(value), null, 2)}\n`;
}

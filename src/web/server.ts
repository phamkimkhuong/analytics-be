import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdir, readFile, stat, cp, rm, unlink } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSnapshot } from "../snapshot.js";
import { loadSourcesConfig, resolveSource } from "../config.js";
import { runDiff } from "../diff/index.js";
import { loadSnapshotForDiff } from "../diff/snapshot.js";
import { groupSnapshot } from "../grouping/apply.js";
import { loadApiGroupsConfig } from "../grouping/config.js";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEB_DIR = resolve(ROOT_DIR, "web");
const REPORTS_DIR = resolve(ROOT_DIR, "reports");
const SNAPSHOTS_DIR = resolve(ROOT_DIR, "snapshots");
const DEFAULT_PORT = 4627;

interface ReportSummary {
  file: string;
  generated_at?: string;
  from?: string;
  to?: string;
  total_changes?: number;
  breaking?: number;
  review_required?: number;
  non_breaking?: number;
  doc_only?: number;
  contract_changed?: boolean;
  raw_changed?: boolean;
}

interface SnapshotSummary {
  id: string;
  fetched_at?: string;
  title?: unknown;
  path_count?: unknown;
  operation_count?: unknown;
  schema_count?: unknown;
  tag_count?: unknown;
  contract_sha256?: unknown;
}

function parsePort(): number {
  const index = process.argv.indexOf("--port");
  const value = index >= 0 ? process.argv[index + 1] : process.env.PORT;
  const port = Number(value ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function sendText(response: ServerResponse, statusCode: number, text: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function safeJoin(baseDir: string, requestedPath: string): string | undefined {
  const resolved = resolve(baseDir, requestedPath);
  return resolved.startsWith(baseDir) ? resolved : undefined;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function toReportSummary(file: string, report: any): ReportSummary {
  return {
    file,
    generated_at: report?.generated_at,
    from: report?.from?.id,
    to: report?.to?.id,
    total_changes: report?.summary?.total_changes,
    breaking: report?.summary?.by_severity?.BREAKING,
    review_required: report?.summary?.by_severity?.REVIEW_REQUIRED,
    non_breaking: report?.summary?.by_severity?.NON_BREAKING,
    doc_only: report?.summary?.by_severity?.DOC_ONLY,
    contract_changed: report?.summary?.contract_changed,
    raw_changed: report?.summary?.raw_changed,
  };
}

async function listReports(): Promise<ReportSummary[]> {
  const entries = await readdir(REPORTS_DIR, { withFileTypes: true }).catch(() => []);
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  const reports: ReportSummary[] = [];
  for (const file of jsonFiles) {
    try {
      reports.push(toReportSummary(file, await readJson(join(REPORTS_DIR, file))));
    } catch {
      reports.push({ file });
    }
  }
  return reports;
}

async function listSnapshots(): Promise<SnapshotSummary[]> {
  const entries = await readdir(SNAPSHOTS_DIR, { withFileTypes: true }).catch(() => []);
  const snapshots: SnapshotSummary[] = [];

  for (const entry of entries.filter((item) => item.isDirectory()).sort((left, right) => right.name.localeCompare(left.name))) {
    const manifestPath = join(SNAPSHOTS_DIR, entry.name, "manifest.json");
    try {
      const manifest: any = await readJson(manifestPath);
      snapshots.push({
        id: entry.name,
        fetched_at: manifest?.fetched_at,
        title: manifest?.openapi?.title,
        path_count: manifest?.openapi?.path_count,
        operation_count: manifest?.openapi?.operation_count,
        schema_count: manifest?.openapi?.schema_count,
        tag_count: manifest?.openapi?.tag_count,
        contract_sha256: manifest?.checksums?.contract_sha256,
      });
    } catch {
      snapshots.push({ id: entry.name });
    }
  }

  return snapshots;
}

async function readJsonBody(request: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", (err) => reject(err));
  });
}

async function handleApi(pathname: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "POST" && pathname === "/api/snapshot") {
    const configPath = resolve(ROOT_DIR, "config", "sources.json");
    const config = await loadSourcesConfig(configPath);
    const source = resolveSource(config);
    const outputDir = resolve(ROOT_DIR, "snapshots");
    const { snapshotDir, manifest } = await createSnapshot({
      source,
      outputDir,
      timeout: 30,
    });
    sendJson(response, 200, {
      ok: true,
      snapshot_id: manifest.snapshot_id,
      operation_count: manifest.openapi.operation_count,
      schema_count: manifest.openapi.schema_count,
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/diff") {
    const body = await readJsonBody(request);
    const { from, to } = body;
    if (!from || !to) {
      sendJson(response, 400, { error: "Missing from/to snapshot IDs" });
      return;
    }
    const groupsConfig = resolve(ROOT_DIR, "config", "api-groups.json");
    const outputDir = resolve(ROOT_DIR, "reports");
    const { report, output } = await runDiff({
      from,
      to,
      rootDir: ROOT_DIR,
      outputDir,
      groupsConfig,
    });
    sendJson(response, 200, {
      ok: true,
      file: basename(output.json),
      total_changes: report.summary.total_changes,
    });
    return;
  }

  if (request.method === "POST" && pathname === "/api/baseline") {
    try {
      const body = await readJsonBody(request);
      const { snapshot_id } = body;
      if (!snapshot_id) {
        sendJson(response, 400, { error: "Missing snapshot_id" });
        return;
      }
      const srcDir = safeJoin(SNAPSHOTS_DIR, snapshot_id);
      const destDir = join(SNAPSHOTS_DIR, "20260609-ts-contract-baseline");
      if (!srcDir) {
        sendJson(response, 400, { error: "Invalid snapshot ID" });
        return;
      }
      await cp(srcDir, destDir, { recursive: true });
      sendJson(response, 200, { ok: true, message: "Baseline updated successfully" });
    } catch (err: any) {
      sendJson(response, 500, { error: err.message });
    }
    return;
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/snapshots/")) {
    try {
      const snapshot_id = decodeURIComponent(pathname.slice("/api/snapshots/".length));
      if (snapshot_id === "20260609-ts-contract-baseline") {
        sendJson(response, 400, { error: "Cannot delete the baseline snapshot." });
        return;
      }
      const targetDir = safeJoin(SNAPSHOTS_DIR, snapshot_id);
      if (!targetDir) {
        sendJson(response, 400, { error: "Invalid snapshot ID" });
        return;
      }
      await rm(targetDir, { recursive: true, force: true });
      sendJson(response, 200, { ok: true, message: "Snapshot deleted successfully" });
    } catch (err: any) {
      sendJson(response, 500, { error: err.message });
    }
    return;
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/reports/")) {
    try {
      const file = basename(decodeURIComponent(pathname.slice("/api/reports/".length)));
      if (!file.endsWith(".json")) {
        sendJson(response, 400, { error: "Report file must be a .json file." });
        return;
      }
      const jsonPath = safeJoin(REPORTS_DIR, file);
      if (!jsonPath) {
        sendJson(response, 400, { error: "Invalid report path." });
        return;
      }
      const mdFile = file.replace(/\.json$/, ".md");
      const mdPath = join(REPORTS_DIR, mdFile);

      await unlink(jsonPath);
      await unlink(mdPath).catch(() => undefined);

      sendJson(response, 200, { ok: true, message: "Report deleted successfully" });
    } catch (err: any) {
      sendJson(response, 500, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (pathname === "/api/reports") {
    sendJson(response, 200, await listReports());
    return;
  }

  if (pathname.startsWith("/api/reports/")) {
    const file = basename(decodeURIComponent(pathname.slice("/api/reports/".length)));
    const isJson = file.endsWith(".json");
    const isMd = file.endsWith(".md");
    if (!isJson && !isMd) {
      sendJson(response, 400, { error: "Report file must be a .json or .md file." });
      return;
    }
    const reportPath = safeJoin(REPORTS_DIR, file);
    if (!reportPath) {
      sendJson(response, 400, { error: "Invalid report path." });
      return;
    }
    if (isJson) {
      sendJson(response, 200, await readJson(reportPath));
    } else {
      response.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store",
      });
      response.end(await readFile(reportPath));
    }
    return;
  }

  if (request.method === "GET" && pathname.startsWith("/api/snapshots/")) {
    try {
      const snapshot_id = decodeURIComponent(pathname.slice("/api/snapshots/".length));
      const snapshot = await loadSnapshotForDiff(snapshot_id, ROOT_DIR);
      const groupsConfig = await loadApiGroupsConfig(resolve(ROOT_DIR, "config", "api-groups.json"));
      const { operations, schemas } = groupSnapshot(snapshot, groupsConfig);

      sendJson(response, 200, {
        id: snapshot_id,
        manifest: snapshot.manifest,
        operations,
        schemas,
      });
    } catch (err: any) {
      sendJson(response, 500, { error: err.message });
    }
    return;
  }

  if (pathname === "/api/snapshots") {
    sendJson(response, 200, await listSnapshots());
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function serveStatic(pathname: string, response: ServerResponse): Promise<void> {
  const filePath = pathname === "/" ? join(WEB_DIR, "index.html") : safeJoin(WEB_DIR, decodeURIComponent(pathname.slice(1)));
  if (!filePath) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const fileStat = await stat(filePath).catch(() => undefined);
  if (!fileStat || !fileStat.isFile()) {
    sendText(response, 404, "Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentType(filePath),
    "Cache-Control": "no-store",
  });
  response.end(await readFile(filePath));
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(url.pathname, request, response);
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 500, { error: message });
  }
}

const port = parsePort();
const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Analytics BE UI: http://127.0.0.1:${port}`);
});

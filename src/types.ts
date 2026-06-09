export type JsonObject = Record<string, unknown>;

export interface SourceConfigEntry {
  name?: string;
  openapi_url?: string;
  swagger_ui_url?: string;
}

export interface SourcesConfig {
  default?: string;
  sources?: Record<string, SourceConfigEntry>;
}

export interface ResolvedSource {
  key: string;
  name: string;
  openapi_url: string;
  swagger_ui_url: string;
}

export interface CliOptions {
  source?: string;
  url?: string;
  snapshotId?: string;
  outputDir: string;
  config: string;
  timeout: number;
}

export interface DiffCliOptions {
  from?: string;
  to?: string;
  outputDir: string;
  groupsConfig: string;
}

export interface ResolvedDiffCliOptions {
  from: string;
  to: string;
  outputDir: string;
  groupsConfig: string;
}

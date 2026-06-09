export interface ApiGroupDefinition {
  name: string;
  tags?: string[];
  path_prefixes?: string[];
  schema_name_patterns?: string[];
}

export interface ApiGroupsConfig {
  fallback_group?: string;
  raw_spec_group?: string;
  groups?: ApiGroupDefinition[];
}

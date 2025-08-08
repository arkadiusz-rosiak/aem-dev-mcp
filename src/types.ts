export interface MCPToolContent {
  type: 'text' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface MCPToolResult {
  content: MCPToolContent[];
  isError?: boolean;
}

export interface EnvConfig {
  AEM_INSTANCES_CONFIG_PATH?: string;
}

export interface AEMInstance {
  url: string;
  username: string;
  password: string;
}

export interface InstanceOperationResult<T> {
  instanceUrl: string;
  success: boolean;
  data?: T;
  error?: string;
  duration?: number;
  requestId?: string;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: number;
  checks: Record<string, boolean>;
}

export interface InstanceAliasConfig {
  [alias: string]: AEMInstance[];
}

export interface AliasResolutionResult {
  alias: string;
  instances: AEMInstance[];
  resolved: boolean;
  error?: string;
}

export interface HealthCheckInput {
  aliases?: string[];
  instances?: AEMInstance[];
}

export interface ParallelExecutionOptions {
  requestId?: string;
  timeout?: number;
  maxConcurrency?: number;
  deduplicationKey?: string;
}

export interface ExecutionContext {
  requestId: string;
  startTime: number;
  instance: AEMInstance;
}
// MCP Standard Types
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

// Environment Configuration
export interface EnvConfig {
  MCP_AEM_CONFIG_PATH?: string;
  MCP_AEM_LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  MCP_AEM_MAX_CONCURRENCY?: string;
  MCP_AEM_REQUEST_TIMEOUT?: string;
  MCP_AEM_ENABLE_METRICS?: string;
}

// AEM-specific Types
export interface AEMInstance {
  url: string;        // Full AEM instance URL
  username: string;   // AEM username for authentication
  password: string;   // AEM password for authentication
}

export interface InstanceOperationResult<T> {
  instanceUrl: string;    // Instance identifier
  success: boolean;       // Operation success status
  data?: T;              // Operation result data
  error?: string;        // Error message if failed
  duration?: number;     // Execution time in milliseconds
  requestId?: string;    // Request tracking ID
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: number;
  checks: Record<string, boolean>;
}

// Instance Alias Configuration Types
export interface InstanceAliasConfig {
  [alias: string]: AEMInstance[];
}

export interface AliasResolutionResult {
  alias: string;
  instances: AEMInstance[];
  resolved: boolean;
  error?: string;
}

// Handler Input Types
export interface HealthCheckInput {
  aliases?: string[];
  instances?: AEMInstance[];
}

// Parallel Execution Types
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
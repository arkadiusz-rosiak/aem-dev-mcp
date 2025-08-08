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

export interface HealthCheckResult {
  component: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface HealthStatus {
  instance: string;
  overall: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  checks: HealthCheckResult[];
  diagnostics?: SystemDiagnostics;
}

export interface SystemDiagnostics {
  memory: MemoryDiagnostics;
  threads: ThreadDiagnostics;
  repository: RepositoryDiagnostics;
  requests: RequestDiagnostics;
  bundles: BundleDiagnostics;
}

export interface MemoryDiagnostics {
  heapUsed: number;
  heapMax: number;
  nonHeapUsed: number;
  nonHeapMax: number;
  percentage: number;
}

export interface ThreadDiagnostics {
  total: number;
  runnable: number;
  blocked: number;
  waiting: number;
  timedWaiting: number;
  deadlocked: number;
}

export interface RepositoryDiagnostics {
  size: number;
  nodeCount: number;
  indexHealth: string;
  revisions: number;
}

export interface RequestDiagnostics {
  averageResponseTime: number;
  requestsPerSecond: number;
  activeRequests: number;
  queuedRequests: number;
  errorRate: number;
}

export interface BundleDiagnostics {
  total: number;
  active: number;
  resolved: number;
  installed: number;
  failed: string[];
}

export interface HealthCheckRequest {
  instances: string[];
  detailed?: boolean;
}

export enum ErrorType {
  NETWORK_ERROR = 'network',
  AUTH_ERROR = 'authentication',
  SERVICE_ERROR = 'service',
  PERFORMANCE_DEGRADATION = 'performance'
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
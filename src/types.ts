export interface MCPToolContent {
  readonly type: 'text' | 'image';
  readonly text?: string;
  readonly data?: string;
  readonly mimeType?: string;
}

export interface MCPToolResult {
  readonly content: readonly MCPToolContent[];
  readonly isError?: boolean;
}

export interface EnvConfig {
  readonly AEM_INSTANCES_CONFIG_PATH?: string;
}

export interface AEMInstance {
  readonly url: string;
  readonly username: string;
  readonly password: string;
}

export type OperationResult<T, E = Error> = 
  | { readonly success: true; readonly data: T; readonly duration: number }
  | { readonly success: false; readonly error: E; readonly duration: number };

export interface InstanceOperationResult<T> {
  readonly instanceUrl: string;
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly duration?: number;
  readonly requestId?: string;
}

export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy'
} as const;

export type HealthStatusType = typeof HEALTH_STATUS[keyof typeof HEALTH_STATUS];

export const HEALTH_COMPONENTS = {
  REACHABILITY: 'reachability',
  BUNDLES: 'bundles',
  LOGIN: 'login',
  REPOSITORY: 'repository',
  CONSOLE: 'console',
  SYSTEM: 'system'
} as const;

export type HealthComponentType = typeof HEALTH_COMPONENTS[keyof typeof HEALTH_COMPONENTS];

export interface HealthCheckResult {
  readonly component: HealthComponentType;
  readonly status: HealthStatusType;
  readonly message?: string;
  readonly responseTime?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface HealthStatus {
  readonly instance: string;
  readonly overall: HealthStatusType;
  readonly timestamp: Date;
  readonly checks: readonly HealthCheckResult[];
  readonly diagnostics?: SystemDiagnostics;
}

export interface SystemDiagnostics {
  readonly memory: MemoryDiagnostics;
  readonly threads: ThreadDiagnostics;
  readonly repository: RepositoryDiagnostics;
  readonly requests: RequestDiagnostics;
  readonly bundles: BundleDiagnostics;
}

export type ByteSize = number & { readonly __brand: 'ByteSize' };
export type Percentage = number & { readonly __brand: 'Percentage' };

export const createByteSize = (bytes: number): ByteSize => {
  if (bytes < 0) throw new Error('Byte size cannot be negative');
  return bytes as ByteSize;
};

export const createPercentage = (value: number): Percentage => {
  if (value < 0 || value > 100) throw new Error('Percentage must be between 0 and 100');
  return Math.round(value) as Percentage;
};

export interface MemoryDiagnostics {
  readonly heapUsed: ByteSize;
  readonly heapMax: ByteSize;
  readonly nonHeapUsed: ByteSize;
  readonly nonHeapMax: ByteSize;
  readonly percentage: Percentage;
}

export type ThreadCount = number & { readonly __brand: 'ThreadCount' };

export const createThreadCount = (count: number): ThreadCount => {
  if (count < 0) throw new Error('Thread count cannot be negative');
  return count as ThreadCount;
};

export interface ThreadDiagnostics {
  readonly total: ThreadCount;
  readonly runnable: ThreadCount;
  readonly blocked: ThreadCount;
  readonly waiting: ThreadCount;
  readonly timedWaiting: ThreadCount;
  readonly deadlocked: ThreadCount;
}

export const REPOSITORY_HEALTH = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNKNOWN: 'unknown'
} as const;

export type RepositoryHealthType = typeof REPOSITORY_HEALTH[keyof typeof REPOSITORY_HEALTH];

export interface RepositoryDiagnostics {
  readonly size: ByteSize;
  readonly nodeCount: number;
  readonly indexHealth: RepositoryHealthType;
  readonly revisions: number;
}

export type Milliseconds = number & { readonly __brand: 'Milliseconds' };
export type RequestsPerSecond = number & { readonly __brand: 'RequestsPerSecond' };
export type RequestCount = number & { readonly __brand: 'RequestCount' };

export const createMilliseconds = (ms: number): Milliseconds => {
  if (ms < 0) throw new Error('Milliseconds cannot be negative');
  return ms as Milliseconds;
};

export const createRequestsPerSecond = (rps: number): RequestsPerSecond => {
  if (rps < 0) throw new Error('Requests per second cannot be negative');
  return rps as RequestsPerSecond;
};

export const createRequestCount = (count: number): RequestCount => {
  if (count < 0) throw new Error('Request count cannot be negative');
  return count as RequestCount;
};

export interface RequestDiagnostics {
  readonly averageResponseTime: Milliseconds;
  readonly requestsPerSecond: RequestsPerSecond;
  readonly activeRequests: RequestCount;
  readonly queuedRequests: RequestCount;
  readonly errorRate: Percentage;
}

export type BundleCount = number & { readonly __brand: 'BundleCount' };
export type BundleName = string & { readonly __brand: 'BundleName' };

export const createBundleCount = (count: number): BundleCount => {
  if (count < 0) throw new Error('Bundle count cannot be negative');
  return count as BundleCount;
};

export const createBundleName = (name: string): BundleName => {
  if (!name.trim()) throw new Error('Bundle name cannot be empty');
  return name.trim() as BundleName;
};

export interface BundleDiagnostics {
  readonly total: BundleCount;
  readonly active: BundleCount;
  readonly resolved: BundleCount;
  readonly installed: BundleCount;
  readonly failed: readonly BundleName[];
}

export interface HealthCheckRequest {
  readonly instances: readonly string[];
  readonly detailed?: boolean;
}

export const ERROR_TYPES = {
  NETWORK_ERROR: 'network',
  AUTH_ERROR: 'authentication', 
  SERVICE_ERROR: 'service',
  PERFORMANCE_DEGRADATION: 'performance'
} as const;

export type ErrorType = typeof ERROR_TYPES[keyof typeof ERROR_TYPES];

export interface HealthCheckError {
  readonly type: ErrorType;
  readonly message: string;
  readonly code?: string;
  readonly statusCode?: number;
}

export const createHealthCheckError = (
  type: ErrorType,
  message: string,
  options: { code?: string; statusCode?: number } = {}
): HealthCheckError => ({
  type,
  message,
  ...options
});

export interface InstanceAliasConfig {
  readonly [alias: string]: readonly AEMInstance[];
}

export interface AliasResolutionResult {
  readonly alias: string;
  readonly instances: readonly AEMInstance[];
  readonly resolved: boolean;
  readonly error?: string;
}


export type RequestId = string & { readonly __brand: 'RequestId' };
export type TimeoutMs = number & { readonly __brand: 'TimeoutMs' };
export type ConcurrencyLimit = number & { readonly __brand: 'ConcurrencyLimit' };

export const createRequestId = (id: string): RequestId => {
  if (!id.trim()) throw new Error('Request ID cannot be empty');
  return id.trim() as RequestId;
};

export const createTimeout = (ms: number): TimeoutMs => {
  if (ms <= 0) throw new Error('Timeout must be positive');
  return ms as TimeoutMs;
};

export const createConcurrencyLimit = (limit: number): ConcurrencyLimit => {
  if (limit <= 0) throw new Error('Concurrency limit must be positive');
  return limit as ConcurrencyLimit;
};

export interface ParallelExecutionOptions {
  readonly requestId?: RequestId;
  readonly timeout?: TimeoutMs;
  readonly maxConcurrency?: ConcurrencyLimit;
  readonly deduplicationKey?: string;
}

export interface ExecutionContext {
  readonly requestId: RequestId;
  readonly startTime: number;
  readonly instance: AEMInstance;
}

export type TypeGuard<T> = (value: unknown) => value is T;

export const isHealthStatus = (value: unknown): value is HealthStatus => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'instance' in value &&
    'overall' in value &&
    'timestamp' in value &&
    'checks' in value
  );
};

export const isAEMInstance = (value: unknown): value is AEMInstance => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    'username' in value &&
    'password' in value &&
    typeof (value as any).url === 'string' &&
    typeof (value as any).username === 'string' &&
    typeof (value as any).password === 'string'
  );
};

export const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type NonEmptyArray<T> = [T, ...T[]];

export const isNonEmptyArray = <T>(array: T[]): array is NonEmptyArray<T> => {
  return array.length > 0;
};
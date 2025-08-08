export interface SystemMetrics {
  readonly memory: MemoryMetrics;
  readonly threads: ThreadMetrics;
  readonly repository: RepositoryMetrics;
  readonly requests: RequestMetrics;
  readonly bundles: BundleMetrics;
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

export interface MemoryMetrics {
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

export interface ThreadMetrics {
  readonly total: ThreadCount;
  readonly runnable: ThreadCount;
  readonly blocked: ThreadCount;
  readonly waiting: ThreadCount;
  readonly timedWaiting: ThreadCount;
  readonly deadlocked: ThreadCount;
}

export const REPOSITORY_HEALTH = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy'
} as const;

export type RepositoryHealthType = typeof REPOSITORY_HEALTH[keyof typeof REPOSITORY_HEALTH];

export interface RepositoryMetrics {
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

export interface RequestMetrics {
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

export interface BundleMetrics {
  readonly total: BundleCount;
  readonly active: BundleCount;
  readonly resolved: BundleCount;
  readonly installed: BundleCount;
  readonly failed: readonly BundleName[];
}
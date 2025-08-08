export interface SystemMetrics {
  readonly memory: MemoryMetrics;
  readonly threads: ThreadMetrics;
  readonly repository: RepositoryMetrics;
  readonly requests: RequestMetrics;
  readonly bundles: BundleMetrics;
}

export type ByteSize = number & { readonly __brand: 'ByteSize' };
export type Percentage = number & { readonly __brand: 'Percentage' };

export interface MemoryMetrics {
  readonly heapUsed: ByteSize;
  readonly heapMax: ByteSize;
  readonly nonHeapUsed: ByteSize;
  readonly nonHeapMax: ByteSize;
  readonly percentage: Percentage;
}

export type ThreadCount = number & { readonly __brand: 'ThreadCount' };

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

export interface RequestMetrics {
  readonly averageResponseTime: Milliseconds;
  readonly requestsPerSecond: RequestsPerSecond;
  readonly activeRequests: RequestCount;
  readonly queuedRequests: RequestCount;
  readonly errorRate: Percentage;
}

export type BundleCount = number & { readonly __brand: 'BundleCount' };
export type BundleName = string & { readonly __brand: 'BundleName' };

export interface BundleMetrics {
  readonly total: BundleCount;
  readonly active: BundleCount;
  readonly resolved: BundleCount;
  readonly installed: BundleCount;
  readonly failed: readonly BundleName[];
}
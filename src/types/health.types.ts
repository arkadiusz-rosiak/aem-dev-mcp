import type { SystemMetrics } from './metrics.types';

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
  readonly metrics: SystemMetrics;
}

export interface HealthCheckRequest {
  readonly instances: readonly string[];
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
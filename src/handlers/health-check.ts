import { 
  MCPToolResult, 
  HealthStatus, 
  AEMInstance, 
  HEALTH_STATUS,
  RequestId,
  TimeoutMs,
  ConcurrencyLimit,
  isNonEmptyArray,
  isAEMInstance,
  NonEmptyArray
} from '@/types/index.js';
import {
  createConcurrencyLimit,
  createRequestId,
  createByteSize,
  createPercentage,
  createThreadCount,
  createBundleCount
} from '@/utils/type-factories.js';
import { AliasResolver } from '@/services/alias-resolver.js';
import { ParallelExecutor } from '@/services/parallel-executor.js';
import { HealthService } from '@/services/health-service.js';
import { AemHttpClient } from '@/services/http-client.js';
import { createErrorResponse } from '@/utils/errors.js';
import { createLogger } from '@/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { 
  HealthCheckSchema, 
  MAX_CONCURRENT_INSTANCES,
  type HealthCheckInput 
} from '@/schemas/health-check.schema.js';
import { TIMEOUTS } from '@/constants/timeouts.js';

const DEFAULT_CONCURRENCY = 20;

interface HealthCheckConfig {
  readonly timeout: TimeoutMs;
  readonly maxConcurrency: ConcurrencyLimit;
}

const createHealthCheckConfig = (overrides: Partial<HealthCheckConfig> = {}): HealthCheckConfig => ({
  timeout: TIMEOUTS.HEALTH_CHECK,
  maxConcurrency: createConcurrencyLimit(DEFAULT_CONCURRENCY),
  ...overrides
});

interface HealthCheckResult {
  readonly success: boolean;
  readonly data?: HealthStatus;
  readonly error?: string;
  readonly instanceUrl: string;
  readonly duration?: number;
}

interface HealthCheckSummary {
  readonly total: number;
  readonly healthy: number;
  readonly unhealthy: number;
}

interface HealthCheckMetadata {
  readonly timestamp: string;
  readonly totalInstances: number;
  readonly averageResponseTime: number;
}

interface HealthCheckResponse {
  readonly requestId: string;
  readonly summary: HealthCheckSummary;
  readonly results: Readonly<Record<string, HealthStatus>>;
  readonly metadata: HealthCheckMetadata;
}

const calculateSummary = (healthStatuses: readonly HealthStatus[]): HealthCheckSummary => {
  return healthStatuses.reduce(
    (summary, status) => {
      switch (status.overall) {
        case HEALTH_STATUS.HEALTHY:
          return { ...summary, healthy: summary.healthy + 1 };
        case HEALTH_STATUS.UNHEALTHY:
          return { ...summary, unhealthy: summary.unhealthy + 1 };
        default:
          return summary;
      }
    },
    {
      total: healthStatuses.length,
      healthy: 0,
      unhealthy: 0
    } as HealthCheckSummary
  );
};

const calculateAverageResponseTime = (results: readonly HealthCheckResult[]): number => {
  const durationsWithValues = results.filter((r): r is HealthCheckResult & { duration: number } => 
    typeof r.duration === 'number'
  );
  
  if (durationsWithValues.length === 0) return 0;
  
  const totalDuration = durationsWithValues.reduce((sum, r) => sum + r.duration, 0);
  return Math.round(totalDuration / durationsWithValues.length);
};

const createUnhealthyStatus = (instanceUrl: string, error: string): HealthStatus => ({
  instance: instanceUrl,
  overall: HEALTH_STATUS.UNHEALTHY,
  timestamp: new Date(),
  checks: [{
    component: 'system',
    status: HEALTH_STATUS.UNHEALTHY,
    message: error
  }],
  metrics: {
    memory: {
      heapUsed: createByteSize(0),
      heapMax: createByteSize(0),
      nonHeapUsed: createByteSize(0),
      nonHeapMax: createByteSize(0),
      percentage: createPercentage(0)
    },
    threads: {
      total: createThreadCount(0),
      runnable: createThreadCount(0),
      blocked: createThreadCount(0),
      waiting: createThreadCount(0),
      timedWaiting: createThreadCount(0),
      deadlocked: createThreadCount(0)
    },
    repository: {
      size: createByteSize(0),
      nodes: 0,
      errors: 0,
      properties: 0
    },
    bundles: {
      total: createBundleCount(0),
      active: createBundleCount(0),
      resolved: createBundleCount(0),
      installed: createBundleCount(0),
      fragments: createBundleCount(0)
    }
  }
});

export async function handleHealthCheck(
  args: unknown,
  resolver: AliasResolver,
  executor: ParallelExecutor,
  client: AemHttpClient
): Promise<MCPToolResult> {
  const logger = createLogger();
  const requestId = createRequestId(uuidv4());
  
  try {
    const validatedInput = HealthCheckSchema.parse(args);
    const config = createHealthCheckConfig();
    
    const healthService = new HealthService(client);
    
    const instances = await resolveInstances(validatedInput, resolver);
    
    if (!isNonEmptyArray(instances)) {
      throw new Error('No instances to check after resolution');
    }

    const results = await executeHealthChecks(
      instances,
      healthService,
      executor,
      requestId,
      config
    );
    
    const response = buildHealthCheckResponse(
      requestId,
      results,
      instances
    );
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }],
      isError: false
    };
    
  } catch (error) {
    logger?.error?.('Health check failed', { error, requestId });
    
    const errorMessage = error instanceof z.ZodError 
      ? `Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      : error instanceof Error 
        ? error.message 
        : String(error);
    
    return createErrorResponse(
      `Health check failed: ${errorMessage}`,
      requestId
    );
  }
}

async function resolveInstances(
  input: HealthCheckInput,
  resolver: AliasResolver
): Promise<AEMInstance[]> {
  const instances: AEMInstance[] = [];
  
  if (input.aliases && isNonEmptyArray(input.aliases)) {
    for (const alias of input.aliases) {
      const aliasResult = await resolver.resolveAlias(alias);
      if (aliasResult.resolved) {
        instances.push(...aliasResult.instances);
      }
    }
  }
  
  if (input.instances && isNonEmptyArray(input.instances)) {
    const validInstances = input.instances.filter(isAEMInstance);
    instances.push(...validInstances);
  }
  
  return instances;
}

async function executeHealthChecks(
  instances: NonEmptyArray<AEMInstance>,
  healthService: HealthService,
  executor: ParallelExecutor,
  requestId: RequestId,
  config: HealthCheckConfig
): Promise<HealthCheckResult[]> {
  return executor.executeOnInstances(
    instances,
    async (instance) => {
      return await healthService.performHealthCheck(instance);
    },
    { 
      requestId,
      timeout: config.timeout,
      maxConcurrency: config.maxConcurrency
    }
  );
}

function buildHealthCheckResponse(
  requestId: RequestId,
  results: HealthCheckResult[],
  instances: readonly AEMInstance[]
): HealthCheckResponse {
  const healthResults: Record<string, HealthStatus> = {};
  const validHealthStatuses: HealthStatus[] = [];
  
  for (const result of results) {
    const instanceKey = result.instanceUrl;
    
    if (result.success && result.data) {
      healthResults[instanceKey] = result.data;
      validHealthStatuses.push(result.data);
    } else {
      const unhealthyStatus = createUnhealthyStatus(
        result.instanceUrl,
        result.error || 'Unknown error'
      );
      healthResults[instanceKey] = unhealthyStatus;
      validHealthStatuses.push(unhealthyStatus);
    }
  }
  
  const summary = calculateSummary(validHealthStatuses);
  const averageResponseTime = calculateAverageResponseTime(results);
  
  return {
    requestId,
    summary,
    results: healthResults,
    metadata: {
      timestamp: new Date().toISOString(),
      totalInstances: instances.length,
      averageResponseTime
    }
  };
}

export const healthCheckTool = {
  name: 'aem_health_check',
  description: 'Performs comprehensive health checks on AEM instances including memory, threads, bundles, requests, and repository metrics',
  inputSchema: {
    type: 'object',
    properties: {
      aliases: {
        type: 'array',
        items: {
          type: 'string',
          minLength: 1
        },
        description: `Array of instance aliases to check (from configuration file). Maximum ${MAX_CONCURRENT_INSTANCES} total instances allowed.`,
        maxItems: MAX_CONCURRENT_INSTANCES
      },
      instances: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              format: 'uri',
              description: 'AEM instance URL (e.g., http://localhost:4502)'
            },
            username: {
              type: 'string',
              minLength: 1,
              description: 'Authentication username'
            },
            password: {
              type: 'string',
              minLength: 1,
              description: 'Authentication password'
            }
          },
          required: ['url', 'username', 'password'],
          additionalProperties: false
        },
        description: `Direct instance configuration (overrides aliases). Maximum ${MAX_CONCURRENT_INSTANCES} instances allowed.`,
        maxItems: MAX_CONCURRENT_INSTANCES
      }
    },
    oneOf: [
      { required: ['aliases'] },
      { required: ['instances'] }
    ],
    additionalProperties: false
  } as const
} as const;
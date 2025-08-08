import { 
  AEMInstance, 
  HealthStatus, 
  HealthCheckResult, 
  ErrorType, 
  HealthStatusType,
  HealthComponentType,
  HEALTH_STATUS,
  HEALTH_COMPONENTS,
  ERROR_TYPES,
  Milliseconds,
  createMilliseconds,
  TimeoutMs,
  createTimeout,
  OperationResult
} from '@/types.js';
import { AemHttpClient } from '@/services/http-client.js';
import { BundleData } from '@/schemas/bundle-data.schema.js';

interface HealthCheckConfig {
  readonly timeout: TimeoutMs;
  readonly slowResponseThreshold: Milliseconds;
}

const DEFAULT_CONFIG: HealthCheckConfig = {
  timeout: createTimeout(15000),
  slowResponseThreshold: createMilliseconds(5000)
} as const;

interface ComponentCheckOptions {
  readonly instance: AEMInstance;
  readonly startTime: number;
  readonly timeout: TimeoutMs;
}

type HealthCheckFunction = (options: ComponentCheckOptions) => Promise<OperationResult<HealthCheckResult>>;

const createSuccessResult = <T>(data: T, duration: number): OperationResult<T> => ({
  success: true,
  data,
  duration
});

const createFailureResult = <E extends Error>(error: E, duration: number): OperationResult<never, E> => ({
  success: false,
  error,
  duration
});

export class HealthService {
  readonly #httpClient: AemHttpClient;
  readonly #config: HealthCheckConfig;

  constructor(httpClient: AemHttpClient, config: Partial<HealthCheckConfig> = {}) {
    this.#httpClient = httpClient;
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  async performHealthCheck(instance: AEMInstance): Promise<HealthStatus> {
    const checks: HealthCheckResult[] = [];
    
    const healthCheckConfigs: readonly { check: HealthCheckFunction, component: HealthComponentType }[] = [
      { check: this.#createReachabilityCheck(), component: HEALTH_COMPONENTS.REACHABILITY },
      { check: this.#createBundleCheck(), component: HEALTH_COMPONENTS.BUNDLES },
      { check: this.#createLoginCheck(), component: HEALTH_COMPONENTS.LOGIN },
      { check: this.#createRepositoryCheck(), component: HEALTH_COMPONENTS.REPOSITORY },
      { check: this.#createConsoleCheck(), component: HEALTH_COMPONENTS.CONSOLE }
    ] as const;

    for (const { check: healthCheck, component } of healthCheckConfigs) {
      const checkStartTime = Date.now();
      const result = await healthCheck({
        instance,
        startTime: checkStartTime,
        timeout: this.#config.timeout
      });

      if (result.success) {
        checks.push(result.data);
        
        if (result.data.status === HEALTH_STATUS.UNHEALTHY) {
          break;
        }
      } else {
        checks.push({
          component,
          status: HEALTH_STATUS.UNHEALTHY,
          message: result.error.message,
          responseTime: createMilliseconds(result.duration)
        });
        break;
      }
    }

    return this.#aggregateResults(instance, checks);
  }

  #createReachabilityCheck(): HealthCheckFunction {
    return async ({ instance, startTime, timeout }): Promise<OperationResult<HealthCheckResult>> => {
      try {
        const response = await this.#httpClient.makeRequest(instance, '/', 'GET', undefined, timeout);
        const responseTime = createMilliseconds(Date.now() - startTime);
        
        if (response.status >= 200 && response.status < 400) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.REACHABILITY,
            status: responseTime > this.#config.slowResponseThreshold 
              ? HEALTH_STATUS.DEGRADED 
              : HEALTH_STATUS.HEALTHY,
            message: responseTime > this.#config.slowResponseThreshold 
              ? 'Slow response time' 
              : 'Instance reachable',
            responseTime
          }, responseTime);
        } else {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.REACHABILITY,
            status: HEALTH_STATUS.UNHEALTHY,
            message: `HTTP ${response.status}`,
            responseTime
          }, responseTime);
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const healthCheckError = this.#classifyError(error);
        
        return createFailureResult(
          new Error(healthCheckError.message),
          responseTime
        );
      }
    };
  }

  #createBundleCheck(): HealthCheckFunction {
    return async ({ instance, startTime, timeout }): Promise<OperationResult<HealthCheckResult>> => {
      try {
        const response = await this.#httpClient.makeRequest(
          instance, 
          '/system/console/bundles.json', 
          'GET', 
          undefined, 
          timeout
        );
        const responseTime = createMilliseconds(Date.now() - startTime);
        
        if (response.status === 200) {
          const bundleData = response.data as BundleData;
          const totalBundles = bundleData.s?.[1] ?? 0;
          const activeBundles = bundleData.s?.[0] ?? 0;
          const failedBundles = bundleData.data?.filter((bundle) => 
            bundle.state === 'Installed' || bundle.state === 'Resolved'
          ) ?? [];
          
          if (failedBundles.length > 0) {
            return createSuccessResult({
              component: HEALTH_COMPONENTS.BUNDLES,
              status: HEALTH_STATUS.UNHEALTHY,
              message: `${failedBundles.length} bundles failed`,
              responseTime,
              details: {
                total: totalBundles,
                active: activeBundles,
                failed: failedBundles.map((b) => b.symbolicName)
              } as const
            }, responseTime);
          }
          
          return createSuccessResult({
            component: HEALTH_COMPONENTS.BUNDLES,
            status: HEALTH_STATUS.HEALTHY,
            message: `All ${totalBundles} bundles active`,
            responseTime,
            details: {
              total: totalBundles,
              active: activeBundles
            } as const
          }, responseTime);
        } else if (response.status === 401 || response.status === 403) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.BUNDLES,
            status: HEALTH_STATUS.UNHEALTHY,
            message: 'Authentication required for bundle console',
            responseTime
          }, responseTime);
        } else {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.BUNDLES,
            status: HEALTH_STATUS.UNHEALTHY,
            message: `Bundle console unavailable (HTTP ${response.status})`,
            responseTime
          }, responseTime);
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const healthCheckError = this.#classifyError(error);
        
        return createFailureResult(
          new Error(healthCheckError.message),
          responseTime
        );
      }
    };
  }

  #createLoginCheck(): HealthCheckFunction {
    return async ({ instance, startTime, timeout }): Promise<OperationResult<HealthCheckResult>> => {
      try {
        const response = await this.#httpClient.makeRequest(
          instance,
          '/libs/granite/core/content/login.html',
          'GET',
          undefined,
          timeout
        );
        const responseTime = createMilliseconds(Date.now() - startTime);
        
        if (response.status === 200) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.LOGIN,
            status: HEALTH_STATUS.HEALTHY,
            message: 'Login page accessible',
            responseTime
          }, responseTime);
        } else {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.LOGIN,
            status: HEALTH_STATUS.UNHEALTHY,
            message: `Login page unavailable (HTTP ${response.status})`,
            responseTime
          }, responseTime);
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const healthCheckError = this.#classifyError(error);
        
        return createFailureResult(
          new Error(healthCheckError.message),
          responseTime
        );
      }
    };
  }

  #createRepositoryCheck(): HealthCheckFunction {
    return async ({ instance, startTime, timeout }): Promise<OperationResult<HealthCheckResult>> => {
      try {
        const response = await this.#httpClient.makeRequest(
          instance,
          '/crx/de/index.jsp',
          'GET',
          undefined,
          timeout
        );
        const responseTime = createMilliseconds(Date.now() - startTime);
        
        if (response.status === 200) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.REPOSITORY,
            status: HEALTH_STATUS.HEALTHY,
            message: 'Repository accessible',
            responseTime
          }, responseTime);
        } else if (response.status === 401 || response.status === 403) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.REPOSITORY,
            status: HEALTH_STATUS.HEALTHY,
            message: 'Repository requires authentication (normal)',
            responseTime
          }, responseTime);
        } else {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.REPOSITORY,
            status: HEALTH_STATUS.UNHEALTHY,
            message: `Repository unavailable (HTTP ${response.status})`,
            responseTime
          }, responseTime);
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const healthCheckError = this.#classifyError(error);
        
        return createFailureResult(
          new Error(healthCheckError.message),
          responseTime
        );
      }
    };
  }

  #createConsoleCheck(): HealthCheckFunction {
    return async ({ instance, startTime, timeout }): Promise<OperationResult<HealthCheckResult>> => {
      try {
        const response = await this.#httpClient.makeRequest(
          instance,
          '/system/console/memoryusage',
          'GET',
          undefined,
          timeout
        );
        const responseTime = createMilliseconds(Date.now() - startTime);
        
        if (response.status === 200) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.CONSOLE,
            status: HEALTH_STATUS.HEALTHY,
            message: 'System console accessible',
            responseTime
          }, responseTime);
        } else if (response.status === 401 || response.status === 403) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.CONSOLE,
            status: HEALTH_STATUS.DEGRADED,
            message: 'Console authentication required',
            responseTime
          }, responseTime);
        } else {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.CONSOLE,
            status: HEALTH_STATUS.UNHEALTHY,
            message: `System console unavailable (HTTP ${response.status})`,
            responseTime
          }, responseTime);
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;
        const healthCheckError = this.#classifyError(error);
        
        return createFailureResult(
          new Error(healthCheckError.message),
          responseTime
        );
      }
    };
  }

  #aggregateResults(instance: AEMInstance, checks: readonly HealthCheckResult[]): HealthStatus {
    const statusPriority: Record<HealthStatusType, number> = {
      [HEALTH_STATUS.UNHEALTHY]: 2,
      [HEALTH_STATUS.DEGRADED]: 1,
      [HEALTH_STATUS.HEALTHY]: 0
    } as const;

    const overallStatus = checks.reduce((maxStatus: HealthStatusType, check) => {
      return statusPriority[check.status] > statusPriority[maxStatus] 
        ? check.status 
        : maxStatus;
    }, HEALTH_STATUS.HEALTHY as HealthStatusType);
    
    return {
      instance: instance.url,
      overall: overallStatus,
      timestamp: new Date(),
      checks
    };
  }
  
  #classifyError(error: unknown): { type: ErrorType; message: string } {
    if (error && typeof error === 'object') {
      if ('code' in error) {
        const errorCode = (error as { code: string }).code;
        
        if (['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT'].includes(errorCode)) {
          return {
            type: ERROR_TYPES.NETWORK_ERROR,
            message: `${ERROR_TYPES.NETWORK_ERROR}: ${errorCode}`
          };
        }
      }
      
      if ('response' in error) {
        const response = (error as { response: { status?: number } }).response;
        if (response?.status === 401 || response?.status === 403) {
          return {
            type: ERROR_TYPES.AUTH_ERROR,
            message: `${ERROR_TYPES.AUTH_ERROR}: HTTP ${response.status}`
          };
        }
        if (response?.status && response.status >= 500) {
          return {
            type: ERROR_TYPES.SERVICE_ERROR,
            message: `${ERROR_TYPES.SERVICE_ERROR}: HTTP ${response.status}`
          };
        }
      }
    }
    
    const message = error instanceof Error ? error.message : String(error);
    return {
      type: ERROR_TYPES.NETWORK_ERROR,
      message
    };
  }
}
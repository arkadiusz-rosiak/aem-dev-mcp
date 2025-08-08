import { 
  AEMInstance, 
  HealthStatus, 
  HealthCheckResult, 
  ErrorType, 
  HealthComponentType,
  HEALTH_STATUS,
  HEALTH_COMPONENTS,
  ERROR_TYPES,
  Milliseconds,
  createMilliseconds,
  TimeoutMs,
  OperationResult
} from '@/types.js';
import { AemHttpClient } from '@/services/http-client.js';
import { BundleData } from '@/schemas/bundle-data.schema.js';
import { createSuccessResult, createFailureResult } from '@/utils/operation-result.js';
import { isOk, isAuthError, isSuccessOrRedirect } from '@/utils/http-status.js';
import { TIMEOUTS } from '@/constants/timeouts.js';

interface HealthCheckConfig {
  readonly timeout: TimeoutMs;
  readonly slowResponseThreshold: Milliseconds;
}

const DEFAULT_CONFIG: HealthCheckConfig = {
  timeout: TIMEOUTS.HEALTH_CHECK,
  slowResponseThreshold: createMilliseconds(5000)
} as const;

interface ComponentCheckOptions {
  readonly instance: AEMInstance;
  readonly startTime: number;
  readonly timeout: TimeoutMs;
}

type HealthCheckFunction = (options: ComponentCheckOptions) => Promise<OperationResult<HealthCheckResult>>;


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
        
        if (isSuccessOrRedirect(response.status)) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.REACHABILITY,
            status: responseTime > this.#config.slowResponseThreshold 
              ? HEALTH_STATUS.UNHEALTHY 
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
        
        if (isOk(response.status)) {
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
        } else if (isAuthError(response.status)) {
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
        
        if (isOk(response.status)) {
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
        
        if (isOk(response.status)) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.REPOSITORY,
            status: HEALTH_STATUS.HEALTHY,
            message: 'Repository accessible',
            responseTime
          }, responseTime);
        } else if (isAuthError(response.status)) {
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
        
        if (isOk(response.status)) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.CONSOLE,
            status: HEALTH_STATUS.HEALTHY,
            message: 'System console accessible',
            responseTime
          }, responseTime);
        } else if (isAuthError(response.status)) {
          return createSuccessResult({
            component: HEALTH_COMPONENTS.CONSOLE,
            status: HEALTH_STATUS.UNHEALTHY,
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
    const hasUnhealthy = checks.some(check => check.status === HEALTH_STATUS.UNHEALTHY);
    const overallStatus = hasUnhealthy ? HEALTH_STATUS.UNHEALTHY : HEALTH_STATUS.HEALTHY;
    
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
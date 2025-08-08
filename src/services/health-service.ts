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
  TimeoutMs,
  OperationResult,
  SystemMetrics,
  MemoryMetrics,
  ThreadMetrics,
  RepositoryMetrics,
  BundleMetrics
} from '@/types/index.js';
import {
  createMilliseconds,
  createByteSize,
  createPercentage,
  createThreadCount,
  createBundleCount
} from '@/utils/type-factories.js';
import { AemHttpClient } from '@/services/http-client.js';
import { BundleData } from '@/schemas/bundle-data.schema.js';
import { HTML_PATTERNS, extractFromHTML } from '@/schemas/html-patterns.schema.js';
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

    const metrics = await this.#collectSystemMetrics(instance);
    return this.#aggregateResults(instance, checks, metrics);
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
          const resolvedBundles = bundleData.data?.filter((bundle) => 
            bundle.state === 'Resolved'
          ) ?? [];
          const installedBundles = bundleData.data?.filter((bundle) => 
            bundle.state === 'Installed'
          ) ?? [];
          const fragmentBundles = bundleData.data?.filter((bundle) => 
            bundle.state === 'Fragment'
          ) ?? [];
          
          const problemBundles = resolvedBundles.length + installedBundles.length;
          
          if (problemBundles > 0) {
            return createSuccessResult({
              component: HEALTH_COMPONENTS.BUNDLES,
              status: HEALTH_STATUS.UNHEALTHY,
              message: `${problemBundles} bundles not active (${resolvedBundles.length} resolved, ${installedBundles.length} installed)`,
              responseTime,
              details: {
                total: totalBundles,
                active: activeBundles,
                resolved: resolvedBundles.map((b) => b.symbolicName),
                installed: installedBundles.map((b) => b.symbolicName),
                fragments: fragmentBundles.length
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
              active: activeBundles,
              resolved: [],
              installed: [],
              fragments: fragmentBundles.length
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

  #aggregateResults(instance: AEMInstance, checks: readonly HealthCheckResult[], metrics: SystemMetrics): HealthStatus {
    const hasUnhealthy = checks.some(check => check.status === HEALTH_STATUS.UNHEALTHY);
    const overallStatus = hasUnhealthy ? HEALTH_STATUS.UNHEALTHY : HEALTH_STATUS.HEALTHY;
    
    return {
      instance: instance.url,
      overall: overallStatus,
      timestamp: new Date(),
      checks,
      metrics
    };
  }
  
  async #collectSystemMetrics(instance: AEMInstance): Promise<SystemMetrics> {
    const [memory, threads, repository, bundles] = await Promise.allSettled([
      this.#collectMemoryMetrics(instance),
      this.#collectThreadMetrics(instance),
      this.#collectRepositoryMetrics(instance),
      this.#collectBundleMetrics(instance)
    ]);

    return {
      memory: memory.status === 'fulfilled' ? memory.value : this.#getDefaultMemoryMetrics(),
      threads: threads.status === 'fulfilled' ? threads.value : this.#getDefaultThreadMetrics(),
      repository: repository.status === 'fulfilled' ? repository.value : this.#getDefaultRepositoryMetrics(),
      bundles: bundles.status === 'fulfilled' ? bundles.value : this.#getDefaultBundleMetrics()
    };
  }

  async #collectMemoryMetrics(instance: AEMInstance): Promise<MemoryMetrics> {
    try {
      const response = await this.#httpClient.makeRequest(
        instance,
        '/system/console/memoryusage',
        'GET',
        undefined,
        this.#config.timeout
      );
      
      if (isOk(response.status)) {
        const html = response.data as string;
        
        const heapUsed = createByteSize(extractFromHTML(html, HTML_PATTERNS.heapMemory));
        const heapMax = createByteSize(extractFromHTML(html, HTML_PATTERNS.heapMemoryMax));
        const nonHeapUsed = createByteSize(extractFromHTML(html, HTML_PATTERNS.nonHeapMemory));
        const nonHeapMax = createByteSize(extractFromHTML(html, HTML_PATTERNS.nonHeapMemoryMax));
        
        const percentage = heapMax > 0 
          ? createPercentage((heapUsed / heapMax) * 100)
          : createPercentage(0);

        return {
          heapUsed,
          heapMax,
          nonHeapUsed,
          nonHeapMax,
          percentage
        };
      }
      
      return this.#getDefaultMemoryMetrics();
    } catch (_error) {
      return this.#getDefaultMemoryMetrics();
    }
  }

  async #collectThreadMetrics(instance: AEMInstance): Promise<ThreadMetrics> {
    try {
      const response = await this.#httpClient.makeRequest(
        instance,
        '/system/console/status-Threads',
        'GET',
        undefined,
        this.#config.timeout
      );
      
      if (isOk(response.status)) {
        const html = response.data as string;
        
        const totalThreads = extractFromHTML(html, HTML_PATTERNS.liveThreads);
        const aliveThreads = extractFromHTML(html, HTML_PATTERNS.aliveThreads);
        const interruptedThreads = extractFromHTML(html, HTML_PATTERNS.interruptedThreads);
        
        return {
          total: createThreadCount(totalThreads),
          runnable: createThreadCount(aliveThreads),
          blocked: createThreadCount(0),
          waiting: createThreadCount(0),
          timedWaiting: createThreadCount(0),
          deadlocked: createThreadCount(interruptedThreads)
        };
      }
      
      return this.#getDefaultThreadMetrics();
    } catch (_error) {
      return this.#getDefaultThreadMetrics();
    }
  }

  async #collectRepositoryMetrics(instance: AEMInstance): Promise<RepositoryMetrics> {
    try {
      const response = await this.#httpClient.makeRequest(
        instance,
        '/system/console/repositorycheck',
        'POST',
        'workspace=crx.default&path=%2F&traversal=on&datastoreconsistency=on',
        this.#config.timeout
      );
      
      if (isOk(response.status)) {
        const html = response.data as string;
        
        // Extract metrics from repository check response
        const sizeMatch = html.match(/(\d+(?:,\d+)*)\s+bytes/);
        const nodeCountMatch = html.match(/Traversed\s+(\d+(?:,\d+)*)\s+nodes/);
        const propertiesMatch = html.match(/(\d+(?:,\d+)*)\s+properties/);
        const errorsMatch = html.match(/(\d+)\s+errors found/);
        
        const size = sizeMatch ? parseInt(sizeMatch[1].replace(/,/g, ''), 10) : 0;
        const nodes = nodeCountMatch ? parseInt(nodeCountMatch[1].replace(/,/g, ''), 10) : 0;
        const properties = propertiesMatch ? parseInt(propertiesMatch[1].replace(/,/g, ''), 10) : 0;
        const errors = errorsMatch ? parseInt(errorsMatch[1], 10) : 0;
        
        return {
          size: createByteSize(size),
          nodes,
          errors,
          properties
        };
      }
      
      return this.#getDefaultRepositoryMetrics();
    } catch (_error) {
      return this.#getDefaultRepositoryMetrics();
    }
  }


  async #collectBundleMetrics(instance: AEMInstance): Promise<BundleMetrics> {
    try {
      const response = await this.#httpClient.makeRequest(
        instance,
        '/system/console/bundles.json',
        'GET',
        undefined,
        this.#config.timeout
      );
      
      if (isOk(response.status)) {
        const bundleData = response.data as BundleData;
        const bundles = bundleData.data ?? [];
        
        const active = createBundleCount(
          bundles.filter((b) => b.state === 'Active').length
        );
        const resolved = createBundleCount(
          bundles.filter((b) => b.state === 'Resolved').length
        );
        const installed = createBundleCount(
          bundles.filter((b) => b.state === 'Installed').length
        );
        const fragments = createBundleCount(
          bundles.filter((b) => b.state === 'Fragment').length
        );
        return {
          total: createBundleCount(bundles.length),
          active,
          resolved,
          installed,
          fragments
        };
      }
      
      return this.#getDefaultBundleMetrics();
    } catch (_error) {
      return this.#getDefaultBundleMetrics();
    }
  }

  #getDefaultMemoryMetrics(): MemoryMetrics {
    return {
      heapUsed: createByteSize(0),
      heapMax: createByteSize(0),
      nonHeapUsed: createByteSize(0),
      nonHeapMax: createByteSize(0),
      percentage: createPercentage(0)
    };
  }

  #getDefaultThreadMetrics(): ThreadMetrics {
    return {
      total: createThreadCount(0),
      runnable: createThreadCount(0),
      blocked: createThreadCount(0),
      waiting: createThreadCount(0),
      timedWaiting: createThreadCount(0),
      deadlocked: createThreadCount(0)
    };
  }

  #getDefaultRepositoryMetrics(): RepositoryMetrics {
    return {
      size: createByteSize(0),
      nodes: 0,
      errors: 0,
      properties: 0
    };
  }


  #getDefaultBundleMetrics(): BundleMetrics {
    return {
      total: createBundleCount(0),
      active: createBundleCount(0),
      resolved: createBundleCount(0),
      installed: createBundleCount(0),
      fragments: createBundleCount(0)
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
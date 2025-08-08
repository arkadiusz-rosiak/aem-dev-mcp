import { 
  AEMInstance, 
  SystemDiagnostics, 
  MemoryDiagnostics, 
  ThreadDiagnostics, 
  RepositoryDiagnostics, 
  RequestDiagnostics, 
  BundleDiagnostics,
  RepositoryHealthType,
  REPOSITORY_HEALTH,
  createByteSize,
  createPercentage,
  createThreadCount,
  createMilliseconds,
  createRequestCount,
  createRequestsPerSecond,
  createBundleCount,
  createBundleName,
  TimeoutMs,
  OperationResult
} from '@/types.js';
import { AemHttpClient } from '@/services/http-client.js';
import { getDefaultLogger } from '@/utils/logger.js';
import { HTML_PATTERNS, extractFromHTML } from '@/schemas/html-patterns.schema.js';
import { BundleData } from '@/schemas/bundle-data.schema.js';
import { createSuccessResult, createFailureResult } from '@/utils/operation-result.js';
import { isOk } from '@/utils/http-status.js';
import { TIMEOUTS } from '@/constants/timeouts.js';

interface DiagnosticsConfig {
  readonly timeout: TimeoutMs;
  readonly concurrentChecks: boolean;
}

const DEFAULT_CONFIG: DiagnosticsConfig = {
  timeout: TIMEOUTS.DIAGNOSTICS,
  concurrentChecks: true
} as const;

type DiagnosticsCollector<T> = (instance: AEMInstance) => Promise<OperationResult<T>>;


export class DiagnosticsService {
  readonly #httpClient: AemHttpClient;
  readonly #logger: ReturnType<typeof getDefaultLogger>;
  readonly #config: DiagnosticsConfig;

  constructor(httpClient: AemHttpClient, config: Partial<DiagnosticsConfig> = {}) {
    this.#httpClient = httpClient;
    this.#logger = getDefaultLogger();
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }
  
  async collectDiagnostics(instance: AEMInstance): Promise<SystemDiagnostics> {
    const collectors: readonly DiagnosticsCollector<unknown>[] = [
      this.#createMemoryCollector(),
      this.#createThreadCollector(),
      this.#createRepositoryCollector(),
      this.#createRequestCollector(),
      this.#createBundleCollector()
    ] as const;

    if (this.#config.concurrentChecks) {
      const results = await Promise.allSettled(
        collectors.map(collector => collector(instance))
      );

      return {
        memory: this.#extractResultOrDefault(results[0], this.#getDefaultMemoryDiagnostics()),
        threads: this.#extractResultOrDefault(results[1], this.#getDefaultThreadDiagnostics()),
        repository: this.#extractResultOrDefault(results[2], this.#getDefaultRepositoryDiagnostics()),
        requests: this.#extractResultOrDefault(results[3], this.#getDefaultRequestDiagnostics()),
        bundles: this.#extractResultOrDefault(results[4], this.#getDefaultBundleDiagnostics())
      };
    } else {
      const [memoryResult, threadResult, repositoryResult, requestResult, bundleResult] = await Promise.all([
        collectors[0](instance).catch(() => createFailureResult(new Error('Memory collection failed'))),
        collectors[1](instance).catch(() => createFailureResult(new Error('Thread collection failed'))),
        collectors[2](instance).catch(() => createFailureResult(new Error('Repository collection failed'))),
        collectors[3](instance).catch(() => createFailureResult(new Error('Request collection failed'))),
        collectors[4](instance).catch(() => createFailureResult(new Error('Bundle collection failed')))
      ]);

      return {
        memory: memoryResult.success ? memoryResult.data as MemoryDiagnostics : this.#getDefaultMemoryDiagnostics(),
        threads: threadResult.success ? threadResult.data as ThreadDiagnostics : this.#getDefaultThreadDiagnostics(),
        repository: repositoryResult.success ? repositoryResult.data as RepositoryDiagnostics : this.#getDefaultRepositoryDiagnostics(),
        requests: requestResult.success ? requestResult.data as RequestDiagnostics : this.#getDefaultRequestDiagnostics(),
        bundles: bundleResult.success ? bundleResult.data as BundleDiagnostics : this.#getDefaultBundleDiagnostics()
      };
    }
  }

  #extractResultOrDefault<T>(
    result: PromiseSettledResult<OperationResult<unknown>>, 
    defaultValue: T
  ): T {
    if (result.status === 'fulfilled' && result.value.success) {
      return result.value.data as T;
    }
    return defaultValue;
  }

  #createMemoryCollector(): DiagnosticsCollector<MemoryDiagnostics> {
    return async (instance: AEMInstance): Promise<OperationResult<MemoryDiagnostics>> => {
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
          
          const heapUsed = createByteSize(extractFromHTML(html, HTML_PATTERNS.heapMemory) * 1024);
          const heapMax = createByteSize(extractFromHTML(html, HTML_PATTERNS.heapMemoryMax) * 1024);
          const nonHeapUsed = createByteSize(extractFromHTML(html, HTML_PATTERNS.nonHeapMemory) * 1024);
          const nonHeapMax = createByteSize(extractFromHTML(html, HTML_PATTERNS.nonHeapMemoryMax) * 1024);
          
          const percentage = heapMax > 0 
            ? createPercentage((heapUsed / heapMax) * 100)
            : createPercentage(0);

          return createSuccessResult({
            heapUsed,
            heapMax,
            nonHeapUsed,
            nonHeapMax,
            percentage
          });
        }
        
        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        this.#logger.error(`Failed to get memory info for ${instance.url}`, { error });
        return createFailureResult(error instanceof Error ? error : new Error(String(error)));
      }
    };
  }
  
  #createThreadCollector(): DiagnosticsCollector<ThreadDiagnostics> {
    return async (instance: AEMInstance): Promise<OperationResult<ThreadDiagnostics>> => {
      try {
        const response = await this.#httpClient.makeRequest(
          instance,
          '/system/console/threads',
          'GET',
          undefined,
          this.#config.timeout
        );
        
        if (isOk(response.status)) {
          const html = response.data as string;
          
          return createSuccessResult({
            total: createThreadCount(extractFromHTML(html, HTML_PATTERNS.liveThreads)),
            runnable: createThreadCount(extractFromHTML(html, HTML_PATTERNS.runnableThreads)),
            blocked: createThreadCount(extractFromHTML(html, HTML_PATTERNS.blockedThreads)),
            waiting: createThreadCount(extractFromHTML(html, HTML_PATTERNS.waitingThreads)),
            timedWaiting: createThreadCount(extractFromHTML(html, HTML_PATTERNS.timedWaitingThreads)),
            deadlocked: createThreadCount(extractFromHTML(html, HTML_PATTERNS.deadlockedThreads))
          });
        }
        
        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        this.#logger.error(`Failed to get thread info for ${instance.url}`, { error });
        return createFailureResult(error instanceof Error ? error : new Error(String(error)));
      }
    };
  }
  
  #createRepositoryCollector(): DiagnosticsCollector<RepositoryDiagnostics> {
    return async (instance: AEMInstance): Promise<OperationResult<RepositoryDiagnostics>> => {
      try {
        const indexResponse = await Promise.allSettled([
          this.#httpClient.makeRequest(instance, '/oak:index', 'GET', undefined, this.#config.timeout)
        ]);
        
        let indexHealth: RepositoryHealthType = REPOSITORY_HEALTH.UNKNOWN;
        
        if (indexResponse[0].status === 'fulfilled' && indexResponse[0].value.status === 200) {
          indexHealth = REPOSITORY_HEALTH.HEALTHY;
        } else {
          indexHealth = REPOSITORY_HEALTH.DEGRADED;
        }
        
        return createSuccessResult({
          size: createByteSize(0),
          nodeCount: 0,
          indexHealth,
          revisions: 0
        });
      } catch (error) {
        this.#logger.error(`Failed to get repository info for ${instance.url}`, { error });
        return createFailureResult(error instanceof Error ? error : new Error(String(error)));
      }
    };
  }
  
  #createRequestCollector(): DiagnosticsCollector<RequestDiagnostics> {
    return async (instance: AEMInstance): Promise<OperationResult<RequestDiagnostics>> => {
      try {
        const response = await this.#httpClient.makeRequest(
          instance,
          '/system/console/requests',
          'GET',
          undefined,
          this.#config.timeout
        );
        
        if (isOk(response.status)) {
          const html = response.data as string;
          
          return createSuccessResult({
            averageResponseTime: createMilliseconds(extractFromHTML(html, HTML_PATTERNS.averageResponseTime)),
            requestsPerSecond: createRequestsPerSecond(0),
            activeRequests: createRequestCount(extractFromHTML(html, HTML_PATTERNS.activeRequests)),
            queuedRequests: createRequestCount(extractFromHTML(html, HTML_PATTERNS.queuedRequests)),
            errorRate: createPercentage(extractFromHTML(html, HTML_PATTERNS.errorRate))
          });
        }
        
        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        this.#logger.error(`Failed to get request info for ${instance.url}`, { error });
        return createFailureResult(error instanceof Error ? error : new Error(String(error)));
      }
    };
  }
  
  #createBundleCollector(): DiagnosticsCollector<BundleDiagnostics> {
    return async (instance: AEMInstance): Promise<OperationResult<BundleDiagnostics>> => {
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
          const failed = bundles
            .filter((b) => b.state === 'Installed' || b.state === 'Resolved')
            .map((b) => createBundleName(b.symbolicName));
          
          return createSuccessResult({
            total: createBundleCount(bundles.length),
            active,
            resolved,
            installed,
            failed
          });
        }
        
        throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        this.#logger.error(`Failed to get bundle info for ${instance.url}`, { error });
        return createFailureResult(error instanceof Error ? error : new Error(String(error)));
      }
    };
  }
  
  #getDefaultMemoryDiagnostics(): MemoryDiagnostics {
    return {
      heapUsed: createByteSize(0),
      heapMax: createByteSize(0),
      nonHeapUsed: createByteSize(0),
      nonHeapMax: createByteSize(0),
      percentage: createPercentage(0)
    };
  }
  
  #getDefaultThreadDiagnostics(): ThreadDiagnostics {
    return {
      total: createThreadCount(0),
      runnable: createThreadCount(0),
      blocked: createThreadCount(0),
      waiting: createThreadCount(0),
      timedWaiting: createThreadCount(0),
      deadlocked: createThreadCount(0)
    };
  }
  
  #getDefaultRepositoryDiagnostics(): RepositoryDiagnostics {
    return {
      size: createByteSize(0),
      nodeCount: 0,
      indexHealth: REPOSITORY_HEALTH.UNKNOWN,
      revisions: 0
    };
  }
  
  #getDefaultRequestDiagnostics(): RequestDiagnostics {
    return {
      averageResponseTime: createMilliseconds(0),
      requestsPerSecond: createRequestsPerSecond(0),
      activeRequests: createRequestCount(0),
      queuedRequests: createRequestCount(0),
      errorRate: createPercentage(0)
    };
  }
  
  #getDefaultBundleDiagnostics(): BundleDiagnostics {
    return {
      total: createBundleCount(0),
      active: createBundleCount(0),
      resolved: createBundleCount(0),
      installed: createBundleCount(0),
      failed: []
    };
  }
}